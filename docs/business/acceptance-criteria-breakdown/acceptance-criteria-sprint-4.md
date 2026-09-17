# Acceptance Criteria - Sprint 4

Sprint 4 is planned. Source: BA workbook, sheet `Acceptance Criteria`.

## AC-11.01 - Melihat metrik total dokumen

```gherkin
Given saya seorang Ketua Tim
And saya berada di halaman Analitik
When saya melihat Dasbor analitik
Then saya melihat kartu data yang menampilkan jumlah total dokumen di sistem
```

## AC-11.02 - Melihat metrik unggahan terbaru

```gherkin
Given saya seorang Ketua Tim
And saya berada di halaman Analitik
When saya melihat Dasbor analitik
Then saya melihat kartu data yang menampilkan jumlah dokumen yang diunggah dalam 7 hari terakhir
```

## AC-12.01 - Melakukan Tracking Log Unduhan

```gherkin
Given saya seorang Head of Team
And berada di menu Audit Trail
When saya membuka halaman audit trail
Then tampil informasi detail: Siapa atau User, Apa atau Nama Dokumen, dan Kapan atau Waktu proses download dilakukan
```

## AC-13.01 - Pembatasan Hak Download berdasarkan kategori dokumen

```gherkin
Given saya seorang Head of Team
And berada di menu Permission category
When saya menekan toggle switch dari status inactive menjadi "Active" pada kategori "Reporting"
Then Member Team dapat melakukan download dokumen pada kategori "Reporting"
```
