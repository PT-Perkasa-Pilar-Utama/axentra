import type { RecentDocument } from "./recent-documents.api";

export type DocumentSmartTagItem = {
  id: string;
  name: string;
};

export type DocumentSmartTagsState = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  tags: DocumentSmartTagItem[];
  retry: () => void;
};

export type RecentDocumentItem = {
  id: string;
  filename: string;
  dateLabel: string;
  statusLabel: string;
  processingStatus: RecentDocument["processingStatus"];
  smartTags: DocumentSmartTagsState;
  isSelected: boolean;
  category: {
    isLoading: boolean;
    isError: boolean;
    name: string | null;
    retry: () => void;
  };
};

export type RecentDocumentsPagination = {
  /** Halaman yang ditampilkan, sudah dibatasi ke rentang [1, totalPages]. */
  page: number;
  totalPages: number;
  /** Indikator halaman, mis. "Halaman 2 dari 3". */
  pageLabel: string;
  /** Navigasi dinonaktifkan saat tidak ada halaman tujuan atau halaman baru sedang dimuat. */
  canGoPrevious: boolean;
  canGoNext: boolean;
  /** true saat halaman baru sedang dimuat. */
  isChanging: boolean;
  goToPage: (page: number) => void;
  goToPrevious: () => void;
  goToNext: () => void;
};

export type RecentDocumentsPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  hasItems: boolean;
  items: RecentDocumentItem[];
  pagination: RecentDocumentsPagination;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  selectedIds: ReadonlySet<string>;
  isDownloading: boolean;
  downloadError: string | null;
  /** false saat tidak ada dokumen terpilih atau unduhan sedang berjalan. */
  canDownloadSelected: boolean;
  downloadDisabledReason: string | undefined;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  downloadSelected: () => Promise<void>;
};
