#!/usr/bin/env bash
# ============================================================================
#  Despliegue del Calendario Editorial en el VPS.
#
#  Se ejecuta EN EL SERVIDOR, desde la raíz del repo:
#      bash deploy.sh
#
#  Hace: pull → rebuild del contenedor → comprobación de salud.
#  No toca la base de datos ni Directus.
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

echo "== Repositorio: $REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: hay cambios locales sin commitear en el servidor."
  echo "Revísalos con: git status"
  echo "Si son restos de un build, bórralos; si no, guarda un parche antes de seguir."
  exit 1
fi

echo "== Actualizando código"
git pull --ff-only

echo "== Reconstruyendo el contenedor"
cd infra/frontend
docker compose up -d --build

echo "== Estado del contenedor"
docker compose ps

echo "== Comprobando la web"
CODE="000"
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' https://calendar.studiomb.es/login || true)"
  [ "$CODE" = "200" ] && break
  sleep 2
done

if [ "$CODE" = "200" ]; then
  echo "OK: https://calendar.studiomb.es responde 200"
else
  echo "AVISO: la web devuelve $CODE. Revisa los logs:"
  echo "  docker compose logs --tail 80"
  exit 1
fi
