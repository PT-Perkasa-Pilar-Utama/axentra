import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";
import { DocumentDetailView } from "../features/document-detail/document-detail.view";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
  {
    path: "/documents/:id",
    element: <DocumentDetailView />,
  },
]);
