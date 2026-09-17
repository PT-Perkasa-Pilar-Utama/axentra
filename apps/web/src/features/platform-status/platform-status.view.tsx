import { usePlatformStatusPresenter } from "./platform-status.presenter";

export function PlatformStatusView(): React.JSX.Element {
  const presenter = usePlatformStatusPresenter();

  if (presenter.status === "loading") {
    return (
      <div className="status-panel" aria-live="polite" aria-busy="true">
        <span className="status-label">API status</span>
        <span className="status-skeleton" />
      </div>
    );
  }

  if (presenter.status === "error") {
    return (
      <div className="status-panel status-panel-error" role="status">
        <div>
          <span className="status-label">API status</span>
          <strong>Belum terhubung</strong>
        </div>
        <button type="button" onClick={presenter.retry}>
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="status-panel" role="status">
      <div>
        <span className="status-label">API status</span>
        <strong>Terhubung</strong>
      </div>
      <span className="status-meta">
        {presenter.service} / v{presenter.version}
      </span>
    </div>
  );
}
