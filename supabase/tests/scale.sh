#!/usr/bin/env bash
# Uji skala database (butuh ~1-2 menit dan ~300 MB disk sementara). Jalankan: npm run test:sql:scale
# Variabel: SKIP_MIGRATION_003=1 untuk membuktikan bottleneck sebelum indeks skala ditambahkan.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$(id -u)" = "0" ]; then
  COPY=$(mktemp -d /tmp/stokcerdas-scale.XXXXXX); cp -r "$HERE/.." "$COPY/supabase"; chmod -R a+rX "$COPY"; chmod a+rx "$COPY"
  exec su postgres -s /bin/bash -c "SKIP_MIGRATION_003='${SKIP_MIGRATION_003:-}' '$COPY/supabase/tests/scale.sh'"
fi
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true); [ -z "$BIN" ] && BIN=$(dirname "$(command -v initdb)")
export PATH="$BIN:$PATH"
DIR=$(mktemp -d); SOCK=$DIR/sock; mkdir -p "$SOCK"
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
initdb -D "$DIR/data" -A trust -U postgres >/dev/null
pg_ctl -D "$DIR/data" -o "-c listen_addresses='' -c unix_socket_directories='$SOCK' -c fsync=off -c synchronous_commit=off" -w -l "$DIR/log" start >/dev/null
export PGHOST="$SOCK" PGUSER=postgres
createdb stokcerdas_scale
Q="psql -X -q -d stokcerdas_scale -v ON_ERROR_STOP=1"
$Q -f "$HERE/shim.sql" -f "$HERE/../schema.sql" -f "$HERE/../migrations/002_atomic_functions.sql" >/dev/null 2>&1
if [ -z "${SKIP_MIGRATION_003:-}" ]; then $Q -f "$HERE/../migrations/003_scale_indexes.sql" >/dev/null; else echo "# MELEWATI migrasi 003 (mode pembuktian bottleneck)"; fi
START=$(date +%s)
$Q -f "$HERE/scale.test.sql" 2>&1 | sed 's/^psql:[^ ]* //'
echo "# DB: $(psql -X -At -d stokcerdas_scale -c "select pg_size_pretty(pg_database_size('stokcerdas_scale'))"), durasi $(( $(date +%s) - START ))s"
psql -X -At -d stokcerdas_scale -c "select 'UKURAN ' || relname || ' = ' || pg_size_pretty(pg_total_relation_size(oid)) || ' (' || (select reltuples::bigint from pg_class c2 where c2.oid = pg_class.oid) || ' baris)' from pg_class where relname in ('sales','sale_items','stock_movements','products') and relkind='r' order by relname"
