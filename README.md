# StokCerdas — GTNIC 2026 Web Development

## Konsep
StokCerdas adalah konsep platform **Smart Inventory & Business Intelligence untuk toko retail kecil**: toko sembako, toko kelontong, dan toko perlengkapan rumah tangga. Fokusnya membantu pemilik toko memantau stok, penjualan, estimasi margin, dan keputusan restok.

## Masalah & relevansi
**Masalah.** Toko kelontong, sembako, dan perlengkapan rumah tangga umumnya mencatat stok secara manual. Akibatnya terjadi dua kerugian yang berulang: barang laris **kehabisan** (penjualan dan kepercayaan pelanggan hilang) dan barang tidak laku **menumpuk** (modal tertahan). Pencatatan manual juga rawan salah. Gambaran ini sejalan dengan [UKM Indonesia](https://ukmindonesia.id/baca-deskripsi-posts/stok-barang-sering-kacau-saatnya-umkm-kenali-software-inventory-management), yang menjelaskannya secara kualitatif tanpa statistik.

**Skala konteks.** UMKM berkontribusi sekitar 60% PDB (60,51%, [CNBC Indonesia, 24 Jan 2025](https://www.cnbcindonesia.com/news/20250124132315-4-605701/umkm-masih-jadi-kontributor-besar-buat-ekonomi-10-tahun-mendatang), dikutip dari BRI; sekitar Rp9.580 triliun pada 2023 menurut [RCTI+, 15 Jun 2025](https://www.rctiplus.com/news/detail/idxchannel/4785294/kontribusi-umkm-capai-60-persen-terhadap-pdb--pemerintah-dorong-akses-ke-pasar-global), mengutip Kementerian UMKM) dan menyerap hingga sekitar 97% tenaga kerja. Catatan: angka ini untuk seluruh UMKM, bukan khusus retail, dan kedua artikel tidak menyebut sumber primer data.

## Inovasi
1. **Ukuran dinamis, bukan batas minimum tetap**: status stok dihitung dari kecepatan jual per produk (hari stok tersisa).
2. **Dampak dalam rupiah**: *laba berisiko hilang* (stok habis sebelum restok tiba) dan *modal tertahan* (stok yang tidak terjual).
3. **Skor kesehatan stok 0-100** dan saran jumlah serta anggaran restok.
4. **Transparan**: rumus ditampilkan di aplikasi, asumsi lead time 3 hari dan safety stock 2 hari dapat disesuaikan. Ini rule-based, bukan model AI terlatih.

Logika ada di `src/lib/analytics.ts` dan diuji dengan `npm test` (Node >= 22.6). Tab **Masalah & Solusi** di aplikasi memetakan masalah, fitur, dan angka bukti dari data.

## Validasi lapangan (belum dilakukan, lakukan sebelum final)
Wawancara 3-5 pemilik toko (15 menit), lalu isi hasilnya di slide dan README ini. Pertanyaan yang disarankan:
1. Bagaimana Anda mencatat stok sekarang (buku, ingatan, aplikasi)?
2. Dalam sebulan terakhir, berapa kali barang laris habis saat pembeli datang? Perkiraan kerugiannya?
3. Barang apa yang menumpuk dan sudah berapa lama? Perkiraan nilainya?
4. Berapa lama Anda butuh untuk mengecek stok dan menghitung laba tiap minggu?
5. Apakah Anda akan memakai alat ini? Apa yang membuat Anda berhenti memakainya?

Ringkas jawabannya dalam tabel: nama toko (boleh inisial), jenis toko, cara mencatat, kejadian stok habis per bulan, nilai modal menumpuk, komentar. Hanya tulis angka yang benar-benar Anda dapatkan.

## Teknologi
- Next.js 14 App Router, React 18, TypeScript
- Recharts dan Lucide React
- Dua sumber data di balik satu antarmuka `DataSource`: **mode lokal** (LocalStorage, tanpa akun) dan **mode cloud** (Supabase Auth + PostgreSQL + RLS)
- Supabase/PostgreSQL: skema di `supabase/schema.sql`, fungsi atomik di `supabase/migrations/002_atomic_functions.sql`
- Arsitektur lengkap dan keputusan desain: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Skalabilitas terukur: [`docs/SCALABILITY.md`](docs/SCALABILITY.md); dampak bisnis dan protokol pilot: [`docs/IMPACT.md`](docs/IMPACT.md)

## Fitur prototype saat ini
- Dashboard omzet, modal barang terjual, estimasi laba, biaya operasional, dan nilai barang rusak/hilang
- Grafik penjualan dan filter periode
- Katalog produk retail dengan kategori dan satuan umum
- Penjualan multi-item dalam satu struk; stok berkurang otomatis, tidak boleh negatif, dan bersifat atomik (jika satu item gagal, tidak ada yang tersimpan)
- Pembatalan penjualan/retur: seluruh struk dibatalkan dan stok dikembalikan
- Edit dan hapus produk (produk yang punya riwayat penjualan tidak bisa dihapus)
- Penerimaan barang dari pemasok dengan modal rata-rata tertimbang (modal transaksi lama tidak berubah)
- Stok opname: menyamakan stok sistem dengan hitungan fisik, selisih tercatat
- Buku stok (riwayat pergerakan): awal, penjualan, retur, pembelian, penyesuaian
- Cadangan data JSON (unduh/pulihkan), pemeriksaan integritas data, dan pembersihan data rusak saat memuat
- Pencarian transaksi dan produk
- Peringatan stok minimum
- Pencatatan biaya operasional dan barang rusak/hilang
- Insight AksiCerdas berbasis aturan: stok rendah, kontribusi margin, barang belum terjual, dan saran restok sederhana
- Panel Kesehatan Stok: hari stok tersisa, laba berisiko hilang, modal tertahan, skor 0-100
- Tab Masalah & Solusi: pemetaan masalah, fitur, dan bukti dari data
- Tab Dampak Bisnis: indikator terukur, kalkulator estimasi manfaat (tunai dan waktu dipisah, asumsi berlabel), dan laporan dampak CSV untuk pilot
- Meter kapasitas penyimpanan lokal dengan peringatan sebelum penuh
- Simulasi harga dan volume serta ekspor transaksi CSV

## Penting: status implementasi
- **Mode lokal** (default, tanpa konfigurasi): seluruh fitur berjalan dan data tersimpan di browser perangkat ini.
- **Mode cloud** (Supabase): kode login, `CloudSource`, dan fungsi SQL atomik sudah ada. Fungsi SQL **sudah diuji di PostgreSQL sungguhan** (`npm run test:sql`: atomik, RLS antar pengguna, konkurensi). Pemanggilan dan pemetaan dari aplikasi diuji dengan klien palsu. **Belum diuji terhadap proyek Supabase Anda**, jadi lakukan uji manual sebelum dipakai di kompetisi.
- Insight restok adalah decision-support berbasis aturan, bukan model machine learning terlatih atau AI generatif. Asumsi contoh: lead time 3 hari dan safety stock 2 hari; ubah sesuai data pemasok nyata.
- Jangan pernah mengekspos service-role key di browser.

## Mengaktifkan Supabase (mode cloud)
1. Buat proyek di Supabase. Di *SQL Editor*, jalankan berurutan: `supabase/schema.sql`, `supabase/migrations/002_atomic_functions.sql`, lalu `supabase/migrations/003_scale_indexes.sql`.
2. Di *Authentication*, aktifkan Email. Untuk demo cepat, matikan "Confirm email" (atau konfirmasi lewat email).
3. Salin `.env.example` menjadi `.env.local`, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` (kunci *anon*, bukan service-role).
4. `npm run dev`, daftar akun, lalu coba: tambah produk, catat penjualan, batalkan, terima barang. Buka akun kedua dan pastikan datanya terpisah.
Tanpa langkah ini aplikasi tetap berjalan di mode lokal.

## Struktur proyek
```
src/app/            halaman, layout, error boundary
src/components/     AuthGate, Dashboard, komponen tampilan
src/lib/            inventory (aturan stok), analytics, source (DataSource + lokal), cloud (Supabase), supabase (klien)
supabase/           schema.sql, migrations/ (002 fungsi atomik, 003 indeks skala), tests/ (PostgreSQL lokal)
tests/              unit, kontrak sumber data, e2e/ (Playwright)
docs/                ARCHITECTURE.md, SCALABILITY.md, IMPACT.md
.github/workflows/ci.yml
```

## Kualitas sistem
- **Logika terpisah dari UI**: seluruh aturan bisnis ada di `src/lib/inventory.ts` (fungsi murni, tanpa React). Setiap operasi mengembalikan state baru atau pesan galat, jadi gagal berarti tidak ada perubahan.
- **Validasi ketat**: bilangan bulat untuk stok dan jumlah, nama produk unik, harga/modal tidak negatif, stok tidak boleh kurang dari 0.
- **Tanggal lokal**: transaksi memakai tanggal perangkat, bukan UTC, sehingga transaksi dini hari tidak mundur sehari.
- **Data tahan rusak**: data tersimpan dan berkas cadangan disanitasi saat dimuat; baris rusak dibuang dan pengguna diberi tahu.
- **Pengujian otomatis**: `npm test` (Node >= 22.6) menjalankan tes penjualan atomik, retur, modal rata-rata, opname, integritas, sanitasi, dan cadangan. Tes ini belum menguji tampilan; uji manual alur di bagian Demo.
- **Batasan**: penyimpanan masih LocalStorage satu perangkat, tanpa login. Satu struk hanya mencatat harga saat ini (belum ada diskon). Buku stok dibatasi 1000 entri terbaru.

## Menjalankan di Windows
Persyaratan: Node.js 20 LTS direkomendasikan (minimal 18.17) dan npm.

```bat
npm.cmd install
npm.cmd run dev
```

Buka `http://localhost:3000`. Pemeriksaan:

```bat
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Uji lain: `npm run test:e2e` (UI di Chromium; sekali saja `npx playwright install chromium`), `npm run test:sql` (butuh PostgreSQL terpasang; Linux/macOS/WSL), `npm run test:sql:scale` (210 ribu struk; ±15 detik di sandbox uji, lebih lama di mesin lambat), dan `npm run bench` (logika di browser dengan 100 ribu penjualan). CI GitHub Actions ada di `.github/workflows/ci.yml` dan belum pernah dijalankan.

## Demo yang disarankan
1. Tambahkan produk retail.
2. Catat penjualan dan tunjukkan stok berkurang.
3. Buka Persediaan untuk melihat stok kritis.
4. Buka AksiCerdas untuk melihat alasan rekomendasi restok.
5. Catat biaya dan barang rusak/hilang.
6. Catat penjualan multi-item, lalu batalkan struknya dan tunjukkan stok kembali.
7. Terima barang dari pemasok, lalu lakukan stok opname dan lihat Riwayat pergerakan stok.
8. Unduh cadangan, reset data demo, lalu pulihkan dari cadangan.
9. Tunjukkan ringkasan bisnis dan ekspor CSV.

## Definisi metrik
- Omzet = jumlah harga jual × kuantitas transaksi.
- Modal barang terjual = snapshot modal per unit × kuantitas.
- Laba estimasi prototype = omzet − modal barang terjual − biaya operasional − nilai barang rusak/hilang yang dicatat.
- Margin estimasi = laba estimasi ÷ omzet × 100% (0% jika omzet nol).
- Rekomendasi restok menggunakan rata-rata penjualan pada periode terpilih, asumsi lead time 3 hari, dan safety stock 2 hari. Hasil harus ditinjau pemilik toko.

## Rencana pengembangan
1. Validasi masalah melalui wawancara pemilik toko retail.
2. Uji mode cloud terhadap proyek Supabase sungguhan dan perbaiki bila ada selisih.
3. Paginasi data, foto ke Supabase Storage, peran kasir vs pemilik.
4. Tambahkan supplier dan purchase order (tabelnya sudah ada di skema).
5. Perluas uji: RLS untuk semua tabel, keamanan, aksesibilitas, dan responsivitas.
6. Ukur manfaat dengan indikator stockout, dead stock, akurasi stok, dan nilai modal tertahan.

Prototype ini merupakan fondasi pengembangan, bukan sistem akuntansi atau inventory produksi yang sudah terverifikasi.
