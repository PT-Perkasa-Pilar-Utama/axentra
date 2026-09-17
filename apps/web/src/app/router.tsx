import { createBrowserRouter } from "react-router";
import { FoundationPage } from "./foundation-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
]);
