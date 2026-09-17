# Acceptance Criteria - Sprint 2

Sprint 2 is planned. Source: BA workbook, sheet `Acceptance Criteria`.

## AC-04.01 - Menampilkan filter tag yang tersedia

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya melihat halaman hasil pencarian
Then saya melihat panel filter "Top Tags" yang berisi daftar tag yang relevan dengan hasil pencarian
```

## AC-04.02 - Melihat tag otomatis pada dokumen yang telah diupload

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
And dokumen berhasil diunggah dan diproses oleh sistem AI
When saya membuka daftar dokumen yang telah diupload
Then saya melihat "Smart Tags" yang relevan dengan isi dokumen secara otomatis pada dokumen dengan maks 3 tag
And bar "Top Tags" otomatis bertambah apabila tag yang ada di dokumen belum ada sama sekali di tag bar
```

## AC-04.03 - Melakukan filtering dokumen dengan menggunakan single tag

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya menekan bar Top Tags "Strategy"
Then daftar hasil pencarian diperbarui untuk hanya menampilkan dokumen dengan tag "Strategy"
And tag yang sedang aktif berubah warna highlighted untuk menunjukkan filter yang sedang berjalan
```

## AC-04.04 - Melakukan filtering dokumen dengan menggunakan multi-tag

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya menekan bar Top Tags "Strategy" dan "Legal"
Then saya melihat daftar dokumen yang memiliki tag "Strategy" dan "Legal"
```

## AC-05.01 - Mengkategorikan dokumen secara otomatis

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya mengunggah dokumen dengan isi konten "Reporting"
Then saya melihat kategori baru "Reporting" muncul di list menu kategori utama
And dokumen tersebut masuk ke dalam menu kategori "Reporting"
And setiap kategori baru yang dibentuk tidak mendapat perizinan download dan harus disetting dari Head of Team
```

## AC-05.02 - Mengkategorikan beberapa dokumen secara otomatis

```gherkin
Given saya seorang Member Team
And saya berada di halaman Dasbor
When saya mengunggah beberapa dokumen dengan isi konten "Reporting" dan "Contract"
Then dokumen tersebut masuk ke menu kategori yang berbeda sesuai isi konten didalamnya
```

## AC-06.01 - Pencarian berhasil menemukan dokumen

```gherkin
Given saya seorang Member Team
And ada dokumen yang berisi kata "API"
When saya mengetik "API" di bar pencarian
And saya menekan Enter
Then saya melihat setidaknya satu dokumen yang relevan muncul di hasil pencarian
```

## AC-06.02 - Hasil pencarian menampilkan informasi yang relevan

```gherkin
Given saya melakukan pencarian untuk "API"
When saya melihat daftar hasil pencarian
Then setiap item hasil menampilkan nama file dan cuplikan teks yang cocok
```

## AC-06.03 - Memastikan pencarian berjalan cepat

```gherkin
Given saya seorang Member Team
When saya melakukan pencarian kata kunci apa pun
Then sistem menampilkan hasil dalam waktu kurang dari 3 detik
```

## AC-06.04 - Pencarian tidak menemukan dokumen

```gherkin
Given saya seorang Member Team
And tidak ada dokumen yang berisi kata "xyzabc"
When saya mengetik "xyzabc" di bar pencarian
And saya menekan Enter
Then saya melihat pesan: "Tidak ada hasil yang ditemukan"
```

## AC-07.01 - Menampilkan saran dokumen terkait

```gherkin
Given saya membuka halaman detail dokumen yang memiliki beberapa tag
When saya melihat halaman detail dokumen
Then saya melihat bagian berjudul "Dokumen Terkait"
```

## AC-07.02 - Saran yang ditampilkan relevan

```gherkin
Given saya melihat bagian "Dokumen Terkait"
When saya memeriksa daftar dokumen yang disarankan
Then dokumen-dokumen tersebut memiliki setidaknya satu tag yang sama dengan dokumen yang sedang saya lihat
```
