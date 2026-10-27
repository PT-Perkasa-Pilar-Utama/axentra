import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import type { AuthUser } from "@axentra/shared";
import {
  canUploadDocuments,
  DOCUMENT_UPLOAD_ROLE,
} from "../src/features/document-upload/document-upload.access";
import { AuthSessionProvider } from "../src/features/auth/auth-session.context";
import { ProtectedRoute } from "../src/features/auth/protected-route.view";
import type { AuthSession } from "../src/features/auth/session.storage";

function sessionFor(role: AuthUser["role"]): AuthSession {
  return {
    user: { id: `usr-${role}`, email: `${role}@axentra.local`, role },
    token: `ax_${role}`,
  };
}

function renderUploadRoute(session: AuthSession): string {
  return renderToString(
    <MemoryRouter initialEntries={["/upload"]}>
      <AuthSessionProvider initialSession={session}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={[DOCUMENT_UPLOAD_ROLE]} />}>
            <Route path="/upload" element={<div>Halaman Unggah Uji</div>} />
          </Route>
        </Routes>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

describe("canUploadDocuments (C9)", () => {
  test("hanya member_team yang boleh mengunggah dokumen", () => {
    expect(canUploadDocuments("member_team")).toBe(true);
    expect(canUploadDocuments("head_of_team")).toBe(false);
    expect(canUploadDocuments("admin")).toBe(false);
  });

  test("peran kosong atau belum diketahui ditolak", () => {
    expect(canUploadDocuments(null)).toBe(false);
    expect(canUploadDocuments(undefined)).toBe(false);
  });

  test("route /upload menampilkan halaman untuk member_team", () => {
    const html = renderUploadRoute(sessionFor("member_team"));
    expect(html).toContain("Halaman Unggah Uji");
    expect(html).not.toContain("Akses Dibatasi");
  });

  test("route /upload menampilkan 'Akses Dibatasi' untuk head_of_team", () => {
    const html = renderUploadRoute(sessionFor("head_of_team"));
    expect(html).toContain("Akses Dibatasi");
    expect(html).not.toContain("Halaman Unggah Uji");
  });
});
