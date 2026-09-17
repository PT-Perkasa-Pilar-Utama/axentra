# Acceptance Criteria - Sprint 3

Sprint 3 is planned. Source: BA workbook, sheet `Acceptance Criteria`.

## AC-08.01 - Melihat preview dokumen

```gherkin
Given saya seorang Member Team
And berada di dasbor
When saya menekan dokumen dengan isi konten finance
Then saya melihat tampilan viewer yang memperlihatkan isi dokumen secara utuh tanpa mengunduh file
```

## AC-09.01 - Mengunduh single dokumen

```gherkin
Given saya seorang Member Team
And berada di halaman preview dokumen
When saya menekan tombol "Download"
Then file terunduh ke perangkat lokal dengan format asli
```

## AC-10.01 - Mengunduh dokumen secara massal

```gherkin
Given saya seorang Member Team
And berada di halaman dasbor
When saya memilih beberapa dokumen yang ingin di-download
And menekan tombol "Download Selected"
Then sistem menggabungkan semua file tersebut ke dalam satu file .zip dan memulai unduhan
```
