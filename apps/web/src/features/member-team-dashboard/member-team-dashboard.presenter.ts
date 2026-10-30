import { useAuthSession } from "../auth/auth-session.context";
import {
  useCategoriesPresenter,
  type CategoriesPresenter,
} from "../categories/categories.presenter";
import { canUploadDocuments } from "../document-upload/document-upload.access";
import {
  useDocumentUploadPresenter,
  type DocumentUploadPresenter,
} from "../document-upload/document-upload.presenter";
import { useRecentDocumentsPresenter } from "../recent-documents/recent-documents.presenter";
import type { RecentDocumentsPresenter } from "../recent-documents/recent-documents.types";
import {
  useSearchDocumentsPresenter,
  type SearchDocumentsPresenter,
} from "../search-documents/search-documents.presenter";
import {
  useTagFilterPresenter,
  useTopTagsPresenter,
  type TagFilterPresenter,
  type TopTagsPresenter,
} from "../top-tags/top-tags.presenter";

export type MemberTeamDashboardPresenter = {
  canUpload: boolean;
  /** true saat kata kunci atau kategori pencarian aktif; panel hasil menggantikan daftar dokumen. */
  isSearching: boolean;
  uploadPresenter: DocumentUploadPresenter;
  tagFilter: TagFilterPresenter;
  documentsPresenter: RecentDocumentsPresenter;
  searchPresenter: SearchDocumentsPresenter;
  categoriesPresenter: CategoriesPresenter;
  topTagsPresenter: TopTagsPresenter;
};

/** Menyusun presenter dasbor anggota tim: filter tag, daftar, pencarian, dan kategori. */
export function useMemberTeamDashboardPresenter(): MemberTeamDashboardPresenter {
  const { user } = useAuthSession();
  const uploadPresenter = useDocumentUploadPresenter();
  const tagFilter = useTagFilterPresenter();
  const documentsPresenter = useRecentDocumentsPresenter(5, tagFilter.activeTagList);
  const searchPresenter = useSearchDocumentsPresenter(tagFilter.activeTagList);
  const categoriesPresenter = useCategoriesPresenter(
    searchPresenter.categoryId,
    searchPresenter.setCategoryFilter,
  );

  const isSearching = searchPresenter.isActive;
  // Konteks Top Tags mengikuti mode: dasbor memakai tag global, pencarian memakai hasilnya (AC-04.01).
  const topTagsPresenter = useTopTagsPresenter({
    context: isSearching ? "search" : "dashboard",
    documentIds: isSearching ? searchPresenter.resultIds : undefined,
    activeTagNames: tagFilter.activeTagList,
  });

  return {
    canUpload: canUploadDocuments(user?.role),
    isSearching,
    uploadPresenter,
    tagFilter,
    documentsPresenter,
    searchPresenter,
    categoriesPresenter,
    topTagsPresenter,
  };
}
