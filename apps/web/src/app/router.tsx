import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { MemberTeamDashboardPage } from "./member-team-dashboard.page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";
import { LoginPage } from "../features/auth/login.view";
import { ProtectedRoute } from "../features/auth/protected-route.view";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
  {
    path: "/dashboard",
    element: <MemberTeamDashboardPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <FoundationPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/upload",
        element: <DocumentUploadPage />,
      },
      {
        path: "/documents/:id",
        element: <DocumentDetailView />,
      },
    ],
  },
]);
