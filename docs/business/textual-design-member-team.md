# Textual Design - Member Team

Source: BA user stories and acceptance criteria. Figma is the visual reference; this document keeps
the functional text design.

## Dashboard

Purpose: primary work surface for upload, search, document discovery, and bulk actions.

Expected areas:

- Drag-and-drop upload area.
- Recent document list.
- Search bar.
- Top Tags filter bar.
- Category menu.
- Selected-document toolbar for bulk download, with the button `Download Selected` (AC-10.01).
- Empty state for no search results, with the copy `Tidak ada hasil yang ditemukan` (AC-06.04).

## Upload Area

Expected behavior:

- Accept one PDF upload.
- Accept multiple DOCX uploads.
- Reject unsupported image files such as `.JPG`.
- Show success message `File diterima untuk diproses`.
- Show duplicate message `File ini sudah ada`.
- Show unsupported type message `Tipe file tidak didukung`.

## Search and Tags

Expected behavior:

- Search by title and content keyword.
- Return results in under 3 seconds.
- Show filename and matching text snippet.
- Show Smart Tags on processed documents, maximum 3 tags per document.
- Show Top Tags and allow single-tag and multi-tag filtering.
- Highlight active tag filters.

## Document Detail

Expected areas:

- Document metadata including extracted author.
- Preview viewer.
- Smart Tags.
- Category.
- "Dokumen Terkait" section.
- "Download" button on the preview page when permission allows it.
