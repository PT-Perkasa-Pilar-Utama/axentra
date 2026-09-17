# Acceptance Criteria - Index

Source: BA workbook `Doc_BA_DMS (Document Management System)_Versi 1 (1).xlsx`, sheet
`Acceptance Criteria`.

Full Given/When/Then bodies live in the per-phase files under
[`acceptance-criteria-breakdown/`](acceptance-criteria-breakdown/).

## Groups at a Glance

| Group      | User Stories               | AC Count |
| ---------- | -------------------------- | -------- |
| Foundation | Technical foundation       | 6        |
| Sprint 1   | US-01, US-02, US-03        | 8        |
| Sprint 2   | US-04, US-05, US-06, US-07 | 12       |
| Sprint 3   | US-08, US-09, US-10        | 3        |
| Sprint 4   | US-11, US-12, US-13        | 4        |

## Foundation

[Full bodies ->](acceptance-criteria-breakdown/acceptance-criteria-foundation.md)

- AC-FND-01 - Workspace and process boundaries exist.
- AC-FND-02 - Health endpoint returns liveness.
- AC-FND-03 - Readiness endpoint checks dependencies.
- AC-FND-04 - Worker starts and shuts down safely.
- AC-FND-05 - Local infrastructure runs through Docker Compose.
- AC-FND-06 - Quality gates pass.

## Sprint 1

[Full bodies ->](acceptance-criteria-breakdown/acceptance-criteria-sprint-1.md)

- AC-01.01 - Mengunggah satu file yang valid.
- AC-01.02 - Memastikan file yang diunggah tersimpan.
- AC-01.03 - Mencoba mengunggah file yang tidak didukung.
- AC-01.04 - Mengunggah beberapa file sekaligus.
- AC-02.01 - Mencoba mengunggah file duplikat.
- AC-02.02 - Memastikan file duplikat tidak tersimpan.
- AC-02.03 - Mengunggah file yang bukan duplikat.
- AC-03.01 - Metadata penulis berhasil diekstrak.

## Sprint 2

[Full bodies ->](acceptance-criteria-breakdown/acceptance-criteria-sprint-2.md)

- AC-04.01 - Menampilkan filter tag yang tersedia.
- AC-04.02 - Melihat tag otomatis pada dokumen yang telah diupload.
- AC-04.03 - Melakukan filtering dokumen dengan menggunakan single tag.
- AC-04.04 - Melakukan filtering dokumen dengan menggunakan multi-tag.
- AC-05.01 - Mengkategorikan dokumen secara otomatis.
- AC-05.02 - Mengkategorikan beberapa dokumen secara otomatis.
- AC-06.01 - Pencarian berhasil menemukan dokumen.
- AC-06.02 - Hasil pencarian menampilkan informasi yang relevan.
- AC-06.03 - Memastikan pencarian berjalan cepat.
- AC-06.04 - Pencarian tidak menemukan dokumen.
- AC-07.01 - Menampilkan saran dokumen terkait.
- AC-07.02 - Saran yang ditampilkan relevan.

## Sprint 3

[Full bodies ->](acceptance-criteria-breakdown/acceptance-criteria-sprint-3.md)

- AC-08.01 - Melihat preview dokumen.
- AC-09.01 - Mengunduh single dokumen.
- AC-10.01 - Mengunduh dokumen secara massal.

## Sprint 4

[Full bodies ->](acceptance-criteria-breakdown/acceptance-criteria-sprint-4.md)

- AC-11.01 - Melihat metrik total dokumen.
- AC-11.02 - Melihat metrik unggahan terbaru.
- AC-12.01 - Melakukan tracking log unduhan.
- AC-13.01 - Pembatasan hak download berdasarkan kategori dokumen.
