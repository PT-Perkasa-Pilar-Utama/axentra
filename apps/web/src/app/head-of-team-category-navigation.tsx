import { useNavigate } from "react-router";
import type React from "react";

import { categoryDashboardLink } from "../features/categories/categories.link";
import { useCategoriesPresenter } from "../features/categories/categories.presenter";
import { CategoryNavigationView } from "../features/categories/categories.view";
import { DASHBOARD_PATH } from "./app-shell.menu";

/** Sidebar kategori yang sama dengan dasbor; memilih kategori membuka dasbor dengan filter aktif. */
export function HeadOfTeamCategoryNavigation(): React.JSX.Element {
  const navigate = useNavigate();
  const presenter = useCategoriesPresenter(undefined, (id) => {
    if (id) navigate(categoryDashboardLink(DASHBOARD_PATH, id));
  });
  return <CategoryNavigationView presenter={presenter} />;
}
