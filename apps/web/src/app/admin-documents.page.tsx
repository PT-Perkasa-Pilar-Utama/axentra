import type React from "react";
import {
  ADMIN_DOCUMENTS_PAGE_TITLE,
  AdminDocumentsView,
} from "../features/admin-documents/admin-documents.view";
import { AppShell } from "./app-shell.view";

export function AdminDocumentsPage(): React.JSX.Element {
  return (
    <AppShell role="admin" title={ADMIN_DOCUMENTS_PAGE_TITLE}>
      <AdminDocumentsView />
    </AppShell>
  );
}
