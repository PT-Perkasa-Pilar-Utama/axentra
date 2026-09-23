import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
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
