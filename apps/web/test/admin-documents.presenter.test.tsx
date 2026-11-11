import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAdminDocumentsPresenter,
  type AdminDocumentsPresenter,
} from "../src/features/admin-documents/admin-documents.presenter";
import type { AdminDocument } from "../src/features/admin-documents/admin-documents.api";
import { createDeferred } from "./auth-test-support";

const document: AdminDocument = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  title: "Laporan-Q1-2026.pdf",
  ownerId: "22222222-2222-4222-8222-222222222222",
  ownerName: "Rina Pratama",
  uploadedAt: "2026-04-17T08:00:00.000Z",
  archivedAt: null,
};

const actions: {
  name: string;
  open: (presenter: AdminDocumentsPresenter) => void;
  confirm: (presenter: AdminDocumentsPresenter) => Promise<void>;
  path: string;
  method: string;
  data: { id: string; archivedAt?: string | null; deletedAt?: string };
}[] = [
  {
    name: "archive",
    open: (presenter) => presenter.openArchiveConfirm(document),
    confirm: (presenter) => presenter.confirmArchive(),
    path: `/admin/documents/${document.id}/archive`,
    method: "POST",
    data: { id: document.id, archivedAt: "2026-11-04T03:00:00.000Z" },
  },
  {
    name: "unarchive",
    open: (presenter) =>
      presenter.openUnarchiveConfirm({ ...document, archivedAt: "2026-11-04T03:00:00.000Z" }),
    confirm: (presenter) => presenter.confirmUnarchive(),
    path: `/admin/documents/${document.id}/unarchive`,
    method: "POST",
    data: { id: document.id, archivedAt: null },
  },
  {
    name: "delete",
    open: (presenter) => presenter.openDeleteConfirm(document),
    confirm: (presenter) => presenter.confirmDelete(),
    path: `/admin/documents/${document.id}`,
    method: "DELETE",
    data: { id: document.id, deletedAt: "2026-11-04T03:05:00.000Z" },
  },
];

describe("admin-documents presenter pending guards", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  for (const action of actions) {
    test(`${action.name}: simultaneous confirmations send one request`, async () => {
      const deferred = createDeferred<Response>();
      let requests = 0;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          if (init?.method === action.method && String(input).endsWith(action.path)) {
            requests++;
            return deferred.promise;
          }
          return Response.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
        },
        { preconnect: (): void => {} },
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useAdminDocumentsPresenter(), { wrapper });

      act(() => action.open(result.current));
      let firstRequest: Promise<void> | undefined;
      let secondRequest: Promise<void> | undefined;
      act(() => {
        firstRequest = action.confirm(result.current);
        secondRequest = action.confirm(result.current);
      });
      await waitFor(() => {
        expect(result.current.isMutating).toBe(true);
        expect(requests).toBeGreaterThanOrEqual(1);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const callsWhilePending = requests;

      await act(async () => {
        deferred.resolve(Response.json({ success: true, data: action.data }));
        await Promise.all([firstRequest, secondRequest]);
      });
      await waitFor(() => expect(result.current.isMutating).toBe(false));
      expect(callsWhilePending).toBe(1);
      client.clear();
    });

    test(`${action.name}: confirmation while isMutating is true does not trigger a second request`, async () => {
      const deferred = createDeferred<Response>();
      let requests = 0;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          if (init?.method === action.method && String(input).endsWith(action.path)) {
            requests++;
            return deferred.promise;
          }
          return Response.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
        },
        { preconnect: (): void => {} },
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useAdminDocumentsPresenter(), { wrapper });

      act(() => action.open(result.current));
      let firstRequest: Promise<void> | undefined;
      act(() => {
        firstRequest = action.confirm(result.current);
      });
      await waitFor(() => {
        expect(result.current.isMutating).toBe(true);
        expect(requests).toBe(1);
      });

      await act(async () => {
        await action.confirm(result.current);
      });
      expect(requests).toBe(1);

      await act(async () => {
        deferred.resolve(Response.json({ success: true, data: action.data }));
        await firstRequest;
      });
      await waitFor(() => expect(result.current.isMutating).toBe(false));
      client.clear();
    });

    test(`${action.name}: second confirmation stays blocked while mutation is pending`, async () => {
      const deferred = createDeferred<Response>();
      let requests = 0;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          if (init?.method === action.method && String(input).endsWith(action.path)) {
            requests++;
            return deferred.promise;
          }
          return Response.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
        },
        { preconnect: (): void => {} },
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useAdminDocumentsPresenter(), { wrapper });

      act(() => action.open(result.current));
      let firstRequest: Promise<void> | undefined;
      let secondRequest: Promise<void> | undefined;
      act(() => {
        firstRequest = action.confirm(result.current);
      });
      await waitFor(() => {
        expect(result.current.isMutating).toBe(true);
        expect(requests).toBe(1);
      });
      act(() => {
        secondRequest = action.confirm(result.current);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const callsWhilePending = requests;
      await act(async () => {
        deferred.resolve(Response.json({ success: true, data: action.data }));
        await Promise.all([firstRequest, secondRequest]);
      });
      await waitFor(() => expect(result.current.isMutating).toBe(false));
      expect(callsWhilePending).toBe(1);
      client.clear();
    });

    test(`${action.name}: failure releases the guard so the action can be retried`, async () => {
      const deferred = createDeferred<Response>();
      let requests = 0;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          if (init?.method === action.method && String(input).endsWith(action.path)) {
            requests++;
            return requests === 1
              ? deferred.promise
              : Response.json({ success: true, data: action.data });
          }
          return Response.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
        },
        { preconnect: (): void => {} },
      );
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useAdminDocumentsPresenter(), { wrapper });

      act(() => action.open(result.current));
      let firstRequest: Promise<void> | undefined;
      act(() => {
        firstRequest = action.confirm(result.current);
      });
      await waitFor(() => {
        expect(result.current.isMutating).toBe(true);
        expect(requests).toBe(1);
      });
      await act(async () => {
        deferred.resolve(Response.json({ success: false }, { status: 403 }));
        await firstRequest;
      });
      await waitFor(() => expect(result.current.isMutating).toBe(false));
      expect(result.current.mutationError).toBeTruthy();

      await act(async () => {
        await action.confirm(result.current);
      });
      expect(requests).toBe(2);
      client.clear();
    });
  }
});
