#!/usr/bin/env bash
# ============================================================================
#  Crea las 3 colecciones del calendario editorial en Directus vía REST API.
#  Idempotente: si la colección ya existe, sigue con la siguiente.
#
#  Requisitos:
#    - Directus accesible en https://calendar.studiomb.es
#    - .env con ADMIN_EMAIL y ADMIN_PASSWORD en este directorio
#    - jq instalado (apt-get install -y jq)
#
#  Uso (en el VPS, dentro de infra/directus):
#    bash create-collections.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "=== login fresco ==="
PASS=$(awk -F= '/^ADMIN_PASSWORD=/{print $2}' .env)
TOKEN=$(curl -sS -X POST https://calendar.studiomb.es/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@studiomb.es\",\"password\":\"$PASS\"}" \
  | jq -r '.data.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: no se pudo obtener token"; exit 1
fi
echo "token len: ${#TOKEN}"

AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"
BASE=https://calendar.studiomb.es

# Helper: POST /collections. Si ya existe, no falla.
create_collection() {
  local slug="$1"
  shift
  local payload=$(jq -n --arg c "$slug" '{collection:$c, fields: $ARGS.positional}' --args "$@")
  echo
  echo "--- crear colección $slug ---"
  local resp=$(curl -sS -X POST "$BASE/collections" \
    -H "$AUTH" -H "$JSON" \
    -d "$payload")
  echo "$resp" | jq -c '{ok:(.data != null), err:.errors[0].message}' 2>/dev/null || echo "$resp" | head -c 200
}

# ----------------------------------------------------------------------------
# 1) clientes
# ----------------------------------------------------------------------------
create_collection "clientes" \
  '{field:"nombre",type:"string",schema:{is_nullable:false}}' \
  '{field:"logo",type:"uuid",schema:{is_nullable:true,foreign_key_table:"directus_files",foreign_key_column:"id"}}' \
  '{field:"tipos_contenido_disponibles",type:"json",schema:{default_value:"[]"}}'

# ----------------------------------------------------------------------------
# 2) publicaciones
# ----------------------------------------------------------------------------
create_collection "publicaciones" \
  '{field:"cliente_id",type:"uuid",schema:{is_nullable:true,foreign_key_table:"clientes",foreign_key_column:"id"}}' \
  '{field:"tipo_contenido",type:"string",schema:{is_nullable:true}}' \
  '{field:"formato",type:"string",schema:{is_nullable:true}}' \
  '{field:"imagenes_fondo",type:"json",schema:{default_value:"[]"}}' \
  '{field:"textos_slides",type:"text",schema:{is_nullable:true}}' \
  '{field:"copywriting",type:"text",schema:{is_nullable:true}}' \
  '{field:"hashtags",type:"json",schema:{default_value:"[]"}}' \
  '{field:"fecha_creacion",type:"timestamp",schema:{is_nullable:true,default_value:"now()"}}' \
  '{field:"fecha_publicacion",type:"timestamp",schema:{is_nullable:true}}' \
  '{field:"diseno_final",type:"uuid",schema:{is_nullable:true,foreign_key_table:"directus_files",foreign_key_column:"id"}}' \
  '{field:"estado",type:"string",schema:{is_nullable:true,default_value:"Borrador"}}'

# ----------------------------------------------------------------------------
# 3) comentarios
# ----------------------------------------------------------------------------
create_collection "comentarios" \
  '{field:"publicacion_id",type:"uuid",schema:{is_nullable:false,foreign_key_table:"publicaciones",foreign_key_column:"id"}}' \
  '{field:"usuario_id",type:"uuid",schema:{is_nullable:true,foreign_key_table:"directus_users",foreign_key_column:"id"}}' \
  '{field:"texto",type:"text",schema:{is_nullable:false}}' \
  '{field:"fecha_creacion",type:"timestamp",schema:{is_nullable:true,default_value:"now()"}}'

# ----------------------------------------------------------------------------
# Verificación final
# ----------------------------------------------------------------------------
echo
echo "=== verificar tablas ==="
docker exec -u postgres postgres-global psql -d studio_mb_calendario -c "\dt" \
  | grep -E 'clientes|publicaciones|comentarios' || echo "(aún no aparecen)"

echo
echo "=== verificar vía API (snapshot) ==="
curl -sS "$BASE/schema/snapshot" -H "$AUTH" \
  | jq -r '.data.collections[] | "  \(.collection) → \(.fields | length) campos"' \
  | grep -E 'clientes|publicaciones|comentarios'

echo
echo "=== listo ==="
