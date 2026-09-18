import { randomBytes, randomUUID } from "node:crypto";
import type { AuthUser, LoginRequest, LoginResponse } from "@axentra/shared";
import type { TokenVerifier } from "../../middleware/auth";
import { UnauthorizedError } from "../../http/errors";

export type SessionRecord = {
  id: string;
  token: string;
  refreshToken: string;
  user: AuthUser;
  expiresAt: number;
  refreshExpiresAt: number;
  revoked: boolean;
};

export type RefreshResult = {
  token: string;
  refreshToken: string;
};

export type LogoutResult = {
  message: string;
};

export type UserAuthenticator = (
  credentials: LoginRequest,
) => Promise<AuthUser | null> | AuthUser | null;

export type AuthService = {
  login(input: LoginRequest): Promise<LoginResponse>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  logout(token: string): Promise<LogoutResult>;
  tokenVerifier: TokenVerifier;
};

export type AuthServiceOptions = {
  authenticator?: UserAuthenticator;
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
  clock?: () => number;
};

const DEFAULT_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuthService(options: AuthServiceOptions = {}): AuthService {
  const {
    authenticator = () => null,
    accessTokenTtlMs = DEFAULT_ACCESS_TOKEN_TTL_MS,
    refreshTokenTtlMs = DEFAULT_REFRESH_TOKEN_TTL_MS,
    clock = () => Date.now(),
  } = options;

  const sessionsByToken = new Map<string, SessionRecord>();
  const sessionsByRefreshToken = new Map<string, SessionRecord>();

  function createSession(user: AuthUser): SessionRecord {
    const now = clock();
    const session: SessionRecord = {
      id: randomUUID(),
      token: `ax_${randomUUID().replace(/-/g, "")}_${randomBytes(16).toString("hex")}`,
      refreshToken: `ax_rt_${randomUUID().replace(/-/g, "")}_${randomBytes(16).toString("hex")}`,
      user,
      expiresAt: now + accessTokenTtlMs,
      refreshExpiresAt: now + refreshTokenTtlMs,
      revoked: false,
    };

    sessionsByToken.set(session.token, session);
    sessionsByRefreshToken.set(session.refreshToken, session);
    return session;
  }

  const tokenVerifier: TokenVerifier = {
    verifyToken(token: string): AuthUser | null {
      const session = sessionsByToken.get(token);
      if (!session || session.revoked) {
        return null;
      }
      if (clock() >= session.expiresAt) {
        return null;
      }
      return session.user;
    },
  };

  return {
    tokenVerifier,

    async login(input: LoginRequest): Promise<LoginResponse> {
      const user = await authenticator(input);
      if (!user) {
        throw new UnauthorizedError("Email atau kata sandi salah");
      }

      const session = createSession(user);
      return {
        user: session.user,
        token: session.token,
        refreshToken: session.refreshToken,
      };
    },

    async refresh(refreshToken: string): Promise<RefreshResult> {
      const session = sessionsByRefreshToken.get(refreshToken);
      if (!session || session.revoked) {
        throw new UnauthorizedError("Token tidak valid atau telah kedaluwarsa");
      }

      if (clock() >= session.refreshExpiresAt) {
        throw new UnauthorizedError("Token tidak valid atau telah kedaluwarsa");
      }

      // Revoke current session (refresh token rotation)
      session.revoked = true;
      sessionsByToken.delete(session.token);
      sessionsByRefreshToken.delete(session.refreshToken);

      // Issue new session
      const newSession = createSession(session.user);
      return {
        token: newSession.token,
        refreshToken: newSession.refreshToken,
      };
    },

    async logout(token: string): Promise<LogoutResult> {
      const session = sessionsByToken.get(token);
      if (session) {
        session.revoked = true;
        sessionsByToken.delete(session.token);
        sessionsByRefreshToken.delete(session.refreshToken);
      }
      return { message: "Logout berhasil" };
    },
  };
}
