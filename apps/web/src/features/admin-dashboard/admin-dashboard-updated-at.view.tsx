import type React from "react";

export type AdminDashboardUpdatedAtProps = {
  label: string;
};

export function AdminDashboardUpdatedAt({
  label,
}: AdminDashboardUpdatedAtProps): React.JSX.Element {
  return <p className="text-xs text-[#7b828b]">Diperbarui {label}</p>;
}
