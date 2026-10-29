# Peran Admin (usulan)

**Usulan. Bukan sumber BA. Belum disetujui BA atau Tech Lead.**

Peran ini belum ada di BA workbook `Doc_BA_DMS (Document Management System)_Versi 1 (2).xlsx`.
Sumber BA yang disetujui berhenti di US-13 dan AC-13.01. Karena itu dokumen ini ada di
`docs/proposals/`, bukan di `docs/business/`.

**ID bersifat sementara.** PROP-ADM-01 sampai PROP-ADM-05 dan PROP-ADM-AC-01.01 sampai
PROP-ADM-AC-05.01 hanya penanda di dokumen ini. Penanda ini bukan ID BA. Penomoran lama US-14 sampai
US-18 dan AC-14.01 sampai AC-18.01 tidak dipakai lagi. BA dapat menghapus, menggabungkan, atau
menomori ulang penanda tersebut saat meninjau. Sampai BA menyetujui, kartu sprint, kode, tes, dan
bukti tidak boleh memakai penanda ini sebagai requirement yang disetujui. Semua US, AC, dan matriks
di bawah berstatus usulan, kecuali yang diberi sumber BA.

Peran `admin` sudah tercantum di [09-authentication.md](../technical-specs/09-authentication.md).
Desain halaman belum diputuskan. Rencananya memakai ulang template desain yang ada, lalu
menambahkan fitur khusus Admin.

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
  pratinjau dan unduh saat ini menyebut `admin`. Lihat pertanyaan 9.

## Pertanyaan terbuka untuk Tech Lead dan BA

Dokumen ini memuat 9 pertanyaan terbuka.

1. **Arti "tugas".** Usulan: tugas Admin berarti dokumen dan hak unduh yang menjadi milik akun
   Member Team dan Head of Team. Konfirmasi: setujui atau ganti definisinya.
2. **Admin mengunggah dokumen?** Usulan: tidak. Admin hanya mengelola dokumen yang sudah ada.
3. **Admin mengubah peran akun?** Usulan: tidak. Perubahan peran hanya dilakukan jika Tech Lead
   menyetujui setiap kasus (PROP-ADM-02). Belum ada AC untuk fitur ini.
4. **Admin menonaktifkan akun?** Usulan: ya. Admin juga dapat mengaktifkan kembali akun yang
   dinonaktifkan.
5. **Admin mengarsipkan atau menghapus dokumen milik pengguna lain?** Usulan: ya, berupa arsip dan
   hapus lunak (soft delete). Hapus permanen tidak termasuk. Konfirmasi juga apakah dokumen yang
   diarsipkan tetap bisa dicari Member Team.
6. **Siapa yang mengatur izin unduh kategori?** BA US-13 dan AC-13.01 hanya menyebut Head of Team.
   AC-05.01 juga menulis bahwa izin kategori baru "harus disetting dari Head of Team". Usulan:
   Admin dan Head of Team sama-sama dapat mengatur izin (asumsi). Konfirmasi: tetap Head of Team
   saja, atau keduanya. Usulan ini bertentangan dengan AC-05.01, sehingga BA perlu memutuskan.
7. **Admin melihat isi dokumen pengguna?** Usulan: Admin melihat detail dokumen dan metadata.
   Preview isi dokumen belum diusulkan. API saat ini sudah mengizinkan Admin membuka pratinjau
   dokumen aktif (lihat pertanyaan 9). Konfirmasi.
8. **Nama menu dan template.** Nama menu (`Dasbor Admin`, `Manajemen Akun`, `Manajemen Dokumen`)
   dan label tombol masih usulan. Konfirmasi template desain yang dipakai ulang.
9. **Unduh oleh Admin.** Apakah Admin boleh mengunduh dokumen, dan apakah izin unduh kategori
   berlaku untuknya? Kode saat ini mengizinkan Admin mengunduh dokumen dari semua kategori tanpa
   pemeriksaan izin kategori (lihat [03-documents.md](../api-specs/03-documents.md)). BA dan Tech
   Lead belum memutuskan perilaku itu, dan dokumen ini tidak memutuskannya. Pilihan yang sudah
   dikenali: (a) Admin mengunduh semua kategori tanpa izin kategori, seperti kode saat ini; (b)
   Admin mengikuti izin unduh kategori seperti Member Team; (c) Admin tidak mengunduh. BA dan Tech
   Lead dapat memilih pilihan lain. Jawaban harus tercatat tertulis. Sampai ada jawaban, perilaku
   API tidak berubah.

## Konflik yang sudah diketahui

- **Izin unduh kategori (PROP-ADM-04, PROP-ADM-AC-04.01).** Usulan ini memberi Admin hak mengatur
  izin unduh kategori. BA US-13, AC-13.01, dan AC-05.01 hanya menyebut Head of Team. Lihat
  pertanyaan 6. Status: pertanyaan terbuka, bukan aturan.
