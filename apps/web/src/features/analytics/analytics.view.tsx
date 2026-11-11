import type React from "react";
import { ANALYTICS_UPLOAD_WINDOW_DAYS } from "@axentra/shared";
import type { AnalyticsPresenter } from "./analytics.presenter";
import "./analytics.css";

export const ANALYTICS_PAGE_TITLE = "Dasbor analitik";

const numberFormatter = new Intl.NumberFormat("id-ID");

export type AnalyticsViewProps = {
  presenter: AnalyticsPresenter;
};

const CONTOUR_RADII = [26, 38, 50, 62, 74] as const;

type MetricCardProps = {
  id: string;
  label: string;
  value: number;
};

/** Pola kontur dekoratif di sisi kanan kartu, sesuai desain US-11. */
function CardContour(): React.JSX.Element {
  return (
    <svg
      className="analytics-card-contour"
      viewBox="0 0 160 114"
      aria-hidden="true"
      focusable="false"
    >
      {CONTOUR_RADII.map((radius) => (
        <circle key={radius} cx="150" cy="36" r={radius} />
      ))}
    </svg>
  );
}

function MetricCard({ id, label, value }: MetricCardProps): React.JSX.Element {
  const headingId = `analytics-${id}-label`;
  return (
    <li>
      <section className="analytics-card" aria-labelledby={headingId}>
        <CardContour />
        <h2 id={headingId}>{label}</h2>
        <p className="analytics-card-value">{numberFormatter.format(value)}</p>
      </section>
    </li>
  );
}

export function AnalyticsView({ presenter }: AnalyticsViewProps): React.JSX.Element {
  const { summary, isLoading, isError, retry } = presenter;

  return (
    <section className="analytics-view" aria-label={ANALYTICS_PAGE_TITLE}>
      {isLoading && <p role="status">Memuat data analitik...</p>}
      {isError && !isLoading && (
        <div role="alert" className="analytics-error">
          <p>Data analitik gagal dimuat.</p>
          <button type="button" onClick={() => void retry()}>
            Coba lagi
          </button>
        </div>
      )}
      {summary && !isLoading && (
        <ul className="analytics-cards" aria-label="Metrik dokumen">
          <MetricCard id="total" label="Total dokumen" value={summary.totalDocuments} />
          <MetricCard
            id="recent"
            label={`Unggahan ${ANALYTICS_UPLOAD_WINDOW_DAYS} hari terakhir`}
            value={summary.uploadedLast7Days}
          />
        </ul>
      )}
    </section>
  );
}
