-- Uji skala: satu toko besar (3.000 produk, 150 ribu struk, ~300 ribu item) + 30 toko kecil di database yang sama.
-- Mengukur latensi operasi inti DI BAWAH RLS (sebagai pengguna login) dan memastikan query muat memakai indeks.
-- Dijalankan oleh scale.sh. Angka latensi bergantung mesin; ambang sengaja longgar agar tidak mudah flaky.
\set ON_ERROR_STOP on
\set QUIET on

-- ---------- seed (superuser, melewati RLS) ----------
insert into auth.users (id, email) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@x.test' from generate_series(1, 31) g;
insert into businesses (id, owner_id, name) select ('b0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Toko ' || g from generate_series(1, 31) g;
-- bisnis 1 = toko besar; 2..31 = toko kecil

create temp table seed_products as
  select b.id as business_id, gs.n, gen_random_uuid() as id
  from businesses b join lateral generate_series(1, case when b.name = 'Toko 1' then 3000 else 50 end) gs(n) on true;
insert into products (id, business_id, name, selling_price, unit_cost, stock, min_stock, unit)
  select id, business_id, 'Produk ' || n, 10000, 8000, 1000000, 5, 'pcs' from seed_products;
create index on seed_products (business_id, n);
analyze seed_products;

create temp table seed_sales as
  select b.id as business_id, gs.n, gen_random_uuid() as id,
         now() - ((gs.n % 730) || ' days')::interval - ((gs.n * 37 % 86400) || ' seconds')::interval as sold_at
  from businesses b join lateral generate_series(1, case when b.name = 'Toko 1' then 150000 else 2000 end) gs(n) on true;
insert into sales (id, business_id, sold_at, total) select id, business_id, sold_at, 20000 from seed_sales;
insert into sale_items (sale_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost)
  select s.id, p.id, 'Produk', 1, 10000, 8000
  from seed_sales s
  join lateral (values (1), (2)) k(k) on true
  join seed_products p on p.business_id = s.business_id
   and p.n = ((s.n * (case when k.k = 1 then 1 else 7 end)) % (case when s.business_id = 'b0000000-0000-0000-0000-000000000001' then 3000 else 50 end)) + 1;
insert into stock_movements (business_id, product_id, product_name_snapshot, movement_type, quantity_delta, balance_after, created_at)
  select p.business_id, p.id, 'Produk', 'sale', -1, 999999, now() - ((g % 730) || ' days')::interval
  from seed_products p join lateral generate_series(1, case when p.business_id = 'b0000000-0000-0000-0000-000000000001' then 50 else 20 end) g on true;
analyze;

select 'DATA: struk=' || (select count(*) from sales) || ' item=' || (select count(*) from sale_items) || ' pergerakan=' || (select count(*) from stock_movements) || ' produk=' || (select count(*) from products) as seed \gset
\echo :seed

-- ---------- ukur sebagai pemilik toko besar, di bawah RLS ----------
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false) \g /dev/null

create temp table metrics (name text primary key, ms numeric);
grant all on metrics to authenticated;
create temp table made (id uuid);
grant all on made to authenticated;

do $$
declare t0 timestamptz; n int := 200; pid uuid; pid2 uuid; sid uuid; i int; big uuid := 'b0000000-0000-0000-0000-000000000001';
begin
  select id into pid  from products where business_id = big order by name limit 1;
  select id into pid2 from products where business_id = big order by name desc limit 1;

  -- 1) create_sale (2 item) x n
  t0 := clock_timestamp();
  for i in 1..n loop
    insert into made values (create_sale(big, jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1), jsonb_build_object('product_id', pid2, 'quantity', 1))));
  end loop;
  insert into metrics values ('create_sale_ms_per_call', round(extract(epoch from clock_timestamp() - t0) * 1000 / n, 2));

  -- 2) void_sale x n (struk yang baru dibuat)
  t0 := clock_timestamp();
  for sid in select id from made loop perform void_sale(sid); end loop;
  insert into metrics values ('void_sale_ms_per_call', round(extract(epoch from clock_timestamp() - t0) * 1000 / n, 2));

  -- 3) delete_product pada produk baru yang belum pernah terjual x 50
  t0 := clock_timestamp();
  for i in 1..50 loop perform delete_product(create_product(big, 'Sementara ' || i, 'x', 1000, 500, 0, 0, 'pcs')); end loop;
  insert into metrics values ('create_delete_product_ms_per_call', round(extract(epoch from clock_timestamp() - t0) * 1000 / 50, 2));

  -- 4) receive_stock + adjust_stock
  t0 := clock_timestamp();
  for i in 1..100 loop perform receive_stock(pid, 1, 8000); perform adjust_stock(pid, (select stock from products where id = pid) + 1); end loop;
  insert into metrics values ('receive_plus_adjust_ms_per_pair', round(extract(epoch from clock_timestamp() - t0) * 1000 / 100, 2));
