import { useCallback, useSyncExternalStore } from "react";

// Blob URL yang aktif untuk setiap blob. Entri ada hanya selama ada subscriber untuk blob tersebut.
const activeObjectUrls = new WeakMap<Blob, string>();

// Membuat blob URL untuk berkas pratinjau saat komponen subscribe dan mencabutnya saat blob berganti
// atau komponen unmount. Snapshot hanya membaca entri aktif, sehingga URL yang sudah dicabut tidak dikembalikan.
export function usePreviewObjectUrl(blob: Blob | undefined): string | null {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      if (!blob) return () => {};
      const url = URL.createObjectURL(blob);
      activeObjectUrls.set(blob, url);
      onChange();
      return () => {
        activeObjectUrls.delete(blob);
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );

  const getSnapshot = useCallback(
    (): string | null => (blob ? (activeObjectUrls.get(blob) ?? null) : null),
    [blob],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
