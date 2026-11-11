# Acceptance Evidence: FE-S4-01 (Build Head of Team analytics page)

## Status: Recorded, release pending

- **Card ID**: `FE-S4-01`
- **Acceptance Criteria**: `AC-11.01` (Melihat metrik total dokumen), `AC-11.02` (Melihat metrik unggahan terbaru)
- **Prepared by**: disiapkan dari walkthrough lokal oleh reviewer (Claude) atas permintaan Tech Lead. PIC: Azis (perlu memverifikasi ulang di lingkungan PIC bila diperlukan).
- **Sign-Off / Approver**: Tech Lead (Arya Isnaidi) — _pending release sign-off_
- **Date**: 2026-11-04

---

### Run 1 — Walkthrough AC-11.01 dan AC-11.02 pada head `6b24ce6`

Rekaman ini mengikuti `docs/E2E_TESTING.md` §5.2. Kode yang diuji adalah `6b24ce6`. Berkas ini sendiri ditambahkan sesudah walkthrough dan tidak mengubah kode.

```text
AC:          AC-11.01, AC-11.02
Card:        FE-S4-01
Commit:      6b24ce6f34e4e2deb9cf90b427e2e5e52aff156c (kode yang diuji)
Base:        dev @ cb64d672f20017fe064ca44b762eb0cc7711bec5
Environment: local. Web http://localhost:5173 (Vite dev), API http://localhost:3001,
             PostgreSQL 16.6 dan Redis 7.4.1 di container disposable, MinIO (ghcr.io/coollabsio/minio),
             Bun 1.4.3, Windows 11, browser pane Claude (Chromium), viewport 1280x800.
Role:        head_of_team (akun identitas lokal head@axentra.local) untuk UI dan API.
             member_team (akun identitas lokal member@axentra.local) untuk pemeriksaan penolakan API.
Input:       3 dokumen PDF sintetis (fixture 102 byte, diunggah oleh member_team satu per satu).
             Satu dokumen dimundurkan created_at-nya 10 hari di database untuk menguji jendela 7 hari.
             Data uji disiapkan langsung di database lokal, bukan dokumen asli.
Expected:    AC-11.01: kartu "Total dokumen" menampilkan jumlah dokumen di sistem (3).
             AC-11.02: kartu "Unggahan 7 hari terakhir" menampilkan dokumen dalam 7 hari terakhir (2).
Observed:    lihat tabel di bawah.
Result:      Pass untuk AC-11.01 dan AC-11.02 pada lingkungan lokal ini.
Screenshot:  docs/screenshots/FE-S4-01/analytics-desktop-2026-11-04.jpg
```

### Hasil per langkah

| #   | Langkah                                              | Yang diharapkan                                               | Yang diamati                                                                                                          | Hasil |
| --- | ---------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Login head_of_team, buka `/analytics`                | Halaman "Dasbor analitik" tampil                              | Judul h1 "Dasbor analitik", `document.title` "Dasbor analitik \| Axentra"                                             | Pass  |
| 2   | Kartu total dokumen                                  | Angka sama dengan database dan API                            | UI "3". Database `count(*) = 3`. API `totalDocuments: 3`                                                              | Pass  |
| 3   | Kartu unggahan 7 hari                                | Angka sama dengan database dan API                            | UI "2". Database `count(*) filter (created_at >= now() - 7 days) = 2`. API `uploadedLast7Days: 2`                     | Pass  |
| 4   | Label kartu dan format                               | Teks Bahasa Indonesia                                         | "Total dokumen", "Unggahan 7 hari terakhir"                                                                           | Pass  |
| 5   | Menu sidebar Head of Team                            | Dashboard, Analitik (aktif), Audit Trail, Permission category | Dashboard, Analitik (aktif, `is-active`), Audit Trail, Permission category                                            | Pass  |
| 6   | Blok Kategori di sidebar                             | Tampil; kosong bila belum ada kategori                        | "Kategori — Belum ada kategori." (tidak ada kategori di data uji)                                                     | Pass  |
| 7   | Badge sesi di dasar sidebar                          | Tampil                                                        | "HO / Head of Team / Ketua Tim / Keluar" di dasar sidebar                                                             | Pass  |
| 8   | Sidebar sticky (md ke atas)                          | `position: sticky`, tinggi layar, badge tetap terlihat        | `position: sticky`, `height: 800px`, `overflow-y: auto` pada isi sidebar. Badge di y=721–776                          | Pass  |
| 9   | Sticky pada halaman panjang                          | Badge tetap terlihat saat scroll                              | `/audit-trail` dengan 12 event (dokumen 1245 px). Setelah scroll ke bawah (`scrollY = 445`), badge tetap di y=721–776 | Pass  |
| 10  | Akses API member_team ke `/api/v1/analytics/summary` | 403                                                           | HTTP 403                                                                                                              | Pass  |
| 11  | Konsol browser                                       | Tidak ada error aplikasi                                      | Satu error `401` pada `auth/refresh` saat sesi belum ada, sebelum login. Bukan error aplikasi                         | Pass  |

### Catatan data uji

- Satu dokumen diubah `created_at`-nya ke 10 hari lalu melalui SQL di database lokal. Ini hanya data uji untuk menguji jendela 7 hari.
- Dua belas event unduhan dibuat oleh head_of_team untuk menguji sticky pada halaman Audit Trail yang panjang. Event ini tidak dipakai untuk menilai AC-11.

### Yang belum dicatat pada run ini

- Penolakan UI untuk `member_team` dan `admin` pada `/analytics` tidak diuji lewat browser. Penolakan API sudah diuji (langkah 10). Route guard `ProtectedRoute allowedRoles={[ANALYTICS_ROLE]}` tidak diuji secara terpisah di browser.
- Skenario gagal (summary gagal dimuat, tombol "Coba lagi") tidak dijalankan di run ini. Tes FE sudah mencakupnya dengan API mock.
- Verifikasi di lingkungan PIC (dev bersama) belum dilakukan.

### Aturan rekaman

- Status tetap `Recorded, release pending`. Sign-off akhir dicatat oleh Tech Lead.
- Tidak ada password, token, atau URL bertanda tangan dalam rekaman ini. Hanya nama akun identitas lokal.
- Jika ada commit dokumen setelah `6b24ce6`, kode yang diuji tetap `6b24ce6`. Catat SHA commit dokumen tersebut di baris `Commit:` tambahan.
