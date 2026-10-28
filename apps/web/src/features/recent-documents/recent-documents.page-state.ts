import { useCallback, useState } from "react";

type PageState = { scope: string; page: number };

export type RecentDocumentsPageState = {
  requestedPage: number;
  setRequestedPage: (page: number) => void;
};

/**
 * Halaman yang diminta terikat pada scope (kombinasi filter tag). Halaman tidak boleh diingat
 * lintas scope: dari halaman 2, memilih tag lalu melepasnya harus kembali ke halaman 1, bukan ke
 * halaman 2 dari scope lama. Karena itu scope yang berbeda langsung dipaksa ke halaman 1.
 */
export function useRecentDocumentsPageState(scope: string): RecentDocumentsPageState {
  const [pageState, setPageState] = useState<PageState>({ scope, page: 1 });
  if (pageState.scope !== scope) {
    setPageState({ scope, page: 1 });
  }
  const requestedPage = pageState.scope === scope ? pageState.page : 1;

  const setRequestedPage = useCallback(
    (page: number): void => {
      setPageState({ scope, page });
    },
    [scope],
  );

  return { requestedPage, setRequestedPage };
}
