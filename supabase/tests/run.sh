#!/usr/bin/env bash
# Menguji schema.sql + migrations/002_atomic_functions.sql pada PostgreSQL lokal sementara.
# Butuh PostgreSQL 14+ terpasang (initdb, pg_ctl, psql). Tidak menyentuh database Anda yang lain.
# Jika dijalankan sebagai root (mis. di container), skrip menjalankan dirinya sebagai user "postgres".
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$(id -u)" = "0" ]; then
  # user postgres mungkin tidak boleh membaca folder ini: salin ke lokasi sementara yang terbaca
  COPY=$(mktemp -d /tmp/stokcerdas-sqltest.XXXXXX); cp -r "$HERE/.." "$COPY/supabase"; chmod -R a+rX "$COPY"; chmod a+rx "$COPY"
  exec su postgres -s /bin/bash -c "'$COPY/supabase/tests/run.sh'"
fi
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true); [ -z "$BIN" ] && BIN=$(dirname "$(command -v initdb)")
export PATH="$BIN:$PATH"
DIR=$(mktemp -d); SOCK=$DIR/sock; mkdir -p "$SOCK"
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
initdb -D "$DIR/data" -A trust -U postgres >/dev/null
pg_ctl -D "$DIR/data" -o "-c listen_addresses='' -c unix_socket_directories='$SOCK'" -w -l "$DIR/log" start >/dev/null
export PGHOST="$SOCK" PGUSER=postgres
createdb stokcerdas_test
PSQLBASE="psql -X -q -d stokcerdas_test"
echo "# memuat shim auth, schema.sql, dan migrasi 002 + 003"
$PSQLBASE -v ON_ERROR_STOP=1 -f "$HERE/shim.sql" -f "$HERE/../schema.sql" -f "$HERE/../migrations/002_atomic_functions.sql" -f "$HERE/../migrations/003_scale_indexes.sql" >/dev/null
echo "# migrasi 002 dan 003 dijalankan ulang (harus idempoten)"
$PSQLBASE -v ON_ERROR_STOP=1 -f "$HERE/../migrations/002_atomic_functions.sql" -f "$HERE/../migrations/003_scale_indexes.sql" >/dev/null
echo "# tes fungsi atomik + RLS"
$PSQLBASE -v ON_ERROR_STOP=1 -f "$HERE/atomic.test.sql"
echo "# tes konkurensi"
PSQL="psql -X -q -d stokcerdas_test" bash "$HERE/concurrency.test.sh"
