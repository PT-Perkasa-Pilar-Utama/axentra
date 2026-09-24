import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";
import { LoginPage } from "../features/auth/login.view";

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
    path: "/upload",
    element: <DocumentUploadPage />,
  },
  {
    path: "/documents/:id",
    element: <DocumentDetailView />,
  },
]);
