import type { AuthUser, LoginResponse } from "@axentra/shared";

export const EXPIRES_AT = "2026-10-27T12:00:00.000Z";

export const memberUser: AuthUser = {
  id: "usr-001",
  email: "member@axentra.local",
  role: "member_team",
  name: "Budi Santoso",
};

export const otherUser: AuthUser = {
  id: "usr-002",
  email: "head@axentra.local",
  role: "head_of_team",
  name: "Siti Rahma",
};

export function loginResponseFor(token: string, user: AuthUser = memberUser): LoginResponse {
  return { user, token, expiresAt: EXPIRES_AT };
}

export function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: (): void => {} });
}

export function okResponse(): Response {
  return new Response(JSON.stringify({ success: true, data: { status: "ok" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Sesi berakhir" } }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

/** Mock fetch yang hanya menerima satu bearer token; token lain dijawab 401. */
export function fetchAcceptingToken(acceptedToken: string): typeof fetch {
  return createMockFetch(async (_input, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    return authorization === `Bearer ${acceptedToken}` ? okResponse() : unauthorizedResponse();
  });
}

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export function createDeferred<T>(): Deferred<T> {
  const handlers: { resolve?: (value: T) => void; reject?: (error: unknown) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    handlers.resolve = resolve;
    handlers.reject = reject;
  });
  return {
    promise,
    resolve: (value) => handlers.resolve?.(value),
    reject: (error) => handlers.reject?.(error),
  };
}

/**
 * Pengganti navigator.locks untuk tes: kunci eksklusif per nama yang diserialkan seperti Web Locks,
 * mencatat nama yang diminta dan jumlah callback yang berjalan bersamaan.
 */
export type FakeLockManager = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
  requests: string[];
  running: () => number;
  peakRunning: () => number;
};

export function createFakeLockManager(): FakeLockManager {
  const tails = new Map<string, Promise<unknown>>();
  const requests: string[] = [];
  const counters = { running: 0, peak: 0 };

  function request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    requests.push(name);
    const previous = tails.get(name) ?? Promise.resolve();
    const run = async (): Promise<T> => {
      try {
        await previous;
      } catch {
        // Pemegang sebelumnya gagal; lock tetap dilepas untuk antrean berikutnya.
      }
      counters.running += 1;
      counters.peak = Math.max(counters.peak, counters.running);
      try {
        return await callback();
      } finally {
        counters.running -= 1;
      }
    };
    const result = run();
    tails.set(name, result);
    return result;
  }

  return { request, requests, running: () => counters.running, peakRunning: () => counters.peak };
}

/**
 * Memasang nilai navigator.locks untuk satu tes. happy-dom mengisinya dengan null, jadi cabang
 * "tanpa Web Locks" adalah keadaan default; kembalikan fungsi pemulih untuk afterEach.
 */
export function installNavigatorLocks(value: FakeLockManager | null | undefined): () => void {
  Object.defineProperty(navigator, "locks", { value, configurable: true, writable: true });
  return () => {
    Reflect.deleteProperty(navigator, "locks");
  };
}
