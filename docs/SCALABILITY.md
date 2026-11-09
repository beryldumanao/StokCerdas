# Skalabilitas StokCerdas

Dokumen ini berisi **angka hasil pengukuran**, cara mengulanginya, dan batasnya. Tidak ada klaim "bisa jutaan pengguna" tanpa bukti.

## 1. Apa yang diukur
| Uji | Perintah | Yang dibuktikan |
|---|---|---|
| Database dengan data besar | `npm run test:sql:scale` | 210 ribu struk, 420 ribu item, 180 ribu pergerakan stok, 4.500 produk, 31 toko dalam satu database; latensi operasi inti di bawah RLS dan rencana query memakai indeks |
| Logika di browser | `npm run bench` | 2.000 produk dan 100 ribu penjualan diproses di memori |
| Muatan mode cloud | `tests/cloud.test.mjs` | paginasi 1000 baris/halaman, jendela 90 hari, pemberitahuan bila terpotong |

Lingkungan pengukuran: PostgreSQL 16.15 pada sandbox Linux, koneksi socket lokal (tanpa latensi jaringan), `fsync=off` pada klaster uji, data sintetis. Angka absolut akan berbeda di Supabase; yang penting adalah **bentuk** hasilnya (sebelum vs sesudah indeks) dan batas yang jelas.

## 2. Temuan: bottleneck nyata dan perbaikannya
Pengukuran pertama (sebelum `migrations/003_scale_indexes.sql`) menemukan tiga kolom kunci asing tanpa indeks, sehingga operasi inti melakukan *Seq Scan* pada tabel besar. Setelah indeks ditambahkan, tabel yang sama diukur ulang:

| Operasi | Sebelum indeks | Sesudah indeks | Perbaikan |
|---|---:|---:|---:|
| `create_sale` (2 item), per panggilan | 256 ms | 0,75 ms | ±340× |
| `void_sale` (2 item), per panggilan | 325 ms | 0,60 ms | ±540× |
| buat + hapus produk, per pasang | 47 ms | 1,7 ms | ±28× |
| `receive_stock` + `adjust_stock`, per pasang | 0,61 ms | 0,66 ms | tidak berubah |
| muat seluruh jendela 90 hari (18.539 struk, 19 halaman) | tidak sanggup diselesaikan dalam menit | 77 ms | – |
| muat penjualan 90 hari + item (satu halaman 2000 baris) | 23.101 ms (satu kali ukur di awal, tidak diulang) | 32 ms (ukur awal) | ±700× |

Empat baris pertama diukur ulang pada verifikasi akhir (dua proses terpisah, data sama); angka bervariasi ±15% antar proses, jadi baca sebagai orde besaran. Baris "muat seluruh jendela" tanpa indeks dihentikan karena tidak selesai dalam waktu wajar.

Pelajaran: dengan data kecil (puluhan struk) masalah ini tidak terlihat sama sekali. Ia baru muncul pada ratusan ribu baris, dan hanya ketahuan karena diuji dengan data sebesar itu. Tes skala sekarang menggagalkan build bila ada operasi inti melewati ambang atau rencana query kembali ke *Seq Scan* pada `sale_items` atau `stock_movements`.

## 3. Mengapa desainnya skala per toko
- **Satu toko = satu `business_id`.** Semua tabel besar punya indeks `(business_id, waktu)`. Ukuran database tumbuh dengan jumlah transaksi, tetapi query satu toko hanya menyentuh barisnya sendiri.
- **Operasi stok = satu transaksi pendek dengan kunci baris.** Dua kasir yang menjual produk berbeda tidak saling menunggu; dua kasir yang menjual stok terakhir yang sama diserialisasi dan hanya satu yang berhasil (terbukti oleh tes konkurensi).
- **Browser tidak memuat seluruh riwayat.** `CloudSource` hanya memuat transaksi 90 hari terakhir, per halaman 1000 baris karena Supabase membatasi satu permintaan. Batas keras 30.000 baris per tabel; bila terlewati, pengguna diberi tahu, bukan dipotong diam-diam.
- **Perhitungan dashboard linear.** Pada 100 ribu penjualan dan 2.000 produk: analitik kesehatan stok ±14 ms, satu penjualan ±50 ms (salinan state besar), pemeriksaan integritas ±39 ms, serialisasi cadangan ±88 ms (21,6 MB), validasi muat ±109 ms (pengukuran ulang; angka berubah ±50% antar proses).

## 4. Ukuran data dan biaya penyimpanan
Dari tabel uji (termasuk indeks): `sales` 36 MB / 210 ribu baris, `sale_items` 78 MB / 420 ribu, `stock_movements` 40 MB / 180 ribu.
- Kira-kira **0,75 KB per struk** berisi 2 item, termasuk pergerakan stok dan indeks.
- Toko dengan 100 struk per hari: ±75 KB per hari, ±28 MB per tahun.
- 1.000 toko seperti itu: ±28 GB per tahun. Bandingkan dengan batas paket database Anda; angka harga tidak dicantumkan karena berubah-ubah.

## 5. Batas yang diketahui
| Batas | Angka | Bila terlewati |
|---|---|---|
| Mode lokal (browser) | kuota ±5 juta karakter, ±140 karakter per penjualan, **±35 ribu penjualan** | meter di panel Cadangan memperingatkan di 70% dan 90%; pindah ke mode cloud |
| Cadangan JSON | ±0,2 KB per penjualan; 100 ribu penjualan ≈ 21,6 MB | batas unggah pemulihan 20 MB |
| Muatan cloud | 90 hari, 30.000 baris per tabel | pemberitahuan di aplikasi; ekspor atau perpendek periode |
| Toko sangat ramai | >330 struk/hari sepanjang 90 hari melewati 30.000 baris | naikkan `maxPages` atau pindahkan agregasi ke SQL (lihat bawah) |
| Paginasi `offset` | biaya naik pada halaman dalam | diukur 62 ms untuk 19 halaman; untuk skala lebih besar ganti ke *keyset pagination* |
| Setelah tiap tulis, cloud memuat ulang semua data | satu round-trip tambahan | optimasi: perbarui state dari hasil RPC saja |

## 6. Yang belum dibuktikan
- Latensi jaringan nyata, Supabase Auth, PostgREST, dan batas koneksi pada proyek Supabase sungguhan.
- Banyak pengguna bersamaan pada banyak toko (beban campuran). Yang diuji: dua sesi berebut stok yang sama, dan satu toko besar di antara 30 toko kecil.
- Ketahanan pada ratusan toko aktif: belum ada uji beban. Langkah berikut yang masuk akal: uji beban dengan skenario penjualan bersamaan, lalu ukur koneksi dan CPU.

## 7. Jalan skala berikutnya (berurutan, hanya bila angka di atas mulai terlewati)
1. Agregat dashboard di SQL (`sum` per hari/produk) agar browser tidak perlu memuat seluruh baris.
2. *Keyset pagination* menggantikan `offset`.
3. Tabel ringkasan harian per toko yang diperbarui oleh fungsi atomik yang sudah ada.
4. Partisi `sales` dan `stock_movements` per bulan bila satu tabel melewati puluhan juta baris.
5. Replika baca untuk laporan berat.
