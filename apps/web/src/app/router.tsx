import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { MemberTeamDashboardPage } from "./member-team-dashboard.page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";
import { DOCUMENT_UPLOAD_ROLE } from "../features/document-upload/document-upload.access";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";
import { LoginPage } from "../features/auth/login.view";
import { ProtectedRoute } from "../features/auth/protected-route.view";
import { AuditTrailView } from "../features/audit-trail/audit-trail.view";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
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
        element: <AuditTrailView />,
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
]);
