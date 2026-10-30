const auditDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

export function formatAuditDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const parts = Object.fromEntries(
    auditDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.day ?? ""}/${parts.month ?? ""}/${parts.year ?? ""} ${parts.hour ?? ""}:${parts.minute ?? ""} WIB`;
}
