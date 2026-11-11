#!/usr/bin/env python3
"""Crea la colección `notificaciones` y sus permisos (idempotente).

Colección:
  notificaciones
    usuario        uuid FK → directus_users (CASCADE)
    tipo           string   ('comentario' | 'estado' | 'sistema')
    titulo         string
    cuerpo         text
    url            string   (ruta interna, p.ej. /dashboard/pendientes)
    leida          boolean  (default false)
    email_enviado  boolean  (default false)
    fecha_creacion timestamp
    publicacion_id uuid FK → publicaciones (SET NULL)

Permisos:
  - cliente_acceso y editor_acceso: read y update SOLO de las notificaciones
    propias (usuario = $CURRENT_USER). El update sirve para marcar leídas.
  - La creación la hace el servidor con el token estático (admin).
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
COL = "notificaciones"


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
        "field": "usuario", "type": "uuid",
        "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "display": "related-values",
                 "options": {"template": "{{email}}"}},
        "schema": {"foreign_key_table": "directus_users", "foreign_key_column": "id", "on_delete": "CASCADE"},
    },
    {
        "field": "tipo", "type": "string",
        "meta": {"interface": "select-dropdown", "options": {"choices": [
            {"text": "Comentario", "value": "comentario"},
            {"text": "Cambio de estado", "value": "estado"},
            {"text": "Sistema", "value": "sistema"},
        ]}},
        "schema": {"default_value": "sistema"},
    },
    {"field": "titulo", "type": "string", "meta": {"interface": "input"}, "schema": {}},
    {"field": "cuerpo", "type": "text", "meta": {"interface": "input-multiline"}, "schema": {"is_nullable": True}},
    {"field": "url", "type": "string", "meta": {"interface": "input"}, "schema": {"is_nullable": True}},
    {"field": "leida", "type": "boolean", "meta": {"interface": "boolean"}, "schema": {"default_value": False}},
    {"field": "email_enviado", "type": "boolean", "meta": {"interface": "boolean", "hidden": True}, "schema": {"default_value": False}},
    {
        "field": "fecha_creacion", "type": "timestamp",
        "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
        "schema": {},
    },
    {
        "field": "publicacion_id", "type": "uuid",
        "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "hidden": True},
        "schema": {"foreign_key_table": "publicaciones", "foreign_key_column": "id", "on_delete": "SET NULL"},
    },
]

print("== Colección `notificaciones` ==")
st, cols = api("/collections?fields=collection&limit=-1")
existing = {c["collection"] for c in cols.get("data", [])} if st == 200 else set()
if COL in existing:
    print("  ya existe")
else:
    st, body = api("/collections", "POST", {
        "collection": COL,
        "meta": {"icon": "notifications", "note": "Notificaciones de la app (campanita + email)",
                 "archive_field": None, "sort_field": None},
        "schema": {},
    })
    print(f"  POST /collections → {st}")

print()
print("== Campos ==")
for f in FIELDS:
    st, _ = api(f"/fields/{COL}/{f['field']}")
    if st == 200:
        print(f"  ya existe: {f['field']}")
        continue
    st, body = api(f"/fields/{COL}", "POST", f)
    print(f"  POST {f['field']:<16} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Relaciones ==\n")
st, rels = api("/relations")
have = {(r.get("collection"), r.get("field")) for r in rels.get("data", [])}
for field, related in (("usuario", "directus_users"), ("publicacion_id", "publicaciones")):
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
                   "foreign_key_table": related, "foreign_key_column": "id"},
    })
    print(f"  POST relation {field} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Permisos de lectura/actualización (polices cliente_acceso y editor_acceso) ==")
st, policies = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in policies.get("data", [])}

PERMISOS = [
    ("read", ["*"], {"usuario": {"_eq": "$CURRENT_USER"}}),
    ("update", ["leida"], {"usuario": {"_eq": "$CURRENT_USER"}}),
]

for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    if not pid:
        print(f"  {pname}: no existe, se salta")
        continue
    st, perms = api("/permissions?fields=id,collection,action&limit=-1")
    existing_perms = {
        (p.get("collection"), p.get("action"))
        for p in perms.get("data", [])
        if p.get("policy") == pid
    } if st == 200 else set()
    for action, fields, permissions in PERMISOS:
        if (COL, action) in existing_perms:
            print(f"  ya existe: {pname} {action}")
            continue
        st, body = api("/permissions", "POST", {
            "policy": pid, "collection": COL, "action": action,
            "fields": fields, "permissions": permissions, "validation": {},
        })
        print(f"  POST {pname}.{action} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Verificación ==")
st, cols = api("/collections?fields=collection&limit=-1")
names = {c["collection"] for c in cols.get("data", [])}
print(f"  colección existe: {COL in names}")
st, perms = api("/permissions?fields=policy,collection,action&limit=-1")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    mine = [p for p in perms.get("data", []) if p.get("policy") == pid and p.get("collection") == COL]
    print(f"  {pname}: {[p['action'] for p in mine]}")
