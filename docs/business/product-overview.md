# Product Overview

Source: BA workbook `Doc_BA_DMS (Document Management System)_Versi 1 (2).xlsx`, sheet
`Product Overview`.

## Product Identification

| Field             | Value                              |
| ----------------- | ---------------------------------- |
| Product ID        | PRD-018                            |
| Product Name      | DMS - Document Management System   |
| Client Name       | PT. Perkasa Pilar Utama (Internal) |
| Category          | Document Management                |
| BA Name           | Azizah                             |
| Start Date        | 29 December 2025                   |
| Target Completion | Not specified                      |

## Feature Context

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Nama Fitur/Modul | DMS - Document Management System |
| Persona Utama    | Member Team, Head of Team        |

## Persona

| Persona      | Sumber                           | Keterangan                                                                                                                                              |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Member Team  | BA workbook (Persona Utama)      | Mengunggah, mencari, melihat preview, dan mengunduh dokumen.                                                                                            |
| Head of Team | BA workbook (Persona Utama)      | Melihat analitik, audit trail, dan mengatur izin unduh per kategori.                                                                                    |
| Admin        | Usulan, belum ada di BA workbook | Mengelola akun dan dokumen milik Member Team dan Head of Team. Rincian usulan: [proposals/admin-role-proposal.md](../proposals/admin-role-proposal.md). |

## Tujuan Bisnis

- Mendigitalisasi dan mensentralisasi seluruh dokumen ke dalam satu platform yang terorganisir.
- Meminimalkan waktu yang terbuang untuk tugas administratif manual (input data/tagging).

## Problem Statement

Proses input dokumen, pemberian tag, dan pengarsipan dokumen ke folder dilakukan secara manual,
sehingga memakan waktu dan rentan kesalahan (human error). Pencarian dokumen seringkali lambat dan
tidak akurat karena bergantung pada nama file yang tidak standar. Tidak adanya pengawasan (audit
trail) terhadap siapa yang mengunduh dokumen sensitif. Banyaknya dokumen duplikat yang
membingungkan pengguna dalam mencari versi terbaru.

## Solution Overview

Menggunakan teknologi AI/OCR untuk membaca konten secara otomatis, menghasilkan Smart Tags, dan
menempatkan dokumen ke kategori yang relevan segera setelah diunggah via Drag and Drop. Pencarian
yang sangat responsif yang memberikan hasil instan (< 3 detik) saat pengguna mengetik, dan sistem
perizinan yang cukup ketat.

Catatan: teks BA tertulis "sangat pengguna mengetik". Diduga typo untuk "saat pengguna mengetik".
Menunggu konfirmasi BA.

## Expected Impact

- Pengurangan waktu unggah dan pengarsipan hingga 80% melalui otomatisasi.
- Penemuan informasi krusial dalam hitungan detik (target < 3 detik).
- Bersih dari duplikat dan terorganisir secara konsisten oleh sistem.
- Kontrol penuh bagi Head of Team untuk membatasi distribusi dokumen dan melacak aktivitas unduhan
  secara real-time.

Catatan: "secara real-time" berasal dari teks BA. AC-12.01 hanya mensyaratkan daftar audit trail,
belum ada AC untuk kesegaran data log. Konfirmasi BA diperlukan sebelum menjadi target uji.

## Business Value dan Success Metrics

Sumber: sheet `Business Value` pada BA workbook. Sebagian besar baris sheet tersebut berisi metrik
penilaian kinerja (appraisal) dan HRIS yang bukan bagian DMS. Baris non-DMS tidak dicantumkan di sini.

Metrik DMS yang sudah punya acuan:

- Waktu unggah dan pengarsipan turun hingga 80% (lihat Expected Impact).
- Hasil pencarian tampil dalam kurang dari 3 detik (AC-06.03).
- Dokumen duplikat tidak tersimpan (AC-02.02).

Metrik DMS dari sheet Business Value yang belum punya AC dan perlu konfirmasi BA:

- Penurunan duplikasi data 95%.
- Waktu muat halaman di bawah 1,5 detik per aset.
- Ketersediaan sistem (uptime) 99,9%.

Konflik: sheet Business Value menulis pencarian di bawah 1 detik untuk 10.000 records, sedangkan
AC-06.03 mensyaratkan kurang dari 3 detik. Dokumen ini memakai AC-06.03 sampai BA mengonfirmasi.

## BA Approval

Source: BA workbook, sheet `BA Approval`.

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| Submitted Date  | 30 December 2025                       |
| Submitted By    | Azizah                                 |
| Submitted To    | Fahrudin                               |
| Approval Status | Approved                               |
| Approved Date   | 09 December 2025                       |
| Comments        | US & AC looks good, next to UIUX Stage |

Note: the dates were converted from the Excel serial values in the BA workbook (46020, 46021, and 46000) to `dd Month yyyy`. The Approved Date (09 December 2025) is earlier than the Submitted Date (30 December 2025) in the source. Keep the source values as-is until BA confirms whether this is a typo.
