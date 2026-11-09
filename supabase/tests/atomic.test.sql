-- Tes fungsi atomik + RLS. Dijalankan oleh run.sh (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP on
\set QUIET on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','a@x.test'), ('00000000-0000-0000-0000-00000000000b','b@x.test');

-- helper: jalankan sebagai pengguna tertentu
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

\echo '== setup: bisnis A dan B'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \g /dev/null
insert into businesses (id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Toko A');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \g /dev/null
insert into businesses (id, owner_id, name) values ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','Toko B');
-- B tidak boleh membuat bisnis atas nama A (RLS with check)
do $$ begin
  begin insert into businesses (owner_id, name) values ('00000000-0000-0000-0000-00000000000a','Palsu'); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%row-level security%', 'RLS businesses: ' || sqlerrm; end;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \g /dev/null
\echo '== create_product'
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'gula', create_product('aaaaaaaa-0000-0000-0000-000000000001','Gula',  'Sembako', 15000, 12000, 10, 3, 'kg');
insert into ids select 'beras', create_product('aaaaaaaa-0000-0000-0000-000000000001','Beras','Sembako', 70000, 60000,  5, 2, 'karung');
insert into ids select 'nol',   create_product('aaaaaaaa-0000-0000-0000-000000000001','Kosong','Sembako', 1000, 500, 0, 0, 'pcs');
do $$ begin
  assert (select count(*) from stock_movements where movement_type='opening') = 2, 'opening hanya untuk stok > 0';
  begin perform create_product('aaaaaaaa-0000-0000-0000-000000000001',' gula ','x',1,1,1,1,'kg'); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%sudah ada%', 'duplikat: ' || sqlerrm; end;
  begin perform create_product('aaaaaaaa-0000-0000-0000-000000000001','Z','x',0,1,1,1,'kg'); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Harga jual%', 'harga: ' || sqlerrm; end;
  begin perform create_product('aaaaaaaa-0000-0000-0000-000000000001','Z','x',1,1,1.5,1,'kg'); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%bilangan bulat%', 'stok desimal: ' || sqlerrm; end;
end $$;

\echo '== create_sale multi-item'
insert into ids select 'struk1', create_sale('aaaaaaaa-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('product_id',(select v from ids where k='gula'),'quantity',4), jsonb_build_object('product_id',(select v from ids where k='beras'),'quantity',2)));
do $$ begin
  assert (select stock from products where name='Gula') = 6, 'stok gula';
  assert (select stock from products where name='Beras') = 3, 'stok beras';
  assert (select total from sales where id=(select v from ids where k='struk1')) = 4*15000 + 2*70000, 'total struk';
  assert (select count(*) from sale_items where sale_id=(select v from ids where k='struk1')) = 2, 'jumlah item';
  assert (select unit_cost from sale_items where product_name_snapshot='Gula') = 12000, 'snapshot modal';
  assert (select balance_after from stock_movements where movement_type='sale' and product_name_snapshot='Gula') = 6, 'saldo buku stok';
end $$;

\echo '== atomik: item kedua gagal => item pertama TIDAK berubah'
do $$ declare before_g numeric; before_s bigint; begin
  select stock into before_g from products where name='Gula'; select count(*) into before_s from sales;
  begin
    perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
      jsonb_build_object('product_id',(select v from ids where k='gula'),'quantity',1),
      jsonb_build_object('product_id',(select v from ids where k='beras'),'quantity',99)));
    raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like 'Stok Beras tidak cukup (tersisa 3, diminta 99)%', 'pesan: ' || sqlerrm; end;
  assert (select stock from products where name='Gula') = before_g, 'gula harus tetap (rollback)';
  assert (select count(*) from sales) = before_s, 'tidak ada struk setengah jadi';
end $$;

\echo '== validasi create_sale'
do $$ declare g uuid := (select v from ids where k='gula'); begin
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',g,'quantity',4), jsonb_build_object('product_id',g,'quantity',4))); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like 'Stok Gula tidak cukup%', 'baris ganda digabung: ' || sqlerrm; end;
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',g,'quantity',0))); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%bilangan bulat%', 'qty 0: ' || sqlerrm; end;
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',g,'quantity',1.5))); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%bilangan bulat%', 'qty desimal: ' || sqlerrm; end;
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%minimal satu%', 'kosong: ' || sqlerrm; end;
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',gen_random_uuid(),'quantity',1))); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Produk tidak ditemukan%', 'produk tak ada: ' || sqlerrm; end;
  assert (select stock from products where name='Gula') = 6, 'stok utuh setelah semua kegagalan';
end $$;

\echo '== RLS: pengguna B tidak bisa melihat atau menyentuh data A'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \g /dev/null
do $$ declare g uuid := (select v from ids where k='gula'); s uuid := (select v from ids where k='struk1'); begin
  assert (select count(*) from products) = 0, 'B melihat produk A';
  assert (select count(*) from sales) = 0 and (select count(*) from stock_movements) = 0 and (select count(*) from sale_items) = 0, 'B melihat transaksi A';
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',g,'quantity',1))); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Bisnis tidak ditemukan%', 'B jual di bisnis A: ' || sqlerrm; end;
  begin perform void_sale(s); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Transaksi tidak ditemukan%', 'B batalkan struk A: ' || sqlerrm; end;
  begin perform receive_stock(g, 5, 1000); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Produk tidak ditemukan%', 'B terima barang A: ' || sqlerrm; end;
  begin perform adjust_stock(g, 1); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Produk tidak ditemukan%', 'B opname A: ' || sqlerrm; end;
  begin perform delete_product(g); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Produk tidak ditemukan%', 'B hapus produk A: ' || sqlerrm; end;
  begin perform create_product('aaaaaaaa-0000-0000-0000-000000000001','Selundupan','x',1,1,1,1,'kg'); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Bisnis tidak ditemukan%', 'B buat produk di A: ' || sqlerrm; end;
end $$;
-- anon sama sekali tidak boleh memanggil fungsi
reset role; set role anon;
do $$ begin
  begin perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%permission denied%', 'anon: ' || sqlerrm; end;
end $$;
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \g /dev/null

\echo '== void_sale: stok kembali, struk hilang, retur tercatat'
do $$ declare n integer; begin
  n := void_sale((select v from ids where k='struk1'));
  assert n = 2, 'dua item dibatalkan';
  assert (select stock from products where name='Gula') = 10 and (select stock from products where name='Beras') = 5, 'stok kembali';
  assert (select count(*) from sales) = 0 and (select count(*) from sale_items) = 0, 'struk terhapus';
  assert (select count(*) from stock_movements where movement_type='return') = 2, 'retur tercatat';
end $$;

\echo '== receive_stock: rata-rata tertimbang'
do $$ declare b numeric; begin
  perform create_sale('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('product_id',(select v from ids where k='gula'),'quantity',5))); -- stok 5, modal 12000
  b := receive_stock((select v from ids where k='gula'), 5, 14000, 'Faktur 1');   -- (5*12000+5*14000)/10 = 13000
  assert b = 10, 'saldo';
  assert (select unit_cost from products where name='Gula') = 13000, 'modal rata-rata: ' || (select unit_cost from products where name='Gula');
  assert (select unit_cost from sale_items where product_name_snapshot='Gula') = 12000, 'modal penjualan lama tak berubah';
  assert (select count(*) from purchases where total = 70000 and status='received') = 1 and (select count(*) from purchase_items) = 1, 'catatan pembelian';
  assert (select note from stock_movements where movement_type='purchase') = 'Faktur 1', 'catatan';
  b := receive_stock((select v from ids where k='nol'), 4, 7777);                    -- dari stok 0: modal = harga beli
  assert (select unit_cost from products where name='Kosong') = 7777, 'modal dari stok nol';
  begin perform receive_stock((select v from ids where k='gula'), 0, 1); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Jumlah diterima%', 'qty 0: ' || sqlerrm; end;
  begin perform receive_stock((select v from ids where k='gula'), 1, -1); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Harga beli%', 'harga negatif: ' || sqlerrm; end;
end $$;

\echo '== adjust_stock'
do $$ begin
  perform adjust_stock((select v from ids where k='gula'), 8, 'Rusak 2');
  assert (select stock from products where name='Gula') = 8, 'stok opname';
  assert (select quantity_delta from stock_movements where movement_type='adjustment') = -2, 'selisih';
  begin perform adjust_stock((select v from ids where k='gula'), 8); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%sama dengan stok sistem%', 'tanpa selisih: ' || sqlerrm; end;
  begin perform adjust_stock((select v from ids where k='gula'), -1); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%Stok fisik%', 'negatif: ' || sqlerrm; end;
end $$;

\echo '== delete_product'
do $$ begin
  begin perform delete_product((select v from ids where k='gula')); raise exception 'SEHARUSNYA GAGAL';
  exception when others then assert sqlerrm like '%riwayat penjualan%', 'produk terjual: ' || sqlerrm; end;
  perform delete_product((select v from ids where k='beras'));
  assert not exists (select 1 from products where name='Beras'), 'beras terhapus';
end $$;

\echo '== invarian: saldo buku stok terakhir = stok produk, tidak ada stok negatif'
do $$ declare bad bigint; begin
  select count(*) into bad from products p
   where p.stock <> (select m.balance_after from stock_movements m where m.product_id = p.id order by m.created_at desc, m.id desc limit 1);
  -- created_at sama dalam satu transaksi; gunakan total delta sebagai pembanding yang tidak bergantung urutan
  select count(*) into bad from products p where p.stock <> coalesce((select sum(quantity_delta) from stock_movements m where m.product_id = p.id), 0);
  assert bad = 0, 'jumlah delta buku stok harus sama dengan stok produk';
  assert (select count(*) from products where stock < 0) = 0, 'tidak ada stok negatif';
end $$;
\echo 'SEMUA TES SQL LULUS'
