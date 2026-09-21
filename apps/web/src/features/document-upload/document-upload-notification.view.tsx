import type React from "react";
import type { DocumentUploadPresenter } from "./document-upload.presenter";

const fileOutlinePaths = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
  "M14 2v4a2 2 0 0 0 2 2h4",
];
const toastIconPaths = {
  success: [...fileOutlinePaths, "m9 15 2 2 4-4"],
  error: [...fileOutlinePaths, "m14.5 12.5-5 5", "m9.5 12.5 5 5"],
} as const;

export type DocumentUploadNotificationViewProps = {
  presenter: DocumentUploadPresenter;
};

export function DocumentUploadNotificationView({
  presenter,
}: DocumentUploadNotificationViewProps): React.JSX.Element | null {
  const { notification, dismissNotification } = presenter;
  if (!notification) return null;

  const isSuccess = notification.type === "success";
  const iconPaths = isSuccess ? toastIconPaths.success : toastIconPaths.error;

  return (
    <div
      data-testid="upload-notification"
      className={`upload-notification fixed left-1/2 top-20 z-50 flex w-[min(550px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-4 px-6 py-4 rounded-xl text-sm text-gray-900 shadow-md backdrop-blur-sm transition-all ${
        isSuccess ? "bg-[#c9f0dc]/90" : "bg-[#f0a7a7]/90"
      }`}
      role="alert"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconPaths.map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
      <p className="min-w-0 flex-1">
        <span>{isSuccess ? "Upload berhasil." : "Upload gagal."}</span>{" "}
        <span data-testid="notification-message">{notification.message}</span>
      </p>
      <button
        type="button"
        onClick={dismissNotification}
        className="shrink-0 p-1 text-gray-900 hover:opacity-70 focus:outline-none cursor-pointer"
        aria-label="Tutup notifikasi"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
