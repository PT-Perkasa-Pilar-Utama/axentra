# Peran Admin (usulan)

**Disetujui BA (Azizah, 29 Oktober 2026) untuk cakupan PROP-ADM-01, 02, 03, dan 05 pada Sprint 4. PROP-ADM-04 tidak termasuk. Keputusan pertanyaan ada di bagian "Keputusan yang sudah diambil".**

Peran ini belum ada di BA workbook `Doc_BA_DMS (Document Management System)_Versi 1 (2).xlsx`.
Sumber BA yang disetujui berhenti di US-13 dan AC-13.01. Karena itu dokumen ini ada di
`docs/proposals/`, bukan di `docs/business/`.

**ID bersifat sementara.** PROP-ADM-01 sampai PROP-ADM-05 dan PROP-ADM-AC-01.01 sampai
PROP-ADM-AC-05.02 hanya penanda di dokumen ini. Penanda ini bukan ID BA. Penomoran lama US-14 sampai
US-18 dan AC-14.01 sampai AC-18.01 tidak dipakai lagi. BA dapat menghapus, menggabungkan, atau
menomori ulang penanda tersebut saat meninjau. Kartu Sprint 4 memakai penanda ini atas keputusan
Tech Lead (29 Oktober 2026). Sejak BA menyetujui cakupan PROP-ADM-01, 02, 03, dan 05 (29 Oktober 2026), kode, tes, dan bukti boleh memakai penanda ini untuk cakupan tersebut. PROP-ADM-04 tetap tidak boleh dicatat sebagai AC yang disetujui. Semua US, AC, dan matriks
di bawah berstatus usulan, kecuali yang diberi sumber BA.

Peran `admin` sudah tercantum di [09-authentication.md](../technical-specs/09-authentication.md).
Desain halaman Admin ada di Figma "Axentra – Admin (Sprint 4)". Semua halaman memakai satu
`AppShell` bersama (lihat [13-app-shell.md](../technical-specs/13-app-shell.md)).

## Ringkasan untuk dibacakan

Admin adalah peran untuk mengelola akun dan dokumen milik pengguna Member Team dan Head of Team.
Setelah masuk, Admin melihat menu dasbor dan fitur khusus Admin lainnya. Dari dasbor, Admin dapat
melihat jumlah pengguna per peran, jumlah dokumen, unggahan tujuh hari terakhir, dan aktivitas
unduhan. Admin juga dapat mengaktifkan atau menonaktifkan akun serta mengelola dokumen pengguna.
Beberapa batas, seperti apakah Admin boleh mengubah peran, masih menunggu keputusan Tech Lead.

## Tujuan dan persona

Tujuan: memberi Admin alat untuk mengelola tugas pengguna Member Team dan Head of Team, serta
memantau ringkasan sistem.

- Persona: Admin.
- Admin masuk dengan akun peran `admin`, lalu melihat menu dasbor dan fitur khusus Admin lainnya.
- Tugas Admin adalah mengelola akun dan dokumen milik pengguna Member Team dan Head of Team. Arti
  "tugas" perlu dikonfirmasi (pertanyaan 1).
- Peran `admin` tidak menggantikan `member_team` atau `head_of_team` pada rute dokumen, kecuali rute
  itu menyebut `admin` dalam daftar peran yang diizinkan (lihat 09-authentication.md). Rute
  pratinjau dan unduh di `dev` saat ini menyebut `admin`. Keputusan pertanyaan 9 (2026-11-04) menghapusnya.

## Keputusan yang sudah diambil

**Pertanyaan 7 (Admin melihat isi dokumen?)** diputuskan Tech Lead pada 2026-10-29 di chat: **Admin hanya melihat metadata**, tidak melihat pratinjau atau isi dokumen. BA (Azizah) menyetujui keputusan ini pada 2026-11-04, disampaikan Tech Lead di chat. Catatan tertulis dari BA belum dilampirkan di dokumen ini.

