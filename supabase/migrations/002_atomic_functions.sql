-- StokCerdas: fungsi atomik untuk stok. Jalankan SETELAH schema.sql.
--
-- Prinsip desain:
--  * Semua fungsi SECURITY INVOKER: berjalan sebagai pengguna yang login, sehingga Row Level Security
--    tetap berlaku. Pengguna tidak bisa menyentuh data bisnis orang lain walau menebak UUID-nya.
--  * Setiap fungsi satu transaksi: jika ada satu item gagal, SEMUA perubahan dibatalkan.
--  * Baris produk dikunci (SELECT ... FOR UPDATE) dalam urutan id yang tetap, sehingga dua kasir yang
--    menjual stok terakhir bersamaan tidak membuat stok minus dan tidak saling deadlock.
--  * Pesan galat berbahasa Indonesia agar bisa langsung ditampilkan di aplikasi.

alter table public.products add column if not exists image_name text not null default '';
alter table public.products add column if not exists image_data text not null default '';
alter table public.stock_movements add column if not exists balance_after numeric(14,3);
create unique index if not exists products_business_name_uk on public.products (business_id, lower(trim(name)));

create or replace function public._log_movement(p_business uuid, p_product uuid, p_name text, p_type text, p_delta numeric, p_balance numeric, p_note text)
returns void language sql set search_path = public as $$
  insert into stock_movements (business_id, product_id, product_name_snapshot, movement_type, quantity_delta, balance_after, note)
  values (p_business, p_product, p_name, p_type, p_delta, p_balance, p_note);
$$;

create or replace function public.create_product(
  p_business uuid, p_name text, p_category text, p_price numeric, p_cost numeric,
  p_stock numeric, p_min_stock numeric, p_unit text, p_image_name text default '', p_image_data text default '')
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if not exists (select 1 from businesses where id = p_business) then raise exception 'Bisnis tidak ditemukan.'; end if;
  if v_name = '' then raise exception 'Nama produk wajib diisi.'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Harga jual harus lebih dari 0.'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'Modal beli harus berupa angka 0 atau lebih.'; end if;
  if p_stock is null or p_stock < 0 or p_stock <> trunc(p_stock) then raise exception 'Stok harus bilangan bulat 0 atau lebih.'; end if;
  if p_min_stock is null or p_min_stock < 0 or p_min_stock <> trunc(p_min_stock) then raise exception 'Batas minimum harus bilangan bulat 0 atau lebih.'; end if;
  if exists (select 1 from products where business_id = p_business and lower(trim(name)) = lower(v_name)) then
    raise exception 'Produk “%” sudah ada.', v_name;
  end if;
  insert into products (business_id, name, category, selling_price, unit_cost, stock, min_stock, unit, image_name, image_data)
  values (p_business, v_name, coalesce(p_category, 'Lainnya'), p_price, p_cost, p_stock, p_min_stock, coalesce(nullif(trim(p_unit), ''), 'pcs'), coalesce(p_image_name, ''), coalesce(p_image_data, ''))
  returning id into v_id;
  if p_stock > 0 then perform _log_movement(p_business, v_id, v_name, 'opening', p_stock, p_stock, 'Stok awal'); end if;
  return v_id;
end $$;

-- p_lines: [{"product_id":"<uuid>","quantity":2}, ...]. Mengembalikan id struk (sales.id).
create or replace function public.create_sale(p_business uuid, p_lines jsonb, p_sold_at timestamptz default now())
returns uuid language plpgsql set search_path = public as $$
declare v_sale uuid; r record; prod products%rowtype;
begin
  if not exists (select 1 from businesses where id = p_business) then raise exception 'Bisnis tidak ditemukan.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Tambahkan minimal satu produk.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity numeric) where x.product_id is null or x.quantity is null or x.quantity < 1 or x.quantity <> trunc(x.quantity)) then
    raise exception 'Jumlah harus bilangan bulat 1 atau lebih.';
  end if;
  insert into sales (business_id, sold_at, total) values (p_business, p_sold_at, 0) returning id into v_sale;
  -- baris dengan produk sama digabung; urutan id tetap = tidak ada deadlock antar kasir
  for r in select x.product_id, sum(x.quantity) as qty from jsonb_to_recordset(p_lines) as x(product_id uuid, quantity numeric) group by x.product_id order by x.product_id loop
    select * into prod from products where id = r.product_id and business_id = p_business and active for update;
    if not found then raise exception 'Produk tidak ditemukan.'; end if;
    if prod.stock < r.qty then raise exception 'Stok % tidak cukup (tersisa %, diminta %).', prod.name, trim(trailing '.' from trim(trailing '0' from prod.stock::text)), r.qty::bigint; end if;
    update products set stock = stock - r.qty, updated_at = now() where id = prod.id;
    insert into sale_items (sale_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost) values (v_sale, prod.id, prod.name, r.qty, prod.selling_price, prod.unit_cost);
    perform _log_movement(p_business, prod.id, prod.name, 'sale', -r.qty, prod.stock - r.qty, 'Penjualan');
  end loop;
  update sales set total = (select coalesce(sum(line_total), 0) from sale_items where sale_id = v_sale) where id = v_sale;
  return v_sale;
