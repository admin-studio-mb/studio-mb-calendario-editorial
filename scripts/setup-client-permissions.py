#!/usr/bin/env python3
"""Prepara el terreno para permisos por cliente en Directus 12.

Hace 3 cosas, todas idempotentes:
  1. Añade el campo `cliente_id` a `directus_users` (FK → clientes.id),
     para poder asociar cada usuario de cliente a su cliente.
  2. Crea el rol `Cliente` (NO admin) y la policy `cliente_acceso`.
  3. Crea los permisos de la policy sobre las 3 colecciones, con filtro
     por `cliente_id = $CURRENT_USER.cliente_id`.

NO se asigna el rol a ningún usuario ni se toca la policy del admin.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"


def read_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("sin token")


TOKEN = read_token()


def api(path, method="GET", body=None, query=None):
    url = BASE + path
    if query:
        parts = [f"{k}={urllib.parse.quote(str(v), safe='')}"
                 for k, v in query.items() if v is not None]
        if parts:
            url += ("&" if "?" in url else "?") + "&".join(parts)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Cache-Control", "no-cache")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def show(label, st, body, limit=300):
    text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    print(f"  {label}: http {st} → {text[:limit]}")


def bust():
    return int(time.time() * 1000)


# ── 1. Campo cliente_id en directus_users ────────────────────────────────────
print("== 1. Campo `cliente_id` en directus_users ==")
st, f = api("/fields/directus_users/cliente_id")
if st == 200:
    print("  ya existe, no se toca")
    client_field = f.get("data")
else:
    st, body = api("/fields/directus_users", method="POST", body={
        "field": "cliente_id",
        "type": "uuid",
        "meta": {
            "special": ["m2o"],
            "interface": "select-dropdown-m2o",
            "display": "related-values",
            "options": {
                "template": "{{nombre}}",
                "filter": {"status": {"_eq": "published"}},
            },
            "readonly": False,
            "hidden": False,
        },
        "schema": {
            "foreign_key_table": "clientes",
            "foreign_key_column": "id",
            "on_delete": "SET NULL",
        },
    })
    show("POST field cliente_id", st, body, 500)
    st, f = api("/fields/directus_users/cliente_id")
    client_field = f.get("data") if st == 200 else None

# Relación (FK real en la BBDD)
st, rels = api("/relations")
have = {(r.get("collection"), r.get("field")) for r in rels.get("data", [])}
if ("directus_users", "cliente_id") not in have:
    st, body = api("/relations", method="POST", body={
        "collection": "directus_users",
        "field": "cliente_id",
        "related_collection": "clientes",
        "meta": {
            "one_field": None,
            "one_allowed_collections": [],
            "one_deselect_action": "nullify",
            "many_collection": "directus_users",
            "many_field": "cliente_id",
            "many_allowed_collections": [],
            "many_deselect_action": "nullify",
        },
        "schema": {
            "table": "directus_users",
            "column": "cliente_id",
            "foreign_key_table": "clientes",
            "foreign_key_column": "id",
            "constraint_name": "directus_users_cliente_id_foreign",
            "on_update": "NO ACTION",
            "on_delete": "SET NULL",
        },
    })
    show("POST relation directus_users.cliente_id", st, body, 300)

# ── 2. Rol + policy ──────────────────────────────────────────────────────────
print()
print("== 2. Rol `Cliente` y policy `cliente_acceso` ==")

st, policies = api("/policies")
policy = next((p for p in policies.get("data", []) if p.get("name") == "cliente_acceso"), None)
if policy:
    print(f"  policy ya existe: {policy['id']}")
    policy_id = policy["id"]
else:
    st, body = api("/policies", method="POST", body={
        "name": "cliente_acceso",
        "icon": "visibility",
        "description": "Acceso limitado al cliente propio (cliente_id = $CURRENT_USER.cliente_id).",
        "admin_access": False,
        "app_access": True,
        "enforce_tfa": False,
    })
    show("POST policy", st, body, 400)
    policy_id = (body.get("data") or {}).get("id") if st in (200, 201) else None

st, roles = api("/roles")
role = next((r for r in roles.get("data", []) if r.get("name") == "Cliente"), None)
if role:
    print(f"  rol ya existe: {role['id']}")
    role_id = role["id"]
else:
    st, body = api("/roles", method="POST", body={
        "name": "Cliente",
        "icon": "business",
        "description": "Usuario de cliente: sólo ve y comenta sus propias publicaciones.",
        "admin_access": False,
        "app_access": True,
    })
    show("POST role", st, body, 400)
    role_id = (body.get("data") or {}).get("id") if st in (200, 201) else None

# Vincular rol → policy
if role_id and policy_id:
    st, access = api("/access")
    linked = any(a.get("role") == role_id and a.get("policy") == policy_id
                 for a in access.get("data", []))
    if linked:
        print("  rol ya vinculado a la policy")
    else:
        st, body = api("/access", method="POST", body={
            "role": role_id, "policy": policy_id})
        show("POST access (rol→policy)", st, body, 300)

# ── 3. Permisos de la policy ─────────────────────────────────────────────────
print()
print("== 3. Permisos por colección para la policy `cliente_acceso` ==")

CLIENTE_FILTER = {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}

PERMISOS = [
    # (collection, action, fields, permissions)
    ("clientes", "read", ["id", "nombre", "logo", "tipos_contenido_disponibles"],
     {"id": {"_eq": "$CURRENT_USER.cliente_id"}}),
    ("publicaciones", "read",
     ["id", "cliente_id", "tipo_contenido", "formato", "copywriting", "hashtags",
      "textos_slides", "imagenes_fondo", "fecha_publicacion", "diseno_final", "estado"],
     CLIENTE_FILTER),
    ("publicaciones", "create",
     ["cliente_id", "tipo_contenido", "formato", "copywriting", "hashtags",
      "textos_slides", "imagenes_fondo", "fecha_publicacion", "diseno_final", "estado"],
     CLIENTE_FILTER),
    ("publicaciones", "update",
     ["copywriting", "hashtags", "textos_slides", "imagenes_fondo", "estado"],
     CLIENTE_FILTER),
    ("comentarios", "read",
     ["id", "publicacion_id", "usuario_id", "texto", "fecha_creacion"],
     {"publicacion_id": {"_in": {"publicaciones": {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}}}}),
    ("comentarios", "create", ["publicacion_id", "usuario_id", "texto"], {}),
    ("directus_files", "read", ["*"], {}),
    ("directus_users", "read",
     ["id", "first_name", "last_name", "email", "cliente_id"],
     {"id": {"_eq": "$CURRENT_USER"}}),
]

if policy_id:
    st, perms = api("/permissions")
    existing = {
        (p.get("collection"), p.get("action"))
        for p in perms.get("data", [])
        if p.get("policy") == policy_id
    }
    for coll, action, fields, permissions in PERMISOS:
        if (coll, action) in existing:
            print(f"  ya existe: {coll}.{action}")
            continue
        st, body = api("/permissions", method="POST", body={
            "policy": policy_id,
            "collection": coll,
            "action": action,
            "fields": fields,
            "permissions": permissions,
            "validation": {},
        })
        show(f"POST permission {coll}.{action}", st, body, 200)
else:
    print("  no se pudo crear la policy, se saltan los permisos")

print()
print("== Verificación final ==")
st, policies = api("/policies")
for p in policies.get("data", []):
    print(f"  policy {p.get('name'):<24} id={p.get('id')} admin={p.get('admin_access')} app={p.get('app_access')}")
st, roles = api("/roles")
for r in roles.get("data", []):
    print(f"  role   {r.get('name'):<24} id={r.get('id')} admin={r.get('admin_access')}")
st, access = api("/access")
for a in access.get("data", []):
    print(f"  access role={str(a.get('role'))[:8]} → policy={str(a.get('policy'))[:8]}")
st, perms = api("/permissions")
mine = [p for p in perms.get("data", []) if p.get("policy") == policy_id]
print(f"  permisos de cliente_acceso: {len(mine)}")
for p in mine:
    print(f"     {p.get('collection')}.{p.get('action')}")
st, uf = api("/fields/directus_users/cliente_id")
print(f"  directus_users.cliente_id → http {st}: "
      f"fk={(uf.get('data') or {}).get('schema', {}).get('foreign_key_table')}")
