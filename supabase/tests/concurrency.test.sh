#!/usr/bin/env bash
# Dua kasir menjual stok terakhir bersamaan: tepat satu yang berhasil, stok tidak minus.
# Dipanggil oleh run.sh dengan PSQL="psql -X -q -v ON_ERROR_STOP=0 -d <db>".
set -euo pipefail
PSQL=${PSQL:?}
A=00000000-0000-0000-0000-00000000000a
$PSQL -At <<SQL
set role authenticated; select set_config('request.jwt.claim.sub','$A',false);
select create_product('aaaaaaaa-0000-0000-0000-000000000001','Rebutan','x',1000,500,1,0,'pcs');
SQL
PID=$($PSQL -At -c "select id from products where name='Rebutan'" )
# sesi 1 menjual lalu menahan transaksi 2 detik (kunci baris produk tetap dipegang)
( $PSQL -At > /tmp/c1.$$ 2>&1 <<SQL
set role authenticated; select set_config('request.jwt.claim.sub','$A',false);
begin; select create_sale('aaaaaaaa-0000-0000-0000-000000000001', '[{"product_id":"$PID","quantity":1}]'::jsonb); select pg_sleep(2); commit;
SQL
) &
sleep 0.7
# sesi 2 mencoba menjual unit yang sama: harus MENUNGGU kunci, lalu gagal karena stok sudah 0
START=$(date +%s.%N)
( $PSQL -At > /tmp/c2.$$ 2>&1 <<SQL
set role authenticated; select set_config('request.jwt.claim.sub','$A',false);
select create_sale('aaaaaaaa-0000-0000-0000-000000000001', '[{"product_id":"$PID","quantity":1}]'::jsonb);
SQL
)
END=$(date +%s.%N)
wait
WAITED=$(echo "$END - $START" | bc -l)
STOCK=$($PSQL -At -c "select stock from products where id='$PID'")
OK2=$(grep -c "tidak cukup" /tmp/c2.$$ || true)
echo "sesi2 menunggu ${WAITED}s, stok akhir=$STOCK"
[ "$STOCK" = "0.000" ] || { echo "GAGAL: stok akhir $STOCK"; exit 1; }
[ "$OK2" -ge 1 ] || { echo "GAGAL: sesi 2 seharusnya ditolak"; cat /tmp/c2.$$; exit 1; }
echo "$WAITED > 0.8" | bc -l | grep -q 1 || { echo "GAGAL: sesi 2 tidak menunggu kunci baris"; exit 1; }
[ "$($PSQL -At -c "select count(*) from sale_items where product_name_snapshot='Rebutan'")" = "1" ] || { echo "GAGAL: terjual lebih dari sekali"; exit 1; }
rm -f /tmp/c1.$$ /tmp/c2.$$
echo "TES KONKURENSI LULUS"
