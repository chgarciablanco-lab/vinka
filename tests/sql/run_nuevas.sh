#!/bin/bash
# Ejecuta las pruebas de base de datos 13 a 19 en la copia AISLADA. Termina con código 1 si alguna falla.
cd "$(dirname "$0")"; fail=0
for f in 1[3-8]_*.sql; do
  if out=$(psql -h localhost -p 54329 -U postgres -d vinka -At -v ON_ERROR_STOP=1 -f "$f" 2>&1); then echo "✓ $f ($(echo "$out" | grep -c ': true') comprobaciones)"; else echo "✗ $f"; echo "$out" | grep -E 'ERROR|FALLIDA|: false' | head -5; fail=1; fi
done
if ./19_ultimo_cupo_simultaneo.sh >/dev/null; then echo "✓ 19_ultimo_cupo_simultaneo.sh"; else echo "✗ 19_ultimo_cupo_simultaneo.sh"; fail=1; fi
[ $fail = 0 ] && echo "Todo correcto"; exit $fail
