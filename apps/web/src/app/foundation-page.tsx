import { PlatformStatusView } from "../features/platform-status/platform-status.view";
import { UserSessionBadge } from "../features/auth/user-session-badge.view";

const boundaries = [
  ["Web", "React, Vite, Router, Query"],
  ["API", "Hono on Bun"],
  ["Worker", "Independent Bun process"],
  ["Data", "PostgreSQL, Redis, MinIO"],
] as const;

export function FoundationPage(): React.JSX.Element {
  return (
    <main className="foundation-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Axentra Foundation">
          AXENTRA
        </a>
        <div className="flex items-center gap-4">
          <UserSessionBadge />
          <span>Foundation v1.0.0</span>
        </div>
      </header>

      <section className="intro" aria-labelledby="foundation-title">
        <p className="context-line">Document Management System</p>
        <h1 id="foundation-title">Centralize. Organize. Control.</h1>
        <p>
          Fondasi engineering untuk proses Web, API, dan Worker yang terpisah dalam satu modular
          monolith. Fitur bisnis belum diaktifkan pada rilis ini.
        </p>
      </section>

      <section className="foundation-grid" aria-label="Batas proses Axentra">
        {boundaries.map(([title, detail]) => (
          <article key={title}>
            <span>{title}</span>
            <strong>{detail}</strong>
          </article>
        ))}
      </section>

      <PlatformStatusView />

      <footer>
        <span>Engineering foundation only</span>
        <span>Secure defaults / explicit boundaries</span>
      </footer>
    </main>
  );
}
