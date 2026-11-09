-- StokCerdas: indeks untuk skala. Jalankan SETELAH 002_atomic_functions.sql. Aman dijalankan ulang.
--
-- Latar belakang (diukur dengan supabase/tests/scale.sh pada 210 ribu struk / 420 ribu item):
-- kolom kunci asing berikut tidak punya indeks, sehingga operasi inti melakukan Seq Scan pada tabel besar.
--   tanpa indeks: create_sale ~231 ms, void_sale ~280 ms, memuat penjualan 90 hari + item ~23.000 ms
--   (lihat docs/SCALABILITY.md untuk angka sesudah indeks)
--
-- Catatan produksi: pada tabel yang sudah sangat besar, jalankan tiap CREATE INDEX secara terpisah dengan
-- CONCURRENTLY (tidak bisa di dalam transaksi) agar tidak mengunci penulisan.

create index if not exists sale_items_sale_idx          on public.sale_items (sale_id);
create index if not exists sale_items_product_idx       on public.sale_items (product_id) where product_id is not null;
create index if not exists stock_movements_product_idx  on public.stock_movements (product_id, created_at desc) where product_id is not null;
create index if not exists purchase_items_purchase_idx  on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_idx   on public.purchase_items (product_id) where product_id is not null;
create index if not exists purchases_supplier_idx       on public.purchases (supplier_id) where supplier_id is not null;
create index if not exists businesses_owner_idx         on public.businesses (owner_id);

analyze public.sale_items; analyze public.stock_movements;
