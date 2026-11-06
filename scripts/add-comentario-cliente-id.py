#!/usr/bin/env python3
"""Desnormaliza `cliente_id` en comentarios para poder validar la pertenencia.

Directus 12 NO soporta filtros relacionales en `validation` (comprobado:
`{"publicacion_id": {"cliente_id": {...}}}` → HTTP 400 "Value is required"
enSIEMPRE, incluso con un UUID literal). Tampoco los aplica en `permissions`
para la acción create.

Solución estándar en Directus: desnormalizar el filtro a un campo PLANO en la
propia tabla. Un campo plano (`cliente_id`) sí funciona en:
  - read    → permissions: {cliente_id: {_eq: "$CURRENT_USER.cliente_id"}}
  - create  → validation: {cliente_id: {_eq: "$CURRENT_USER.cliente_id"}}

Pasos:
  1. Crear el campo `cliente_id` en comentarios + FK a clientes.
  2. Rellenar el valor de los comentarios existentes desde su publicación.
  3. Reconfigurar los permisos de comentarios con campos planos.
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


def show(label, st, body, limit=300):
    text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    print(f"  {label}: http {st} → {text[:limit]}")


def bust():
    return int(time.time() * 1000)


# ── 1. Campo cliente_id en comentarios ───────────────────────────────────────
print("== 1. Campo `cliente_id` en comentarios ==")
st, f = api("/fields/comentarios/cliente_id")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/comentarios", method="POST", body={
        "field": "cliente_id",
        "type": "uuid",
        "meta": {
            "special": ["m2o"],
            "interface": "select-dropdown-m2o",
            "display": "related-values",
            "options": {"template": "{{nombre}}"},
            "readonly": True,
            "hidden": True,
        },
        "schema": {
            "foreign_key_table": "clientes",
            "foreign_key_column": "id",
            "on_delete": "SET NULL",
        },
    })
    show("POST field comentarios.cliente_id", st, body, 400)

st, rels = api("/relations")
have = {(r.get("collection"), r.get("field")) for r in rels.get("data", [])}
if ("comentarios", "cliente_id") not in have:
    st, body = api("/relations", method="POST", body={
        "collection": "comentarios",
        "field": "cliente_id",
        "related_collection": "clientes",
        "meta": {
            "one_field": None, "one_allowed_collections": [],
            "one_deselect_action": "nullify",
            "many_collection": "comentarios", "many_field": "cliente_id",
            "many_allowed_collections": [], "many_deselect_action": "nullify",
        },
        "schema": {
            "table": "comentarios", "column": "cliente_id",
            "foreign_key_table": "clientes", "foreign_key_column": "id",
            "constraint_name": "comentarios_cliente_id_foreign",
            "on_update": "NO ACTION", "on_delete": "SET NULL",
        },
    })
    show("POST relation comentarios.cliente_id", st, body, 300)

# ── 2. Backfill ──────────────────────────────────────────────────────────────
print()
print("== 2. Rellenar cliente_id de los comentarios existentes ==")
st, pubs = api("/items/publicaciones", query={"limit": -1, "fields": "id,cliente_id"})
pub_cliente = {p["id"]: p.get("cliente_id") for p in pubs.get("data", [])}
st, coms = api("/items/comentarios", query={"limit": -1, "fields": "id,publicacion_id,cliente_id"})
ok = 0
for c in coms.get("data", []):
    if c.get("cliente_id"):
        continue
    cid = pub_cliente.get(c.get("publicacion_id"))
    if not cid:
        print(f"  ! {c['id'][:8]} → publicación sin cliente, se deja null")
        continue
    st, r = api(f"/items/comentarios/{c['id']}", method="PATCH", body={"cliente_id": cid})
    if st == 200:
        ok += 1
    else:
        print(f"  ! {c['id'][:8]} → http {st}")
print(f"  actualizados: {ok}/{len(coms.get('data', []))}")

# ── 3. Permisos con campos planos ───────────────────────────────────────────
print()
print("== 3. Permisos de comentarios con campos planos ==")
st, policies = api("/policies")
pid = next(p["id"] for p in policies["data"] if p["name"] == "cliente_acceso")
st, perms = api("/permissions")
mine = {f"{p['collection']}.{p['action']}": p
        for p in perms.get("data", []) if p.get("policy") == pid}

PLANO = {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}

PERMISOS_NUEVOS = [
    ("comentarios.read",
     {"permissions": PLANO, "validation": {},
      "fields": ["id", "publicacion_id", "cliente_id", "usuario_id", "texto", "fecha_creacion"]}),
    ("comentarios.create",
     {"permissions": {}, "validation": {
         "cliente_id": {"_eq": "$CURRENT_USER.cliente_id"},
         "usuario_id": {"_eq": "$CURRENT_USER"},
     }, "fields": ["publicacion_id", "cliente_id", "usuario_id", "texto"]}),
    ("comentarios.update",
     {"permissions": {"usuario_id": {"_eq": "$CURRENT_USER"}}, "validation": {},
      "fields": ["texto"]}),
    ("comentarios.delete",
     {"permissions": {"usuario_id": {"_eq": "$CURRENT_USER"}}, "validation": {},
      "fields": ["*"]}),
]
for key, body in PERMISOS_NUEVOS:
    p = mine.get(key)
    if not p:
        print(f"  no existe: {key}")
        continue
    show(f"PATCH {key}", *api(f"/permissions/{p['id']}", method="PATCH", body=body), 160)

print()
print("== Verificación ==")
st, perms = api("/permissions")
for p in perms["data"]:
    if p.get("policy") == pid and p["collection"] == "comentarios":
        print(f"  {p['collection']}.{p['action']}")
        print(f"     permissions={json.dumps(p.get('permissions'), ensure_ascii=False)}")
        print(f"     validation ={json.dumps(p.get('validation'), ensure_ascii=False)}")
st, coms = api("/items/comentarios", query={"limit": -1, "fields": "id,cliente_id"})
print(f"  comentarios con cliente_id: "
      f"{sum(1 for c in coms.get('data', []) if c.get('cliente_id'))}/{len(coms.get('data', []))}")
