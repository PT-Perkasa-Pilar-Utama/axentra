# Acceptance Evidence: FE-S4-05 (Manajemen Akun)

## Status: Blocked untuk integrasi live

- **Card ID**: `FE-S4-05`
- **Acceptance Criteria**: `PROP-ADM-AC-02.01` sampai `02.03`
- **PIC**: Aiman
- **Approver**: Arya Isnaidi (Tech Lead) — _pending review_
- **Environment**: Bun 1.4.3; `origin/dev` pada `2f22949`; frontend lokal.

## Dependensi dan batasan

- `DB-S4-01` telah di-merge ke `dev` (PR #61, commit `2f22949`), sedangkan `BE-S4-06` belum tersedia. Pengambilan dan perubahan status akun lewat backend nyata **belum diverifikasi**.
- Menu Admin tunggal (`Manajemen Akun`) pada rute `/admin/users` telah didaftarkan dan dilindungi peran `admin` sesuai arahan Tech Lead; menu Admin lainnya (Dashboard, Manajemen Dokumen, Audit Trail) tetap menjadi lingkup `FE-S4-07`.
- Screenshot Figma memuat akun Admin, waktu masuk terakhir, pencarian, filter status, dan hitungan per status. Kontrak `09-admin.md` saat ini hanya menyediakan Member Team/Head of Team dan parameter `page`/`limit`. Elemen berbasis data yang belum tersedia tidak dipalsukan.
- Persetujuan kontrak disampaikan pengguna dalam percakapan; dokumen `09-admin.md` masih menyebutnya Planned. Keputusan tertulis perlu diselaraskan oleh pihak berwenang.

## Pengujian

- Tes unit API (5 tes) dan tes integrasi tampilan/rute (8 tes) lulus memvalidasi tabel akun, konfirmasi nonaktif/aktif, penanganan error mutasi (422 dan error umum), retry setelah daftar gagal dimuat, proteksi rute peran `admin`, serta pencegahan akses peran lain.
- Walkthrough live daftar akun, penonaktifan/pengaktifan, login akun nonaktif, dan pencabutan sesi: **Blocked**, menunggu backend dan akun uji.
- Pratinjau visual komponen aktual dengan data sintetis (bukan data API, belum diukur pixel-perfect): [daftar akun](account-list-synthetic.png) dan [dialog konfirmasi](account-deactivate-confirm-synthetic.png). Catatan: screenshot sintetis awal diambil saat wrapper menggunakan shell Head of Team sebelum peran admin dengan menu tunggal Manajemen Akun didaftarkan ke konfigurasi menu bersama.
