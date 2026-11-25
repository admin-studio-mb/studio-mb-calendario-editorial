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

# El compose vive en infra/frontend y, por defecto, Docker Compose leería
# infra/frontend/.env. El .env real del proyecto está en la raíz; lo pasamos
# explícitamente para que el contenedor reciba el token estático y el SMTP.
ENV_FILE="$REPO/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "$REPO/infra/frontend/.env" ]; then
  ENV_FILE="$REPO/infra/frontend/.env"
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no existe $REPO/.env (ni infra/frontend/.env)."
  exit 1
fi

for clave in PUBLIC_DIRECTUS_STATIC_TOKEN SMTP_HOST SMTP_USER SMTP_PASS; do
  if ! grep -Eq "^${clave}=.+" "$ENV_FILE"; then
    echo "AVISO: ${clave} está vacío en ${ENV_FILE}."
  fi
done

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
docker compose --env-file "$ENV_FILE" up -d --build

echo "== Estado del contenedor"
docker compose --env-file "$ENV_FILE" ps

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
