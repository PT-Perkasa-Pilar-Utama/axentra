import type React from "react";

export type AdminRoleBreakdownRow = {
  id: string;
  label: string;
  countLabel: string;
  widthPercent: number;
};

export type AdminRoleBreakdownProps = {
  title: string;
  description: string;
  rows: readonly AdminRoleBreakdownRow[];
  footer?: React.ReactNode;
};

export function AdminRoleBreakdown({
  title,
  description,
  rows,
  footer,
}: AdminRoleBreakdownProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="admin-role-breakdown-title"
      className="rounded-2xl border border-[#e3e6ea] bg-white p-6"
    >
      <h2 id="admin-role-breakdown-title" className="text-base font-semibold text-[#252930]">
        {title}
      </h2>
      <p className="mt-1 text-xs text-[#7b828b]">{description}</p>

      <ul className="mt-5 space-y-4">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-center justify-between text-sm text-[#252930]">
              <span>{row.label}</span>
              <span className="font-semibold">{row.countLabel}</span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-[#e6e9ec]">
              <div
                className="h-2 rounded-full bg-[#65a448]"
                data-testid={`admin-role-bar-${row.id}`}
                style={{ width: `${row.widthPercent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {footer && <div className="mt-4 text-xs text-[#7b828b]">{footer}</div>}
    </section>
  );
}
