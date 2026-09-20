import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { DocumentUploadPage } from "../features/document-upload/document-upload.view";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
  {
    path: "/upload",
    element: <DocumentUploadPage />,
  },
]);
