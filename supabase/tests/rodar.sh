#!/usr/bin/env bash
# Roda os testes SQL num banco Postgres LOCAL e descartável (nunca em produção).
#
# Uso: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/rodar.sh
#
# Monta do zero: simulador do Supabase → schema.sql → migrações ANTIGAS →
# dados "de produção" → migrações novas (20261105_*) DUAS vezes (prova que dá
# pra rodar de novo) → testes.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${PGDATABASE_TESTE:-crm_teste_automatizado}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run() { "${PSQL[@]}" -d "$DB" -f "$1" 2>&1 | grep -E "ERROR|FALHOU|ok - |PASSARAM" || true; }
must() { "${PSQL[@]}" -d "$DB" -f "$1" >/dev/null 2>&1 || { echo "ERRO ao aplicar $1"; "${PSQL[@]}" -d "$DB" -f "$1"; exit 1; }; }

must supabase/tests/00_simulador_supabase.sql
must supabase/schema.sql
for f in supabase/migrations/*.sql; do
  case "$f" in *20261105_*) ;; *) must "$f" ;; esac
done
must supabase/tests/10_dados_antes_da_migracao.sql
for rodada in 1 2; do
  for f in supabase/migrations/20261105_*.sql; do must "$f"; done
done

saida=$("${PSQL[@]}" -d "$DB" -f supabase/tests/20_testes_ia_estado_tarefas.sql 2>&1) || { echo "$saida" | grep -E "FALHOU|ERROR|ok - " ; exit 1; }
echo "$saida" | grep -E "ok - |PASSARAM" | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null