end $$;

-- 5) query muat dashboard, persis pola CloudSource: halaman 1000 baris (batas PostgREST) sampai habis, jendela 90 hari
create function pg_temp.time_it(q text) returns numeric language plpgsql as $$
declare t0 timestamptz := clock_timestamp(); begin execute q; return round(extract(epoch from clock_timestamp() - t0) * 1000, 2); end $$;
do $$
declare off int := 0; n int; pages int := 0; t0 timestamptz := clock_timestamp(); total int := 0;
begin
  loop
    select count(*) into n from (
      select s.id, s.sold_at, (select json_agg(i) from sale_items i where i.sale_id = s.id)
      from sales s where s.business_id = 'b0000000-0000-0000-0000-000000000001' and s.sold_at >= now() - interval '90 days'
      order by s.sold_at desc, s.id limit 1000 offset off) x;
    pages := pages + 1; total := total + n; exit when n < 1000; off := off + 1000;
  end loop;
  insert into metrics values ('load_sales_90d_all_pages_ms', round(extract(epoch from clock_timestamp() - t0) * 1000, 2)), ('load_sales_90d_pages', pages), ('load_sales_90d_rows', total);
end $$;
insert into metrics values ('load_products_ms', pg_temp.time_it($q$ select * from products where business_id = 'b0000000-0000-0000-0000-000000000001' and active order by created_at desc limit 5000 $q$));
insert into metrics values ('load_movements_ms', pg_temp.time_it($q$ select * from stock_movements where business_id = 'b0000000-0000-0000-0000-000000000001' order by created_at desc limit 1000 $q$));

select 'METRIK ' || name || ' = ' || ms from metrics order by name \g (tuples_only=on format=unaligned)

-- 6) rencana query: tidak boleh Seq Scan pada tabel besar untuk pola kunci
create function pg_temp.plan(q text) returns text language plpgsql as $$
declare r text; res text := ''; begin for r in execute 'explain ' || q loop res := res || r || E'\n'; end loop; return res; end $$;
create temp table plans (name text, plan text); grant all on plans to authenticated;
insert into plans values
 ('sale_items_by_sale',    pg_temp.plan($q$ select * from sale_items where sale_id = (select id from sales limit 1) $q$)),
 ('sale_items_by_product', pg_temp.plan($q$ select 1 from sale_items where product_id = (select id from products limit 1) limit 1 $q$)),
 ('movements_by_product',  pg_temp.plan($q$ select * from stock_movements where product_id = (select id from products limit 1) order by created_at desc limit 20 $q$));

do $$
declare m record; bad text := ''; lim numeric;
begin
  for m in select * from metrics loop
    lim := case m.name when 'create_sale_ms_per_call' then 25 when 'void_sale_ms_per_call' then 25 when 'create_delete_product_ms_per_call' then 25
                       when 'receive_plus_adjust_ms_per_pair' then 25 when 'load_sales_90d_all_pages_ms' then 3000 when 'load_sales_90d_pages' then 1e9 when 'load_sales_90d_rows' then 1e9 else 100 end;
    if m.ms > lim then bad := bad || format(E'\n  LAMBAT: %s = %s ms (ambang %s ms)', m.name, m.ms, lim); end if;
  end loop;
  for m in select * from plans loop
    if m.plan like '%Seq Scan on sale_items%' or m.plan like '%Seq Scan on stock_movements%' then bad := bad || format(E'\n  SEQ SCAN pada rencana %s:\n%s', m.name, m.plan); end if;
  end loop;
  if bad <> '' then raise exception 'UJI SKALA GAGAL:%', bad; end if;
end $$;
\echo 'UJI SKALA LULUS'