**Pertanyaan 9 (hak unduh Admin)** diputuskan 2026-11-04 (opsi c dari tiga pilihan: (a) semua kategori seperti kode lama; (b) ikut izin kategori seperti Member Team; (c) tidak mengunduh): Admin tidak melihat pratinjau dan tidak mengunduh dokumen dari kategori mana pun. Disetujui BA (Azizah) dan Tech Lead, disampaikan Tech Lead di chat. `admin` dihapus dari rute pratinjau, pratinjau konten, unduh, dan unduh massal lewat BE-S4-08.

**Pertanyaan 5 (dokumen arsip masih bisa dicari?)** diputuskan 2026-10-29: dokumen yang diarsipkan **tidak tampil** di pencarian dan daftar Member Team maupun Head of Team. Admin tetap bisa mencarinya di Manajemen Dokumen dan dapat membatalkan arsip (unarchive). BA (Azizah) menyetujui cakupan ini, disampaikan Tech Lead di chat.

**Pertanyaan 1 (arti "tugas")** disetujui 2026-10-29 sesuai usulan: tugas Admin berarti dokumen dan hak unduh yang menjadi milik akun Member Team dan Head of Team. Hak unduh di sini berarti hak yang dikelola Admin, bukan hak Admin untuk mengunduh isi dokumen (lihat pertanyaan 9). Pertanyaan 2, 3, dan 4 mengikuti usulan default.

