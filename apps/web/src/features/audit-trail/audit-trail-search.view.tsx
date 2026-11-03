import type React from "react";
import { SearchIcon } from "./audit-trail.icons";
import type { AuditTrailPresenter } from "./audit-trail.presenter";

export type AuditTrailSearchViewProps = {
  presenter: AuditTrailPresenter;
};

export function AuditTrailSearchView({ presenter }: AuditTrailSearchViewProps): React.JSX.Element {
  return (
    <label className="audit-trail__search">
      <SearchIcon />
      <span className="sr-only">Cari dokumen atau pengguna</span>
      <input
        onChange={(event) => presenter.setKeyword(event.currentTarget.value)}
        placeholder="Cari dokumen atau pengguna"
        type="search"
        value={presenter.keyword}
      />
    </label>
  );
}
