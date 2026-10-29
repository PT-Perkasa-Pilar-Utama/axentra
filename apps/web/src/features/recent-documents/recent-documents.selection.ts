import { useCallback, useMemo, useState } from "react";

type SelectionState = { key: string; ids: ReadonlySet<string> };

const NO_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_SELECTION: SelectionState = { key: "", ids: NO_SELECTION };

export type RecentDocumentsSelection = {
  /** Pilihan yang masih terlihat pada halaman saat ini. */
  selectedIds: ReadonlySet<string>;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
};

/**
 * Pilihan massal terikat pada selectionKey (halaman dan filter). Saat kunci berubah, pilihan lama
 * dibuang agar tidak muncul kembali ketika pengguna kembali ke halaman atau filter tersebut.
 */
export function useRecentDocumentsSelection(
  selectionKey: string,
  visibleIds: ReadonlySet<string>,
): RecentDocumentsSelection {
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const storedIds = selection.key === selectionKey ? selection.ids : NO_SELECTION;
  if (selection.key !== selectionKey && selection.ids.size > 0) {
    setSelection(EMPTY_SELECTION);
  }
  const selectedIds = useMemo(
    () => new Set([...storedIds].filter((id) => visibleIds.has(id))),
    [storedIds, visibleIds],
  );

  const toggleSelect = useCallback(
    (id: string): void => {
      if (!visibleIds.has(id)) return;
      setSelection((current) => {
        const base = current.key === selectionKey ? current.ids : NO_SELECTION;
        const next = new Set([...base].filter((selectedId) => visibleIds.has(selectedId)));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { key: selectionKey, ids: next };
      });
    },
    [selectionKey, visibleIds],
  );

  const clearSelection = useCallback((): void => {
    setSelection({ key: selectionKey, ids: NO_SELECTION });
  }, [selectionKey]);

  return { selectedIds, toggleSelect, clearSelection };
}
