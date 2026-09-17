# Acceptance Criteria - Sprint 1

Sprint 1 is planned. Source: BA workbook, sheet `Acceptance Criteria`.

## AC-01.01 - Mengunggah satu file yang valid

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya menyeret satu file PDF ke area unggah
And saya melepaskan file tersebut
Then saya melihat pesan sukses: "File diterima untuk diproses"
```

## AC-01.02 - Memastikan file yang diunggah tersimpan

```gherkin
Given saya berhasil mengunggah file "laporan.pdf"
When saya menunggu proses selesai
And saya me-refresh halaman daftar dokumen
Then saya melihat "laporan.pdf" muncul di daftar dokumen terbaru
```

## AC-01.03 - Mencoba mengunggah file yang tidak didukung

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya menyeret file gambar .JPG ke area unggah
Then saya melihat pesan error: "Tipe file tidak didukung"
```

## AC-01.04 - Mengunggah beberapa file sekaligus

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya menyeret tiga file DOCX sekaligus ke area unggah
Then saya melihat notifikasi sukses untuk ketiga file tersebut
```

## AC-02.01 - Mencoba mengunggah file duplikat

```gherkin
Given saya seorang Member Team
And file "laporan-keuangan.pdf" sudah ada di sistem
When saya mencoba mengunggah file lain dengan konten yang sama persis
Then saya melihat pesan error: "File ini sudah ada"
```

## AC-02.02 - Memastikan file duplikat tidak tersimpan

```gherkin
Given saya mencoba mengunggah file duplikat dan mendapat pesan error
When saya memeriksa daftar dokumen terbaru
Then saya tidak melihat file duplikat yang baru diunggah tersebut
```

## AC-02.03 - Mengunggah file yang bukan duplikat

```gherkin
Given saya seorang Member Team
And file "laporan-keuangan.pdf" sudah ada di sistem
When saya mengunggah file "presentasi-baru.pdf" dengan konten yang berbeda
Then saya melihat pesan sukses: "File diterima untuk diproses"
```

## AC-03.01 - Metadata penulis berhasil diekstrak

```gherkin
Given sistem selesai memproses dokumen yang memiliki data penulis
When saya membuka halaman detail dokumen tersebut
Then saya melihat nama penulis yang benar ditampilkan di kolom metadata
```