end $$;

-- Membatalkan seluruh struk dan mengembalikan stok. Mengembalikan jumlah item yang dibatalkan.
create or replace function public.void_sale(p_sale uuid)
returns integer language plpgsql set search_path = public as $$
declare v_business uuid; r record; prod products%rowtype; n integer := 0;
begin
  select business_id into v_business from sales where id = p_sale for update;
  if not found then raise exception 'Transaksi tidak ditemukan.'; end if;
  for r in select product_id, sum(quantity) as qty from sale_items where sale_id = p_sale and product_id is not null group by product_id order by product_id loop
    select * into prod from products where id = r.product_id for update;
    if found then
      update products set stock = stock + r.qty, updated_at = now() where id = prod.id;
      perform _log_movement(v_business, prod.id, prod.name, 'return', r.qty, prod.stock + r.qty, 'Pembatalan penjualan');
    end if;
  end loop;
  select count(*) into n from sale_items where sale_id = p_sale;
  delete from sales where id = p_sale;
  return n;
end $$;

-- Penerimaan barang: stok naik, modal per unit = rata-rata tertimbang (dibulatkan ke rupiah). Modal pada penjualan lama tidak berubah.
create or replace function public.receive_stock(p_product uuid, p_quantity numeric, p_unit_cost numeric, p_note text default null)
returns numeric language plpgsql set search_path = public as $$
declare prod products%rowtype; v_balance numeric; v_cost numeric; v_purchase uuid;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity <> trunc(p_quantity) then raise exception 'Jumlah diterima harus bilangan bulat 1 atau lebih.'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga beli per unit harus berupa angka 0 atau lebih.'; end if;
  select * into prod from products where id = p_product for update;
  if not found then raise exception 'Produk tidak ditemukan.'; end if;
  v_balance := prod.stock + p_quantity;
  v_cost := round((prod.stock * prod.unit_cost + p_quantity * p_unit_cost) / v_balance, 0);
  update products set stock = v_balance, unit_cost = v_cost, updated_at = now() where id = prod.id;
  insert into purchases (business_id, total, status, notes) values (prod.business_id, p_quantity * p_unit_cost, 'received', nullif(trim(coalesce(p_note, '')), '')) returning id into v_purchase;
  insert into purchase_items (purchase_id, product_id, product_name_snapshot, quantity, unit_cost) values (v_purchase, prod.id, prod.name, p_quantity, p_unit_cost);
  perform _log_movement(prod.business_id, prod.id, prod.name, 'purchase', p_quantity, v_balance, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Penerimaan barang'));
  return v_balance;
end $$;

-- Stok opname: menyamakan stok sistem dengan hitungan fisik; selisih tercatat di buku stok.
create or replace function public.adjust_stock(p_product uuid, p_new_stock numeric, p_note text default null)
returns numeric language plpgsql set search_path = public as $$
declare prod products%rowtype; v_delta numeric;
begin
  if p_new_stock is null or p_new_stock < 0 or p_new_stock <> trunc(p_new_stock) then raise exception 'Stok fisik harus bilangan bulat 0 atau lebih.'; end if;
  select * into prod from products where id = p_product for update;
  if not found then raise exception 'Produk tidak ditemukan.'; end if;
  v_delta := p_new_stock - prod.stock;
  if v_delta = 0 then raise exception 'Stok fisik sama dengan stok sistem. Tidak ada yang perlu disesuaikan.'; end if;
  update products set stock = p_new_stock, updated_at = now() where id = prod.id;
  perform _log_movement(prod.business_id, prod.id, prod.name, 'adjustment', v_delta, p_new_stock, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Stok opname'));
  return p_new_stock;
end $$;

-- Produk yang pernah terjual tidak boleh dihapus (riwayat harus utuh).
create or replace function public.delete_product(p_product uuid)
returns void language plpgsql set search_path = public as $$
declare prod products%rowtype;
begin
  select * into prod from products where id = p_product for update;
  if not found then raise exception 'Produk tidak ditemukan.'; end if;
  if exists (select 1 from sale_items where product_id = p_product) then
    raise exception '“%” punya riwayat penjualan sehingga tidak bisa dihapus. Batalkan penjualannya dulu, atau biarkan produk tetap ada.', prod.name;
  end if;
  delete from products where id = p_product;
end $$;

-- Hanya pengguna login (role authenticated) yang boleh memanggil; anon dan publik ditolak.
revoke all on function public._log_movement(uuid, uuid, text, text, numeric, numeric, text) from public, anon;
grant execute on function public._log_movement(uuid, uuid, text, text, numeric, numeric, text) to authenticated;
revoke all on function public.create_product(uuid, text, text, numeric, numeric, numeric, numeric, text, text, text) from public, anon;
revoke all on function public.create_sale(uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.void_sale(uuid) from public, anon;
revoke all on function public.receive_stock(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.adjust_stock(uuid, numeric, text) from public, anon;
revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.create_product(uuid, text, text, numeric, numeric, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.create_sale(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.void_sale(uuid) to authenticated;
grant execute on function public.receive_stock(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
