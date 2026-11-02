# Acceptance Evidence: FE-S4-02 (Build download audit trail page)

## Status: Recorded, release pending

- **Card ID**: `FE-S4-02`
- **Acceptance Criteria**: `AC-12.01` (Tracking Log Unduhan)
- **Prepared by**: Aiman (PIC)
- **Sign-Off / Approver**: Arya Isnaidi (Tech Lead) — _pending release sign-off_
- **Commit**: `2ddb07a24514107169a1c7436c94f8c69920f13e`
- **Date**: 2026-10-30

### 1. Verification Walkthrough (AC-12.01)

Walkthrough dijalankan langsung pada live stack lokal terintegrasi (Hono API, MinIO, PostgreSQL, Redis, dan React/Vite Web) dengan backend `BE-S4-02` (`GET /api/v1/audit/downloads`) yang telah di-merge ke `dev` (PR #54):

| Atribut                   | Rincian                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Environment**           | Local Axentra stack (walkthrough executed on Bun 1.3.14 on 2026-10-30; local binary updated to Bun 1.4.3 per packageManager, Chrome, Windows 11)                                                                                                                                                                                   |
| **Role / Akun**           | `head_of_team` (`head@axentra.local`), diautentikasi melalui form login resmi                                                                                                                                                                                                                                                      |
| **Data Diuji**            | Peristiwa unduhan pada dokumen `sample-reporting.pdf` (2 seeded audit events + 1 unduhan nyata melalui API `GET /api/v1/documents/:id/download`)                                                                                                                                                                                   |
| **Hasil yang Diharapkan** | Saat Head of Team membuka halaman Audit Trail, langsung tampil tabel yang memperlihatkan rincian: Siapa (User), Apa (Nama Dokumen), dan Kapan (Waktu Unduh)                                                                                                                                                                        |
| **Hasil yang Diamati**    | Halaman `/audit-trail` langsung menampilkan tabel aktivitas unduhan dengan kolom Pengguna, Nama Dokumen, dan Waktu Unduh (format WIB). Log unduhan dari pengguna (termasuk `Member Team` dan `Head of Team`) tampil terurut waktu terbaru. Komponen tidak menduplikasi sidebar dan siap disematkan ke dalam `AppShell` (FE-S4-07). |

### 2. Screenshot Bukti Runtime

Tangkapan layar live runtime tersimpan di:
[`docs/screenshots/FE-S4-02/audit-trail-live.png`](audit-trail-live.png)

![Audit Trail Live Table Verification](audit-trail-live.png)

### 3. Automated Quality Gate

- `bun run complete-check`: **Passed 100%**
- `apps/web/test/audit-trail.integration.test.tsx`: 9 tes integrasi memverifikasi:
  - Pembuktian AC-12.01 pada tabel utama langsung saat halaman dimuat.
  - Paginasi server lintas halaman termasuk riwayat > 100 item (navigasi hingga halaman 11).
  - Filter pencarian lokal pada halaman aktif dengan teks penjelas.
  - Penolakan retry otomatis pada galat HTTP 403 (Akses Dibatasi).
  - Pemblokiran role `member_team` dan `admin` pada rute tanpa mengirim request API.
- `apps/web/test/audit-trail.api.test.ts`: Unit test memvalidasi request endpoint dengan parameter `page` dan `limit` terikat skema shared, pembacaan `meta`, serta penolakan payload cacat.

_Catatan: Sesuai docs/E2E_TESTING.md:177-183, catatan ini disiapkan oleh PIC (Aiman) dan berstatus "Recorded, release pending" sampai persetujuan/sign-off akhir dicatat oleh Arya Isnaidi (Tech Lead)._
