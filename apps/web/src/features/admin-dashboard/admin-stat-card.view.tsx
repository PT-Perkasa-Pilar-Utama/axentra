import type React from "react";

export type AdminStatCardProps = {
  id: string;
  label: string;
  value: string;
  caption?: string | undefined;
};

export function AdminStatCard({
  id,
  label,
  value,
  caption,
}: AdminStatCardProps): React.JSX.Element {
  const labelId = `${id}-label`;

  return (
    <section
      aria-labelledby={labelId}
      className="rounded-2xl border border-[#e3e6ea] bg-white p-5"
      data-testid={id}
    >
      <h2 id={labelId} className="text-sm font-normal text-[#5b626b]">
        {label}
      </h2>
      <p className="mt-2 text-3xl font-semibold leading-none text-[#252930]">{value}</p>
      {caption && <p className="mt-2 text-xs text-[#7b828b]">{caption}</p>}
    </section>
  );
}
