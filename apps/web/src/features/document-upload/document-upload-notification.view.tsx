import type React from "react";
import type {
  UploadNotificationTone,
  UploadNotificationView,
} from "./document-upload-area.presenter";

const fileOutlinePaths = [
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
  "M14 2v4a2 2 0 0 0 2 2h4",
];

const toastIconPaths: Record<UploadNotificationTone, readonly string[]> = {
  success: [...fileOutlinePaths, "m9 15 2 2 4-4"],
  error: [...fileOutlinePaths, "m14.5 12.5-5 5", "m9.5 12.5 5 5"],
};

const toastToneClass: Record<UploadNotificationTone, string> = {
  success: "bg-[#c9f0dc]",
  error: "bg-[#f0a7a7]",
};

export type DocumentUploadNotificationViewProps = {
  notification: UploadNotificationView | null;
  onDismiss: () => void;
};

export function DocumentUploadNotificationView({
  notification,
  onDismiss,
}: DocumentUploadNotificationViewProps): React.JSX.Element | null {
  if (!notification) return null;

  return (
    <div
      data-testid="upload-notification"
      className={`upload-notification fixed z-50 flex w-full max-w-md items-center gap-4 rounded-xl px-6 py-4 text-sm text-gray-900 shadow-md transition-all ${toastToneClass[notification.tone]}`}
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
        {toastIconPaths[notification.tone].map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
      <div className="min-w-0 flex-1">
        <p data-testid="notification-message">{notification.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
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
