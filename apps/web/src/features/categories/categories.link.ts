export const CATEGORY_LINK_PARAM = "categoryId";

/** Tautan ke dasbor dengan kategori yang langsung terfilter. */
export function categoryDashboardLink(dashboardPath: string, categoryId: string): string {
  const params = new URLSearchParams({ [CATEGORY_LINK_PARAM]: categoryId });
  return `${dashboardPath}?${params.toString()}`;
}
