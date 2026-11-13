#!/usr/bin/env python3
"""Historial de actividad + motivo de rechazo (idempotente).

Colección `actividad`:
    publicacion_id  uuid FK → publicaciones (CASCADE)
    usuario         uuid FK → directus_users (SET NULL)
    tipo            'creado' | 'estado' | 'edicion' | 'duplicado' | 'sistema'
    detalle         text   (texto legible: "Revisión → En diseño")
    estado_anterior string
    estado_nuevo    string
    motivo          text   (motivo del rechazo, si aplica)
    fecha_creacion  timestamp (date-created)

Campo nuevo en publicaciones:
    motivo_rechazo  text   (lo escribe el cliente al pedir cambios)

Permisos:
  - cliente_acceso: read de actividad SOLO de sus publicaciones (deep filter).
  - editor_acceso: read de toda la actividad.
  - create: solo servidor (token estático); no se dan permisos de create.
  - `motivo_rechazo` se añade a los fields de publicaciones (read/update) de
    ambas policies para que el PATCH con JWT del cliente pueda guardarlo.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
COL = "actividad"


def read_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("sin token")


TOKEN = read_token()


def api(path, method="GET", body=None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Cache-Control", "no-cache")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


FIELDS = [
    {
        "field": "id", "type": "uuid",
        "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
        "schema": {"is_primary_key": True, "has_auto_increment": False},
    },
    {
        "field": "publicacion_id", "type": "uuid",
        "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "hidden": True},
        "schema": {"foreign_key_table": "publicaciones", "foreign_key_column": "id", "on_delete": "CASCADE"},
    },
    {
        "field": "usuario", "type": "uuid",
        "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "display": "related-values",
                 "options": {"template": "{{email}}"}},
        "schema": {"foreign_key_table": "directus_users", "foreign_key_column": "id", "on_delete": "SET NULL"},
    },
    {
        "field": "tipo", "type": "string",
        "meta": {"interface": "select-dropdown", "options": {"choices": [
            {"text": "Creado", "value": "creado"},
            {"text": "Cambio de estado", "value": "estado"},
            {"text": "Edición", "value": "edicion"},
            {"text": "Duplicado", "value": "duplicado"},
            {"text": "Sistema", "value": "sistema"},
        ]}},
        "schema": {"default_value": "sistema"},
    },
    {"field": "detalle", "type": "text", "meta": {"interface": "input-multiline"}, "schema": {"is_nullable": True}},
    {"field": "estado_anterior", "type": "string", "meta": {"interface": "input"}, "schema": {"is_nullable": True}},
    {"field": "estado_nuevo", "type": "string", "meta": {"interface": "input"}, "schema": {"is_nullable": True}},
    {"field": "motivo", "type": "text", "meta": {"interface": "input-multiline"}, "schema": {"is_nullable": True}},
    {
        "field": "fecha_creacion", "type": "timestamp",
        "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
        "schema": {},
    },
]

print("== Colección `actividad` ==")
st, cols = api("/collections?fields=collection&limit=-1")
existing = {c["collection"] for c in cols.get("data", [])} if st == 200 else set()
if COL in existing:
    print("  ya existe")
else:
    st, body = api("/collections", "POST", {
        "collection": COL,
        "meta": {"icon": "history", "note": "Historial de cambios por publicación",
                 "archive_field": None, "sort_field": None},
        "schema": {},
    })
    print(f"  POST /collections → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Campos de actividad ==")
for f in FIELDS:
    st, _ = api(f"/fields/{COL}/{f['field']}")
    if st == 200:
        print(f"  ya existe: {f['field']}")
        continue
    st, body = api(f"/fields/{COL}", "POST", f)
    print(f"  POST {f['field']:<16} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Relaciones ==")
st, rels = api("/relations")
have = {(r.get("collection"), r.get("field")) for r in rels.get("data", [])}
for field, related in (("publicacion_id", "publicaciones"), ("usuario", "directus_users")):
    if (COL, field) in have:
        print(f"  ya existe: {field}")
        continue
    st, body = api("/relations", "POST", {
        "collection": COL,
        "field": field,
        "related_collection": related,
        "meta": {"many_collection": COL, "many_field": field,
                 "one_collection": related, "one_field": None},
        "schema": {"table": COL, "column": field,
                   "foreign_key_table": related, "foreign_key_column": "id",
                   "on_delete": "CASCADE" if field == "publicacion_id" else "SET NULL"},
    })
    print(f"  POST relation {field} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

# El POST /relations no siempre aplica el on_delete del schema: lo forzamos.
for field, on_delete in (("publicacion_id", "CASCADE"), ("usuario", "SET NULL")):
    st, body = api(f"/relations/{COL}/{field}", "PATCH", {
        "schema": {"on_delete": on_delete},
    })
    print(f"  PATCH on_delete {field}={on_delete} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Campo publicaciones.motivo_rechazo ==")
st, _ = api("/fields/publicaciones/motivo_rechazo")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/publicaciones", "POST", {
        "field": "motivo_rechazo",
        "type": "text",
        "meta": {"interface": "input-multiline", "note": "Motivo por el que el cliente pide cambios"},
        "schema": {"is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos ==")
st, policies = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in policies.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields,permissions&limit=-1")
allp = perms.get("data", []) if st == 200 else []

ACT_PERMS = [
    ("cliente_acceso", "read", ["*"], {"publicacion_id": {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}}),
    ("editor_acceso", "read", ["*"], {}),
]
for pname, action, fields, permissions in ACT_PERMS:
    pid = policies.get(pname)
    if not pid:
        print(f"  {pname}: no existe, se salta")
        continue
    row = next((p for p in allp if p.get("policy") == pid
                and p.get("collection") == COL and p.get("action") == action), None)
    if row:
        print(f"  ya existe: {pname} {action}")
        continue
    st, body = api("/permissions", "POST", {
        "policy": pid, "collection": COL, "action": action,
        "fields": fields, "permissions": permissions, "validation": {},
    })
    print(f"  POST {pname}.{action} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Fields de publicaciones: motivo_rechazo ==")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    if not pid:
        continue
    for action in ("read", "update"):
        row = next((p for p in allp if p.get("policy") == pid
                    and p.get("collection") == "publicaciones" and p.get("action") == action), None)
        if not row:
            print(f"  {pname}.{action}: no existe (se salta)")
            continue
        fields = row.get("fields") or []
        if "*" in fields or "motivo_rechazo" in fields:
            print(f"  {pname}.{action}: ok")
            continue
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + ["motivo_rechazo"]})
        print(f"  {pname}.{action} += motivo_rechazo → {st}")

print()
print("== Verificación ==")
st, cols = api("/collections?fields=collection&limit=-1")
names = {c["collection"] for c in cols.get("data", [])}
print("  colección actividad:", COL in names)
st, f = api("/fields/publicaciones/motivo_rechazo")
print("  campo motivo_rechazo:", st == 200)
st, perms = api("/permissions?fields=policy,collection,action,fields&limit=-1")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    mine = [(p["action"], p.get("fields")) for p in perms.get("data", [])
            if p.get("policy") == pid and p.get("collection") == "publicaciones"]
    print(f"  {pname} publicaciones:", mine)
api("/utils/cache/clear", "POST", {"system": True})
