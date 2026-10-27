import { randomUUID } from "node:crypto";
import type { AuthUser, LoginRequest, LoginResponse } from "@axentra/shared";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier } from "../../middleware/auth";
import { TooManyRequestsError, UnauthorizedError } from "../../http/errors";
import { ACCESS_TOKEN_TTL_MS, computeRefreshExpiry } from "./auth.policy";
import {
  generateAccessToken,
  generateRefreshToken,
  normalizeEmail,
  sha256Hex,
} from "./auth.tokens";
import type { AuthSessionRecord, AuthSessionStore, LoginAttemptStore } from "./auth.types";

// The refresh token and remember_me travel to the handler, which sets the cookie and keeps them out of the body.
export type IssuedSession = LoginResponse & {
  refreshToken: string;
  rememberMe: boolean;
};

export type LogoutResult = {
  message: string;
};

export type UserAuthenticator = (
  credentials: LoginRequest,
) => Promise<AuthUser | null> | AuthUser | null;

export type AuthService = {
  login(input: LoginRequest): Promise<IssuedSession>;
  refresh(refreshToken: string | undefined): Promise<IssuedSession>;
  logout(refreshToken: string | undefined): Promise<LogoutResult>;
  tokenVerifier: TokenVerifier;
};

export type AuthServiceOptions = {
  authenticator: UserAuthenticator;
  sessionStore: AuthSessionStore;
  loginAttemptStore: LoginAttemptStore;
  clock?: (() => Date) | undefined;
};

const INVALID_CREDENTIALS_MESSAGE = "Email atau kata sandi salah";
const INVALID_SESSION_MESSAGE = "Token tidak valid atau telah kedaluwarsa";
const LOGIN_LOCKED_MESSAGE = "Terlalu banyak percobaan masuk. Silakan coba beberapa saat lagi.";
const LOGOUT_MESSAGE = "Logout berhasil";

type TokenSet = {
  token: string;
  refreshToken: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
};

function createTokenSet(now: Date): TokenSet {
  const token = generateAccessToken();
  const refreshToken = generateRefreshToken();
  return {
    token,
    refreshToken,
    accessTokenHash: sha256Hex(token),
    refreshTokenHash: sha256Hex(refreshToken),
    accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
  };
}

function isAccessUsable(session: AuthSessionRecord, now: Date): boolean {
  return (
    session.revokedAt === null &&
    session.accessExpiresAt.getTime() > now.getTime() &&
    session.refreshExpiresAt.getTime() > now.getTime()
  );
}

function isRefreshUsable(session: AuthSessionRecord, now: Date): boolean {
  return session.revokedAt === null && session.refreshExpiresAt.getTime() > now.getTime();
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const { authenticator, sessionStore, loginAttemptStore } = options;
  const clock = options.clock ?? (() => new Date());

  const tokenVerifier: TokenVerifier = {
    async verifyToken(token: string): Promise<AuthUser | null> {
      const session = await sessionStore.findByAccessTokenHash(sha256Hex(token));
      if (session === null || !isAccessUsable(session, clock())) return null;
      return session.user;
    },
  };

  return {
    tokenVerifier,

    async login(input: LoginRequest): Promise<IssuedSession> {
      const now = clock();
      const emailHash = sha256Hex(normalizeEmail(input.email));
      const decision = await loginAttemptStore.reserve(emailHash, now);
      if (!decision.allowed) throw new TooManyRequestsError(LOGIN_LOCKED_MESSAGE);

      const user = await authenticator(input);
      if (!user) throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
      await loginAttemptStore.reset(emailHash);

      const rememberMe = input.rememberMe ?? false;
      const tokens = createTokenSet(now);
      await sessionStore.createSession({
        id: randomUUID(),
        user,
        rememberMe,
        accessTokenHash: tokens.accessTokenHash,
        refreshTokenHash: tokens.refreshTokenHash,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: computeRefreshExpiry({ now, rememberMe, createdAt: now }),
        now,
      });
      return issued(user, tokens, rememberMe);
    },

    async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
      if (!isPresent(refreshToken)) throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
      const now = clock();
      const presentedHash = sha256Hex(refreshToken);
      const match = await sessionStore.findByRefreshTokenHash(presentedHash);
      if (match === null) throw new UnauthorizedError(INVALID_SESSION_MESSAGE);

      if (!match.current) {
        // A rotated refresh token was presented again: the whole session is treated as compromised.
        await sessionStore.revokeSession(match.session.id, now);
        throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
      }

      const { session } = match;
      if (!isRefreshUsable(session, now)) throw new UnauthorizedError(INVALID_SESSION_MESSAGE);

      const tokens = createTokenSet(now);
      const rotated = await sessionStore.rotateSession({
        sessionId: session.id,
        presentedRefreshTokenHash: presentedHash,
        accessTokenHash: tokens.accessTokenHash,
        refreshTokenHash: tokens.refreshTokenHash,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: computeRefreshExpiry({
          now,
          rememberMe: session.rememberMe,
          createdAt: session.createdAt,
        }),
        now,
      });
      if (!rotated) {
        // A concurrent request rotated this refresh token first, so the presented token is reused.
        await sessionStore.revokeSession(session.id, now);
        throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
      }
      return issued(session.user, tokens, session.rememberMe);
    },

    async logout(refreshToken: string | undefined): Promise<LogoutResult> {
      if (isPresent(refreshToken)) {
        const match = await sessionStore.findByRefreshTokenHash(sha256Hex(refreshToken));
        if (match !== null) await sessionStore.revokeSession(match.session.id, clock());
      }
      return { message: LOGOUT_MESSAGE };
    },
  };
}

function issued(user: AuthUser, tokens: TokenSet, rememberMe: boolean): IssuedSession {
  return {
    user,
    token: tokens.token,
    expiresAt: tokens.accessExpiresAt.toISOString(),
    refreshToken: tokens.refreshToken,
    rememberMe,
  };
}

// Used when no auth service is injected. Every credential login fails and every refresh is rejected.
export function createUnconfiguredAuthService(): AuthService {
  return {
    tokenVerifier: defaultTokenVerifier,
    async login(): Promise<IssuedSession> {
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
    },
    async refresh(): Promise<IssuedSession> {
      throw new UnauthorizedError(INVALID_SESSION_MESSAGE);
    },
    async logout(): Promise<LogoutResult> {
      return { message: LOGOUT_MESSAGE };
    },
  };
}
