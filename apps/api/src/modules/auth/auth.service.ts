import type { AuthUser, LoginRequest, LoginResponse } from "@axentra/shared";
import { DEV_USERS } from "../../middleware/auth";
import { UnauthorizedError } from "../../http/errors";

// TODO(BE-S1-01): Ganti dev auth service dengan implementasi database/JWT sebelum production.

const DEV_PASSWORD = "password123";

export type RefreshResult = {
  token: string;
};

export type LogoutResult = {
  message: string;
};

export type AuthService = {
  login(input: LoginRequest): Promise<LoginResponse>;
  refresh(currentUser: AuthUser): Promise<RefreshResult>;
  logout(currentUser: AuthUser): Promise<LogoutResult>;
};

export function createAuthService(): AuthService {
  return {
    async login(input: LoginRequest): Promise<LoginResponse> {
      // TODO(BE-S1-01): Implementasi verifikasi kredensial asli sebelum production.
      const matched = DEV_USERS.find(
        (user) => user.email.toLowerCase() === input.email.toLowerCase(),
      );

      if (matched === undefined || input.password !== DEV_PASSWORD) {
        throw new UnauthorizedError("Email atau kata sandi salah");
      }

      return {
        user: {
          id: matched.id,
          role: matched.role,
          name: matched.name,
        },
        token: matched.token,
      };
    },

    async refresh(currentUser: AuthUser): Promise<RefreshResult> {
      // TODO(BE-S1-01): Implementasi token refresh asli sebelum production.
      const matched = DEV_USERS.find((user) => user.id === currentUser.id);
      const token = matched !== undefined ? matched.token : `dev-token-${currentUser.id}`;
      return { token };
    },

    async logout(_currentUser: AuthUser): Promise<LogoutResult> {
      // TODO(BE-S1-01): Implementasi invalidasi sesi asli sebelum production.
      return { message: "Logout berhasil" };
    },
  };
}