**Pertanyaan 8 (nama menu dan template)** diputuskan 2026-10-30 oleh Tech Lead: menu Admin adalah `Dashboard`, `Manajemen Akun`, `Manajemen Dokumen`, dan `Audit Trail`. Label `Dashboard Admin` tidak dipakai. Template memakai satu `AppShell` bersama untuk semua peran; hanya menu dan isi halaman yang berbeda. Pada 2026-11-05 (F6 review PR #62), Tech Lead memutuskan Opsi A: peran `admin` pada `ShellRole`, `ROLE_MENU`, dan rute `/admin/users` dikerjakan lebih awal pada FE-S4-05. Saat itu, menu Admin dan rute lainnya masih dialokasikan ke FE-S4-07.

**Pembagian pekerjaan navigasi Admin (FE-S4-06, Opsi A):** Tech Lead Arya menyetujui secara lisan bahwa menu dan rute Manajemen Dokumen tetap dalam FE-S4-06; persetujuan disampaikan pengembang pada 2026-11-06. Keputusan ini mengubah alokasi Manajemen Dokumen pada 2026-11-05. FE-S4-05 menangani menu dan rute Manajemen Akun; FE-S4-07 menangani menu Dashboard dan Audit Trail, rute terkait, dan pengalihan login Admin. FE-S4-05 sudah digabung ke `dev`; kedua menu dan rute perlu diverifikasi bersama pada branch FE-S4-06 sebelum merge. Persetujuan ini tidak memutuskan perubahan filter atau kolom kategori pada daftar dokumen.

## Pertanyaan terbuka untuk Tech Lead dan BA

Dokumen ini memuat 15 pertanyaan. Pertanyaan 1, 5, 7, 8, dan 9 sudah diputuskan (lihat bagian Keputusan); sisanya masih terbuka. Pertanyaan 1 sampai 9 berasal dari versi 29 Oktober 2026. Pertanyaan 10 sampai 15 ditambahkan pada 4 November 2026 dari pemeriksaan kesiapan kartu. Rincian dan nilai usulan tiap pertanyaan juga ada di [09-admin.md](../api-specs/09-admin.md#open-decisions).

1. **Arti "tugas".** Usulan: tugas Admin berarti dokumen dan hak unduh yang menjadi milik akun
   Member Team dan Head of Team. Diputuskan 2026-10-29: disetujui sesuai usulan.
2. **Admin mengunggah dokumen?** Usulan: tidak. Admin hanya mengelola dokumen yang sudah ada.
3. **Admin mengubah peran akun?** Usulan: tidak. Perubahan peran hanya dilakukan jika Tech Lead
   menyetujui setiap kasus (PROP-ADM-02). Belum ada AC untuk fitur ini.
4. **Admin menonaktifkan akun?** Usulan: ya. Admin juga dapat mengaktifkan kembali akun yang
   dinonaktifkan.
5. **Admin mengarsipkan atau menghapus dokumen milik pengguna lain?** Usulan: ya, berupa arsip dan
   hapus lunak (soft delete). Hapus permanen tidak termasuk. Diputuskan 2026-10-29 (lihat bagian Keputusan): dokumen arsip tidak tampil untuk Member Team dan Head of Team.
6. **Siapa yang mengatur izin unduh kategori?** BA US-13 dan AC-13.01 hanya menyebut Head of Team.
   AC-05.01 juga menulis bahwa izin kategori baru "harus disetting dari Head of Team". Usulan:
   Admin dan Head of Team sama-sama dapat mengatur izin (asumsi). Konfirmasi: tetap Head of Team
   saja, atau keduanya. Usulan ini bertentangan dengan AC-05.01, sehingga BA perlu memutuskan.
7. **Admin melihat isi dokumen pengguna?** Diputuskan 2026-11-04: Admin melihat detail dokumen dan metadata saja, tanpa pratinjau dan tanpa isi dokumen. Kode di `dev` masih mengizinkan pratinjau sampai BE-S4-08 selesai.
8. **Nama menu dan template.** Nama menu (`Dashboard`, `Manajemen Akun`, `Manajemen Dokumen`) diputuskan 2026-10-30 (lihat Keputusan). Label tombol masih usulan.
9. **Unduh oleh Admin.** Diputuskan 2026-11-04: opsi (c), Admin tidak mengunduh dokumen dari kategori mana pun dan tidak melihat pratinjau (lihat bagian Keputusan). Kode di `dev` masih mengizinkan Admin mengunduh semua kategori sampai BE-S4-08 selesai (lihat [03-documents.md](../api-specs/03-documents.md)).
10. **Login akun nonaktif.** Usulan: login akun nonaktif gagal dengan `401 UNAUTHORIZED` dan pesan `Email atau kata sandi salah`, sama seperti email salah. Dengan begitu status akun tidak terbuka. Berlaku di jalur development dan production. Konfirmasi.
11. **Status di jalur development.** Direktori identitas (`AUTH_LOCAL_IDENTITY_DIRECTORY`) tidak punya kolom status. Usulan: setelah kata sandi terverifikasi, status dibaca dari tabel `users` berdasarkan `id`. Konfirmasi.
12. **Head of Team terakhir.** Apakah Admin boleh menonaktifkan Head of Team aktif yang terakhir? Usulan: tidak, dengan `422 LAST_HEAD_OF_TEAM`. Konfirmasi.
13. **Audit aksi Admin.** Apakah menonaktifkan, mengaktifkan, mengarsipkan, membatalkan arsip, dan menghapus dokumen dicatat ke audit trail? Usulan: ya. Konfirmasi.
14. **Dokumen arsip.** Apakah Member Team dan Head of Team mendapat `404` jika membuka dokumen arsip lewat URL langsung? Usulan: ya. Apakah jumlah di dasbor (`totalDocuments`, `uploadedLast7Days`) menyertakan dokumen arsip? Usulan: ya.
15. **Data lama dan daftar Admin.** Dokumen lama tanpa pengunggah ditampilkan sebagai "Tidak diketahui". Usulan: daftar Admin tidak memuat dokumen tanpa file tersimpan. Akun Admin untuk uji dibuat lewat seed atau skrip; sumbernya belum ditentukan. Konfirmasi.

## Konflik yang sudah diketahui

- **Izin unduh kategori (PROP-ADM-04, PROP-ADM-AC-04.01).** Usulan ini memberi Admin hak mengatur
  izin unduh kategori. BA US-13, AC-13.01, dan AC-05.01 hanya menyebut Head of Team. Lihat
  pertanyaan 6. Status: pertanyaan terbuka, bukan aturan.
- **Pemilik dokumen (PROP-ADM-AC-03.01, PROP-ADM-AC-03.02).** Kedua AC menampilkan nama pemilik
  dokumen. Tabel `documents` tidak punya kolom pemilik, dan tabel lain di `packages/db/src/schema`
  tidak menyimpan siapa yang mengunggah. Fitur ini membutuhkan perubahan skema lewat migrasi yang
  direview. Kartu DB-S4-01 (Sprint 4) mencakup perubahan itu.
- **Unduh oleh Admin.** Diputuskan 2026-11-04 (pertanyaan 9, opsi c). Kode di `dev` masih mengizinkan Admin mengunduh semua kategori sampai BE-S4-08 selesai.

## User story Admin (penanda PROP-ADM)

Format sama dengan [user-story.md](../business/user-story.md). Semua penanda di bawah berstatus
usulan.

### PROP-ADM-01 - Melihat Dashboard

- **Persona:** Admin
- **Action:** bisa melihat dasbor ringkasan berisi jumlah pengguna per peran, jumlah dokumen,
  jumlah unggahan dalam 7 hari terakhir, dan aktivitas unduhan
- **Business value:** sehingga Admin dapat memantau kondisi akun dan dokumen tanpa membuka data
  satu per satu

### PROP-ADM-02 - Mengelola Akun Member Team dan Head of Team

- **Persona:** Admin
- **Action:** bisa melihat daftar akun Member Team dan Head of Team, menonaktifkan atau
  mengaktifkan akun, dan mengubah peran hanya jika Tech Lead menyetujui
- **Business value:** agar akses ke sistem tetap sesuai kebutuhan tim

### PROP-ADM-03 - Mengelola Dokumen Milik Pengguna

- **Persona:** Admin
- **Action:** bisa melihat daftar semua dokumen beserta pemiliknya, melihat detail dokumen, serta
  mengarsipkan atau menghapus lunak dokumen
- **Business value:** agar basis dokumen tetap bersih dan tidak memuat dokumen yang sudah tidak
  dipakai

### PROP-ADM-04 - Mengatur Izin Unduh Kategori

- **Persona:** Admin (asumsi, lihat pertanyaan 6; BA US-13 hanya menyebut Head of Team)
- **Action:** bisa mengaktifkan atau menonaktifkan izin unduh per kategori, sama seperti US-13
- **Business value:** agar izin unduh tetap bisa diatur saat Head of Team tidak tersedia
  (asumsi, perlu konfirmasi)
- **Status:** pertanyaan terbuka (lihat pertanyaan 6). Bertentangan dengan AC-05.01. Jangan
  diimplementasikan sebagai aturan sebelum BA dan Tech Lead memutuskan.

### PROP-ADM-05 - Melihat Audit Trail Seluruh Pengguna

- **Persona:** Admin
- **Action:** bisa melihat log/catatan siapa saja yang telah mengunduh dokumen tertentu, untuk
  semua pengguna (cakupan sama dengan US-12)
- **Business value:** agar Admin dapat menelusuri aktivitas unduhan di seluruh sistem

## Acceptance criteria Admin

Format Given/When/Then mengikuti sheet `Acceptance Criteria` pada BA workbook. Nama menu sudah diputuskan (pertanyaan 8). Label tombol dan teks dalam tanda kutip masih usulan dan belum final. PROP-ADM-04 dan
PROP-ADM-AC-04.01 sampai PROP-ADM-AC-04.02 adalah pertanyaan terbuka (lihat pertanyaan 6) dan tidak
boleh dijadikan aturan sebelum diputuskan.

## PROP-ADM-AC-01.01 - Melihat ringkasan jumlah pengguna per peran

```gherkin
Given saya seorang Admin
And saya berada di halaman Dashboard
When saya membuka Dashboard
Then saya melihat kartu data jumlah pengguna untuk setiap peran: Member Team, Head of Team, dan Admin
```

## PROP-ADM-AC-01.02 - Melihat jumlah dokumen dan unggahan 7 hari terakhir

```gherkin
Given saya seorang Admin
And saya berada di halaman Dashboard
When saya membuka Dashboard
Then saya melihat kartu data yang menampilkan jumlah total dokumen di sistem
And saya melihat kartu data yang menampilkan jumlah dokumen yang diunggah dalam 7 hari terakhir
```

## PROP-ADM-AC-01.03 - Melihat aktivitas unduhan

```gherkin
Given saya seorang Admin
And saya berada di halaman Dashboard
When saya membuka Dashboard
Then saya melihat ringkasan aktivitas unduhan, termasuk jumlah unduhan dan waktu unduhan terbaru
```

## PROP-ADM-AC-02.01 - Melihat daftar akun

```gherkin
Given saya seorang Admin
And saya berada di menu Manajemen Akun
When saya membuka daftar akun
Then saya melihat akun Member Team dan Head of Team beserta nama, peran, dan status aktif atau nonaktif
```

## PROP-ADM-AC-02.02 - Menonaktifkan akun

```gherkin
Given saya seorang Admin
And saya berada di menu Manajemen Akun
And akun Member Team "A" berstatus aktif
When saya menekan tombol "Nonaktifkan" pada akun tersebut
Then status akun berubah menjadi "Nonaktif"
And akun tersebut tidak dapat masuk ke sistem
```

## PROP-ADM-AC-02.03 - Mengaktifkan kembali akun

```gherkin
Given saya seorang Admin
And saya berada di menu Manajemen Akun
And akun Member Team "A" berstatus nonaktif
When saya menekan tombol "Aktifkan" pada akun tersebut
Then status akun berubah menjadi "Aktif"
And akun tersebut dapat masuk kembali ke sistem
```

## PROP-ADM-AC-03.01 - Melihat semua dokumen beserta pemilik

```gherkin
Given saya seorang Admin
And saya berada di menu Manajemen Dokumen
When saya membuka daftar dokumen
Then saya melihat semua dokumen di sistem beserta nama pemilik dan tanggal unggah
```

## PROP-ADM-AC-03.02 - Melihat detail dokumen milik pengguna

```gherkin
Given saya seorang Admin
And saya berada di daftar dokumen
When saya menekan dokumen "laporan.pdf"
Then saya melihat detail dokumen, termasuk nama pemilik, metadata, dan kategori
```

## PROP-ADM-AC-03.03 - Mengarsipkan dokumen

```gherkin
Given saya seorang Admin
And dokumen "laporan.pdf" berstatus aktif
When saya menekan tombol "Arsipkan" pada dokumen tersebut
Then status dokumen berubah menjadi "Diarsipkan"
And dokumen tersebut tidak tampil di hasil pencarian Member Team dan Head of Team (lihat pertanyaan 5)
```

## PROP-ADM-AC-03.04 - Menghapus lunak dokumen

```gherkin
Given saya seorang Admin
And dokumen "laporan.pdf" berstatus aktif
When saya menekan tombol "Hapus" dan mengonfirmasi penghapusan
Then dokumen tidak lagi tampil di daftar dokumen aktif
And data dokumen tidak dihapus permanen (hapus lunak)
```

## PROP-ADM-AC-03.05 - Membatalkan arsip dokumen (usulan)

Status: usulan. Mengikuti pertanyaan 5 yang sudah disetujui BA. Belum diuji sampai kartu BE-S4-07 dan FE-S4-06 memasukkannya.

```gherkin
Given saya seorang Admin
And dokumen "laporan.pdf" berstatus diarsipkan
When saya menekan tombol "Batalkan arsip" pada dokumen tersebut
Then status dokumen berubah menjadi aktif
And dokumen tampil kembali di daftar dan pencarian Member Team dan Head of Team
```

## PROP-ADM-AC-04.01 - Mengaktifkan izin unduh kategori oleh Admin (pertanyaan terbuka, bukan aturan)

Status: pertanyaan terbuka (lihat pertanyaan 6). AC-05.01 menyatakan bahwa izin kategori baru diatur
oleh Head of Team, sehingga AC ini bertentangan dengan AC-05.01. Gherkin di bawah hanya contoh
usulan, bukan aturan.

```gherkin
Given saya seorang Admin
And saya berada di menu Permission category
When saya menekan toggle switch dari status inactive menjadi "Active" pada kategori "Reporting"
Then Member Team dapat melakukan download dokumen pada kategori "Reporting"
```

## PROP-ADM-AC-04.02 - Kategori baru tidak mendapat izin unduh otomatis

```gherkin
Given saya seorang Admin
And kategori "Reporting" baru dibuat otomatis oleh sistem
When saya membuka menu Permission category
Then kategori "Reporting" berstatus inactive
```

## PROP-ADM-AC-05.01 - Melihat audit trail seluruh pengguna

```gherkin
Given saya seorang Admin
And saya berada di menu Audit Trail
When saya membuka halaman audit trail
Then tampil informasi detail untuk unduhan dari semua pengguna: Siapa (User), Apa (Nama Dokumen), dan Kapan (Waktu) proses download dilakukan
```

## PROP-ADM-AC-05.02 - Admin tidak dapat membuka pratinjau atau mengunduh dokumen (disetujui 2026-11-04, pertanyaan 9)

Status: disetujui 2026-11-04 (BA dan Tech Lead, disampaikan di chat). Diimplementasikan di BE-S4-08.

```gherkin
Given saya seorang Admin
And saya membuka dokumen "laporan.pdf" melalui tautan atau daftar dokumen
When saya meminta pratinjau atau mengunduh dokumen tersebut
Then sistem menolak permintaan dengan status 403
```

## Hak akses

| Peran        | Upload                    | Lihat dokumen sendiri dan semua      | Unduh (sesuai izin kategori) | Kelola akun                  | Kelola izin kategori                 | Lihat audit                  |
| ------------ | ------------------------- | ------------------------------------ | ---------------------------- | ---------------------------- | ------------------------------------ | ---------------------------- |
| Member Team  | Ya                        | Ya                                   | Ya                           | Tidak                        | Tidak                                | Tidak                        |
| Head of Team | Tidak                     | Ya                                   | Usulan (perlu konfirmasi)    | Tidak                        | Ya                                   | Ya                           |
| Admin        | Usulan (perlu konfirmasi) | Metadata saja (keputusan 2026-11-04) | Tidak (keputusan 2026-11-04) | Ya, cakupan BA (PROP-ADM-02) | Usulan (PROP-ADM-04 belum disetujui) | Ya, cakupan BA (PROP-ADM-05) |

Catatan matriks:

- Member Team: sesuai US-01, US-06, US-09, US-10, dan AC-13.01. Unduh bergantung pada izin kategori.
- Head of Team: sesuai US-11, US-12, US-13, dan deskripsi peran di 09-authentication.md. BA tidak
  menyebut Head of Team mengunggah atau mengunduh dokumen, sehingga kedua sel itu perlu konfirmasi.
  Kolom "Lihat dokumen" mengikuti daftar dokumen yang dirancang untuk `member_team` dan
  `head_of_team`.
- Admin: sel "Lihat dokumen" dan "Unduh" sudah diputuskan 2026-11-04 (metadata saja; tidak ada pratinjau atau unduh). Sel "Kelola akun" dan "Lihat audit" mengikuti cakupan BA (PROP-ADM-02 dan 05). Sel "Upload" dan "Kelola izin kategori" tetap usulan. Kode di `dev` masih mengizinkan pratinjau dan unduh untuk Admin sampai BE-S4-08 selesai.

## Catatan

- Dokumen ini bukan bagian dari BA workbook. BA sudah menyetujui cakupan PROP-ADM-01, 02, 03, dan 05 (29 Oktober 2026). PROP-ADM-04 belum disetujui.
- Tech Lead memasukkan Admin ke Sprint 4 (akun, dasbor, audit, dokumen) pada 29 Oktober 2026. Kartunya ada di [TASK_BREAKDOWN.md](../TASK_BREAKDOWN.md), bagian "Sprint 4: Admin". PROP-ADM-04 dan perubahan peran akun tidak masuk kartu. BA (Azizah) menyetujui cakupan ini pada 29 Oktober 2026, disampaikan Tech Lead di chat.
