import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { MemberTeamDashboardPage } from "./member-team-dashboard.page";
import { AnalyticsPage } from "./analytics.page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";
import { DOCUMENT_UPLOAD_ROLE } from "../features/document-upload/document-upload.access";
import { ANALYTICS_ROLE } from "../features/analytics/analytics.access";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";
import { LoginPage } from "../features/auth/login.view";
import { ProtectedRoute } from "../features/auth/protected-route.view";
import { AuditTrailPage } from "./audit-trail.page";
import { PermissionCategoriesPage } from "./permission-categories.page";
import { AdminDashboardPage } from "./admin-dashboard.page";
import { AdminUsersPage } from "./admin-users.page";
import { AdminDocumentsPage } from "./admin-documents.page";
import { ADMIN_DASHBOARD_PATH, ADMIN_DOCUMENTS_PATH, ADMIN_USERS_PATH } from "./app-shell.menu";
import { resolvePostLoginPath } from "./post-login-path";
import { RootRedirect } from "./root-redirect";

export const router = createBrowserRouter([
  {
    path: "/status",
    element: <FoundationPage />,
  },
  {
    path: "/login",
    element: <LoginPage resolveDestination={resolvePostLoginPath} />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <RootRedirect />,
      },
      {
        path: "/dashboard",
        element: <MemberTeamDashboardPage />,
      },
      {
        path: "/documents/:id",
        element: <DocumentDetailView />,
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["head_of_team", "admin"]} />,
    children: [
      {
        path: "/audit-trail",
        element: <AuditTrailPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["head_of_team"]} />,
    children: [
      {
        path: "/permission-categories",
        element: <PermissionCategoriesPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["admin"]} />,
    children: [
      {
        path: ADMIN_DASHBOARD_PATH,
        element: <AdminDashboardPage />,
      },
      {
        path: ADMIN_USERS_PATH,
        element: <AdminUsersPage />,
      },
      {
        path: ADMIN_DOCUMENTS_PATH,
        element: <AdminDocumentsPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[DOCUMENT_UPLOAD_ROLE]} />,
    children: [
      {
        path: "/upload",
        element: <DocumentUploadPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ANALYTICS_ROLE]} />,
    children: [
      {
        path: "/analytics",
        element: <AnalyticsPage />,
      },
    ],
  },
]);
