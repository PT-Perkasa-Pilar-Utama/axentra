import type React from "react";

export function SessionLoadingView(): React.JSX.Element {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center p-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#214e30]" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Memuat sesi...
        </span>
      </div>
    </div>
  );
}
