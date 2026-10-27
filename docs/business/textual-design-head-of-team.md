# Textual Design - Head of Team

Source: BA user stories and acceptance criteria. Figma is the visual reference; this document keeps
the functional text design.

## Analitik

Purpose: show adoption and usage metrics on the page `Dasbor analitik` (menu `Analitik`).

Expected metrics:

- Kartu data: jumlah total dokumen di sistem.
- Kartu data: jumlah dokumen yang diunggah dalam 7 hari terakhir.

## Audit Trail

Purpose: track document download activity.

Expected fields:

- Siapa (User): pengguna yang mengunduh dokumen.
- Apa (Nama Dokumen): nama dokumen yang diunduh.
- Kapan (Waktu): waktu proses unduh dilakukan.

## Permission category

Purpose: control Member Team download permission by category, in the menu `Permission category`.

Expected behavior:

- Head of Team can toggle a category from inactive to active (toggle switch status `inactive` menjadi `Active`).
- When category permission is active, Member Team can download documents in that category.
- New auto-created categories do not receive download permission by default.
- Head of Team must explicitly activate download permission for new categories.
