# Acceptance Evidence: FE-S4-06 (Build document management page)

## Status: Blocked — verifikasi live menunggu BE-S4-07; belum ada sign-off Arya.

- **Card ID**: `FE-S4-06`
- **Acceptance Criteria**: `PROP-ADM-AC-03.01` sampai `PROP-ADM-AC-03.05`
- **PIC**: Aiman
- **Tech Lead / Approver**: Arya Isnaidi
- **Pembaruan catatan**: 2026-11-06
- **Branch**: `FE-S4-06-Build-document-management-page`
- **Baseline review**: `cf541e8ef9fa8c1b00541330b368549213c9fb8e`.
- **HEAD lokal**: `d47e399ba87176a674007b0e9293c84738741c63`; perubahan Round 1 belum di-commit dan tidak diwakili oleh SHA ini.
- **Status rilis**: bukti live dan persetujuan akhir Arya belum tersedia.

---

### 1. Status Dependensi dan Otorisasi

Sesuai aturan `docs/E2E_TESTING.md` ("Mark `Blocked`, not `Pass`, when a dependency is missing"):

| Komponen Dependensi            | Status        | Keterangan                                                                                                                                                                                                                             |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database Schema (DB-S4-01)** | **Merged**    | Kolom `users.status`, `documents.uploaded_by`, `documents.archived_at` telah tersedia di `dev` (PR #61, merge `2f22949`).                                                                                                              |
| **Backend API (BE-S4-07)**     | **Blocked**   | Endpoint `GET /api/v1/admin/documents`, `GET /api/v1/admin/documents/:id`, `POST /api/v1/admin/documents/:id/archive`, `POST /api/v1/admin/documents/:id/unarchive`, dan `DELETE /api/v1/admin/documents/:id` belum di-merge ke `dev`. |
| **Frontend UI (FE-S4-06)**     | **In review** | UI diuji dengan respons sintetis; integrasi live dan persetujuan akhir belum tersedia.                                                                                                                                                 |

---

### 2. Evidence Records (docs/E2E_TESTING.md §5.2)

```text
AC:          PROP-ADM-AC-03.01
Card:        FE-S4-06
Commit:      Belum tersedia untuk perbaikan lokal yang belum di-commit
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        admin (seeded test account)
Input:       GET /api/v1/admin/documents (data respons sintetis)
Expected:    Daftar dokumen menampilkan judul, pengunggah, tanggal, dan status. Dokumen legacy tanpa pengunggah menampilkan teks "Tidak diketahui".
Observed:    Tabel menampilkan judul dokumen, pengunggah (termasuk fallback "Tidak diketahui" untuk ownerName: null), tanggal, dan status pill. Pengujian unit dan integrasi lulus. Integrasi live terblokir karena BE-S4-07 belum tersedia di dev.
Result:      Blocked (BE-S4-07 belum tersedia di dev)
Screenshot:  docs/screenshots/FE-S4-06/preview-aktif-sintetis.png (screenshot pratinjau komponen lokal dengan data sintetis)
```

```text
AC:          PROP-ADM-AC-03.02
Card:        FE-S4-06
Commit:      Belum tersedia untuk perbaikan lokal yang belum di-commit
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        admin (seeded test account)
Input:       Klik judul dokumen pada daftar (GET /api/v1/admin/documents/:id sintetis)
Expected:    Dialog modal menampilkan metadata dokumen (judul, pengunggah, kategori, penulis, tanggal unggah/arsip) tanpa affordance pratinjau atau unduh dokumen.
Observed:    Modal dialog semantik menampilkan detail metadata; tombol unduh dan pratinjau tidak ada sama sekali di DOM; status loading metadata tertangani. Integrasi live terblokir karena BE-S4-07 belum tersedia di dev.
Result:      Blocked (BE-S4-07 belum tersedia di dev)
Screenshot:  No screenshot (detail metadata diverifikasi melalui pengujian komponen otomatis)
```

```text
AC:          PROP-ADM-AC-03.03
Card:        FE-S4-06
Commit:      Belum tersedia untuk perbaikan lokal yang belum di-commit
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        admin (seeded test account)
Input:       Klik tombol "Arsipkan" pada baris dokumen aktif
Expected:    Muncul dialog konfirmasi arsip dengan keterangan bahwa dokumen tidak tampil untuk Member Team dan Head of Team; tombol terkunci saat pending; mutasi memanggil POST /admin/documents/:id/archive.
Observed:    Dialog konfirmasi terbuka; saat mutasi berjalan tombol menampilkan "Memproses..." dan berstatus disabled; klik ganda dicegah; error 403 menampilkan alert di dalam dialog. Integrasi live terblokir karena BE-S4-07 belum tersedia di dev.
Result:      Blocked (BE-S4-07 belum tersedia di dev)
Screenshot:  No screenshot (alur mutasi dan pending state diverifikasi melalui pengujian komponen otomatis)
```

```text
AC:          PROP-ADM-AC-03.04
Card:        FE-S4-06
Commit:      Belum tersedia untuk perbaikan lokal yang belum di-commit
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        admin (seeded test account)
Input:       Klik tombol "Hapus" pada baris dokumen
Expected:    Muncul dialog konfirmasi hapus dengan keterangan hapus lunak (data tetap tersimpan di server); tombol konfirmasi terkunci saat pending; mutasi memanggil DELETE /admin/documents/:id; baris dokumen hilang dari daftar setelah berhasil.
Observed:    Dialog konfirmasi hapus terbuka; saat mutasi tombol menampilkan "Menghapus..." dan berstatus disabled; klik ganda dicegah; error 403 menampilkan alert di dalam dialog; setelah sukses baris dokumen terhapus dari tampilan melalui query invalidation. Integrasi live terblokir karena BE-S4-07 belum tersedia di dev.
Result:      Blocked (BE-S4-07 belum tersedia di dev)
Screenshot:  docs/screenshots/FE-S4-06/preview-konfirmasi-hapus-sintetis.png (screenshot pratinjau komponen lokal; catatan: blur backdrop dinonaktifkan sementara saat pengambilan gambar)
```

```text
AC:          PROP-ADM-AC-03.05
Card:        FE-S4-06
Commit:      Belum tersedia untuk perbaikan lokal yang belum di-commit
Environment: local, Web http://localhost:5173, API http://localhost:3001
Role:        admin (seeded test account)
Input:       Pilih tab "Diarsipkan", klik tombol "Batalkan Arsip" pada baris dokumen
Expected:    Muncul dialog konfirmasi pembatalan arsip; tombol konfirmasi terkunci saat pending; mutasi memanggil POST /admin/documents/:id/unarchive; dokumen kembali aktif.
Observed:    Tab Diarsipkan menampilkan daftar arsip dengan tombol "Batalkan Arsip"; dialog konfirmasi pembatalan arsip berfungsi dengan pending state "Memproses...", pencegahan klik ganda, dan penanganan galat 403. Integrasi live terblokir karena BE-S4-07 belum tersedia di dev.
Result:      Blocked (BE-S4-07 belum tersedia di dev)
Screenshot:  docs/screenshots/FE-S4-06/preview-diarsipkan-sintetis.png (screenshot pratinjau komponen lokal dengan data sintetis)
```

---

### 3. Catatan Keputusan dan Keterbatasan Tampilan

1. **Keputusan Navigasi Opsi A (2026-11-06)**:
   - Sesuai persetujuan lisan Tech Lead Arya yang dilaporkan oleh pengembang pada 2026-11-06, rute `/admin/documents` dan entri menu "Manajemen Dokumen" dipertahankan di `FE-S4-06`.
   - Di `dev` (`b550bbe`), PR #62 (`FE-S4-05`) belum di-merge, sehingga branch ini saat ini baru memuat entri Manajemen Dokumen.
   - Penyatuan menu lengkap Admin (`Dashboard`, `Manajemen Akun`, `Manajemen Dokumen`, `Audit Trail`) harus diverifikasi bersama setelah PR #62 dan branch ini digabungkan ke `dev`.

2. **Cakupan Filter Status dan Pencarian (F9)**:
   - Kontrak API `GET /api/v1/admin/documents` saat ini hanya mendukung parameter `page` dan `limit`.
   - Filter tab ("Aktif" / "Diarsipkan") dan pencarian judul dokumen diterapkan pada halaman aktif (client-side) dan dijelaskan secara jujur kepada pengguna melalui teks UI pembantu.
   - Perluasan kontrak filter server-side dan penambahan kolom Kategori pada daftar dokumen merupakan keputusan terbuka untuk Tech Lead dan BA.

3. **Catatan Tangkapan Layar Dialog (F10)**:
   - Tangkapan layar `preview-konfirmasi-hapus-sintetis.png` diambil dengan `backdrop-filter: blur(2px)` yang dinonaktifkan sementara pada peramban lokal saat sesi pratinjau.
   - Kode CSS yang dikirimkan tetap menyertakan aturan `backdrop-filter: blur(2px)` di `admin-documents-dialogs.css`.

4. **Hak Akses Admin Tanpa Pratinjau/Unduh**:
   - Mematuhi keputusan 2026-11-04 (PROP-ADM-AC-05.02): Admin hanya melihat metadata dokumen. Tidak ada tautan atau tombol unduh/pratinjau.

---

### 4. Automated Verification Results

Hasil eksekusi pengujian spesifik `FE-S4-06` (semua lulus):

- `apps/web/test/admin-documents.api.test.ts` (4 unit tests):
  - Parsing data dan meta paginasi `listAdminDocuments`.
  - Pemanggilan `POST /admin/documents/:id/archive`.
  - Pemanggilan `GET /admin/documents/:id` (detail metadata).
  - Pemanggilan `DELETE /admin/documents/:id`.
- `apps/web/test/admin-documents.view.test.tsx` (16 integration tests):
  - `AC-03.01`: Menampilkan daftar dokumen beserta judul, pengunggah, dan status (termasuk fallback dokumen legacy "Tidak diketahui").
  - Loading daftar: Menampilkan teks indikator status "Memuat daftar dokumen...".
  - `AC-03.01 & AC-03.05`: Berpindah ke tab Diarsipkan dan menampilkan tombol Batalkan Arsip.
  - `AC-03.03`: Alur dialog konfirmasi arsip dengan pending state ("Memproses...", tombol disabled) dan pencegahan klik ganda.
  - `AC-03.03`: Penanganan galat 403 pada mutasi arsip menampilkan alert izin di dalam dialog.
  - `AC-03.05`: Alur dialog pembatalan arsip dengan pending state ("Memproses...", tombol disabled) dan pencegahan klik ganda.
  - `AC-03.05`: Penanganan galat 403 pada mutasi pembatalan arsip menampilkan alert izin di dalam dialog.
  - `AC-03.04`: Alur dialog konfirmasi hapus lunak dengan pending state ("Menghapus...", tombol disabled), pencegahan klik ganda, dan penghapusan baris dokumen setelah mutasi berhasil melalui query invalidation.
  - `AC-03.04`: Penanganan galat 403 pada mutasi hapus menampilkan alert izin di dalam dialog.
  - `AC-03.02`: Dialog detail metadata dokumen menampilkan loading "Memuat metadata..." lalu menyajikan metadata tanpa affordance pratinjau/unduh.
  - Pencarian: Memfilter dokumen berdasarkan judul pada halaman aktif.
  - Paginasi: Interaksi tombol Sebelumnya dan Berikutnya serta pembaruan nomor halaman.
  - Proteksi rute (`member_team`): Ditolak ("Akses Dibatasi") dan memastikan 0 request dikirim ke endpoint dokumen.
  - Proteksi rute (`head_of_team`): Ditolak ("Akses Dibatasi") dan memastikan 0 request dikirim ke endpoint dokumen.
  - Menu peran (`admin`): Memverifikasi fungsi `resolveShellRole("admin")` dan entri "Manajemen Dokumen" pada `ROLE_MENU.admin`.
  - Penanganan galat: Respons 500 menampilkan pesan dan tombol "Coba lagi" yang memicu refetch.
