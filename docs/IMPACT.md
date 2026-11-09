# Dampak bisnis StokCerdas

Dokumen ini memisahkan tiga hal yang sering tercampur: **yang terukur**, **yang diasumsikan**, dan **yang masih harus dibuktikan**.

## 1. Masalah dan konteks
- Stok toko kecil dicatat manual; dua kerugian berulang: barang laris habis dan barang tidak laku menumpuk (gambaran kualitatif dari [UKM Indonesia](https://ukmindonesia.id/baca-deskripsi-posts/stok-barang-sering-kacau-saatnya-umkm-kenali-software-inventory-management), tanpa statistik).
- Skala konteks: UMKM ±60% PDB dan hingga ±97% tenaga kerja ([CNBC Indonesia, 24 Jan 2025](https://www.cnbcindonesia.com/news/20250124132315-4-605701/umkm-masih-jadi-kontributor-besar-buat-ekonomi-10-tahun-mendatang); [RCTI+, 15 Jun 2025](https://www.rctiplus.com/news/detail/idxchannel/4785294/kontribusi-umkm-capai-60-persen-terhadap-pdb--pemerintah-dorong-akses-ke-pasar-global)). Angka ini untuk seluruh UMKM, bukan khusus retail, dan **bukan** ukuran pasar yang bisa dilayani. Ukuran pasar yang bisa dilayani belum dihitung.

## 2. Yang terukur oleh aplikasi (tab Dampak Bisnis)
| Indikator | Cara ukur |
|---|---|
| Kejadian stok habis (30 hari) | saldo buku stok menyentuh 0 setelah penjualan |
| Produk kritis | stok habis sebelum waktu pengadaan (3 hari) pada kecepatan jual saat ini |
| Modal tertahan | nilai stok produk yang tidak terjual pada periode |
| Laba berisiko hilang | kekurangan hari × jual/hari × laba per unit |
| Skor kesehatan stok | rata-rata bobot status produk (0-100) |
Semuanya bisa diunduh sebagai CSV bertanggal untuk membandingkan sebelum dan sesudah.

## 3. Estimasi manfaat (kalkulator) dan batasnya
Tiga komponen, rumus tampil di aplikasi:
1. **Laba hilang yang dicegah** = kejadian/bulan × laba hilang per kejadian × % yang berhasil dicegah.
2. **Biaya modal yang dihemat** = modal tertahan × % yang dilepas × biaya modal per bulan.
3. **Nilai waktu** = jam manual per minggu × 4,345 × % terhemat × nilai jam kerja. Ini **bukan uang tunai**; karena itu aplikasi menampilkan "manfaat tunai saja" terpisah dan memberi peringatan bila nilai waktu mendominasi.

Semua persentase dan nilai jam kerja adalah **asumsi awal**, bukan hasil studi. Dengan data demo, manfaat tunai saja bisa lebih kecil dari usulan harga langganan; aplikasi menampilkannya apa adanya.

## 4. Model bisnis (usulan, belum divalidasi)
| Unsur | Isi |
|---|---|
| Pelanggan | pemilik toko kelontong, sembako, perlengkapan rumah tangga dengan puluhan sampai beberapa ratus transaksi per hari |
| Pendapatan | langganan bulanan per toko; **usulan awal Rp49.000/bulan, belum diuji ke pelanggan**. Harga maksimum yang masih untung dihitung kalkulator dari data toko |
| Biaya variabel | penyimpanan data ±28 MB per toko per tahun pada 100 struk/hari (lihat `SCALABILITY.md`); biaya per GB tergantung penyedia dan harus Anda isi |
| Saluran | belum diuji; kandidat: komunitas pemilik toko, distributor/pemasok sembako, pelatihan UMKM |
| Risiko utama | toko enggan mencatat setiap penjualan (kebiasaan), bukan teknologi. Inilah yang diuji pilot |

Titik impas = biaya tetap bulanan ÷ (harga − biaya variabel per toko). Isi biaya tetap Anda sendiri; angka tidak diasumsikan di sini.

## 5. Protokol pilot 4 minggu (yang akan menjadi bukti)
1. **Minggu 0**: 3-5 toko; catat baseline (kejadian stok habis sebulan terakhir, nilai stok menumpuk, jam pencatatan per minggu) dan unduh laporan CSV.
2. **Minggu 1-4**: toko mencatat penjualan dan penerimaan barang; unduh CSV tiap minggu.
3. **Akhir**: bandingkan dengan baseline; ganti kolom asumsi kalkulator dengan hasil nyata.
4. **Kriteria sukses ditetapkan sebelum mulai** (contoh: kejadian stok habis turun ≥30%, ≥70% hari penjualan tercatat). Laporkan juga toko yang tidak membaik dan alasannya.
5. Ukuran kepatuhan penting: persentase hari dengan minimal satu penjualan tercatat. Tanpa itu, angka stok tidak bermakna.

## 6. Yang belum ada
Tidak ada data pilot, wawancara, atau pelanggan berbayar. Seluruh angka manfaat di aplikasi adalah estimasi dari asumsi yang bisa diubah.
