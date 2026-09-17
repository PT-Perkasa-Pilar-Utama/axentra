import type { DocumentUploadPresenter } from "./document-upload.presenter";

export type DocumentUploadNotificationViewProps = {
  presenter: DocumentUploadPresenter;
};

export function DocumentUploadNotificationView({
  presenter,
}: DocumentUploadNotificationViewProps): React.JSX.Element | null {
  const { notification, dismissNotification } = presenter;
  if (!notification) return null;

  const isSuccess = notification.type === "success";

  return (
    <div
      className={`upload-notification flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
        isSuccess
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-rose-50 border-rose-200 text-rose-800"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            isSuccess ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
          }`}
          aria-hidden="true"
        >
          {isSuccess ? "✓" : "✕"}
        </span>
        <span>{notification.message}</span>
      </div>
      <button
        type="button"
        onClick={dismissNotification}
        className="text-gray-400 hover:text-gray-600 focus:outline-none text-base font-bold p-1 leading-none cursor-pointer"
        aria-label="Tutup notifikasi"
      >
        ✕
      </button>
    </div>
  );
}