- **Pemilik dokumen (PROP-ADM-AC-03.01, PROP-ADM-AC-03.02).** Kedua AC menampilkan nama pemilik
  dokumen. Tabel `documents` tidak punya kolom pemilik, dan tabel lain di `packages/db/src/schema`
  tidak menyimpan siapa yang mengunggah. Fitur ini membutuhkan perubahan skema lewat migrasi yang
  direview. Belum ada kartu sprint untuk perubahan itu.
- **Unduh oleh Admin.** Kode sudah mengizinkan Admin mengunduh dokumen semua kategori, tetapi belum
  ada keputusan BA atau Tech Lead. Lihat pertanyaan 9.

## User story Admin (penanda PROP-ADM)

Format sama dengan [user-story.md](../business/user-story.md). Semua penanda di bawah berstatus
usulan.

### PROP-ADM-01 - Melihat Dasbor Admin

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

Format Given/When/Then mengikuti sheet `Acceptance Criteria` pada BA workbook. Nama menu, label
tombol, dan teks dalam tanda kutip masih usulan dan belum final. PROP-ADM-04 dan
PROP-ADM-AC-04.01 sampai PROP-ADM-AC-04.02 adalah pertanyaan terbuka (lihat pertanyaan 6) dan tidak
boleh dijadikan aturan sebelum diputuskan.

## PROP-ADM-AC-01.01 - Melihat ringkasan jumlah pengguna per peran

```gherkin
Given saya seorang Admin
And saya berada di halaman Dasbor Admin
When saya membuka Dasbor Admin
Then saya melihat kartu data jumlah pengguna untuk setiap peran: Member Team, Head of Team, dan Admin
```

## PROP-ADM-AC-01.02 - Melihat jumlah dokumen dan unggahan 7 hari terakhir

```gherkin
Given saya seorang Admin
And saya berada di halaman Dasbor Admin
When saya membuka Dasbor Admin
Then saya melihat kartu data yang menampilkan jumlah total dokumen di sistem
And saya melihat kartu data yang menampilkan jumlah dokumen yang diunggah dalam 7 hari terakhir
```

## PROP-ADM-AC-01.03 - Melihat aktivitas unduhan

```gherkin
Given saya seorang Admin
And saya berada di halaman Dasbor Admin
When saya membuka Dasbor Admin
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
And dokumen tersebut tidak tampil di hasil pencarian Member Team (lihat pertanyaan 5)
```

## PROP-ADM-AC-03.04 - Menghapus lunak dokumen

```gherkin
Given saya seorang Admin
And dokumen "laporan.pdf" berstatus aktif
When saya menekan tombol "Hapus" dan mengonfirmasi penghapusan
Then dokumen tidak lagi tampil di daftar dokumen aktif
And data dokumen tidak dihapus permanen (hapus lunak)
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

## Hak akses

| Peran        | Upload                    | Lihat dokumen sendiri dan semua | Unduh (sesuai izin kategori) | Kelola akun               | Kelola izin kategori      | Lihat audit               |
| ------------ | ------------------------- | ------------------------------- | ---------------------------- | ------------------------- | ------------------------- | ------------------------- |
| Member Team  | Ya                        | Ya                              | Ya                           | Tidak                     | Tidak                     | Tidak                     |
| Head of Team | Tidak                     | Ya                              | Usulan (perlu konfirmasi)    | Tidak                     | Ya                        | Ya                        |
| Admin        | Usulan (perlu konfirmasi) | Usulan (perlu konfirmasi)       | Usulan (perlu konfirmasi)    | Usulan (perlu konfirmasi) | Usulan (perlu konfirmasi) | Usulan (perlu konfirmasi) |

Catatan matriks:

- Member Team: sesuai US-01, US-06, US-09, US-10, dan AC-13.01. Unduh bergantung pada izin kategori.
- Head of Team: sesuai US-11, US-12, US-13, dan deskripsi peran di 09-authentication.md. BA tidak
  menyebut Head of Team mengunggah atau mengunduh dokumen, sehingga kedua sel itu perlu konfirmasi.
  Kolom "Lihat dokumen" mengikuti daftar dokumen yang dirancang untuk `member_team` dan
  `head_of_team`.
- Admin: seluruh sel berstatus usulan. Usulan default: Admin tidak mengunggah dokumen dan tidak
  mendapat hak Member Team secara otomatis. Untuk sel "Lihat dokumen" dan "Unduh", kode saat ini
  sudah mengizinkan Admin membuka pratinjau dan mengunduh dokumen semua kategori. Keputusannya
  masih terbuka (pertanyaan 7 dan 9).

## Catatan

- Dokumen ini bukan bagian dari BA workbook. Sebelum masuk ke AC resmi, BA perlu menyetujui
  PROP-ADM-01 sampai PROP-ADM-05.
- Admin belum punya sprint. Lihat [TASK_BREAKDOWN.md](../TASK_BREAKDOWN.md) dan
  [sprint-breakdown.md](../business/sprint-breakdown.md).
