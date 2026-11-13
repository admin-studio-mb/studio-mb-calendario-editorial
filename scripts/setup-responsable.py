#!/usr/bin/env python3
"""Responsable de cada publicación (idempotente).

Campo `publicaciones.responsable_id` (uuid FK → directus_users, SET NULL).

Permisos:
  - read: cliente_acceso y editor_acceso (para poder mostrarlo).
  - create/update: editor_acceso (el equipo asigna); el cliente no lo toca.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
COL = "publicaciones"
FIELD = "responsable_id"


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


print("== Campo publicaciones.responsable_id ==")
st, _ = api(f"/fields/{COL}/{FIELD}")
if st == 200:
    print("  ya existe")
else:
    st, body = api(f"/fields/{COL}", "POST", {
        "field": FIELD,
        "type": "uuid",
        "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "display": "related-values",
                 "options": {"template": "{{first_name}} {{last_name}}"}},
        "schema": {"foreign_key_table": "directus_users", "foreign_key_column": "id",
                   "on_delete": "SET NULL", "is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Relación ==")
st, rels = api("/relations")
have = {(r.get("collection"), r.get("field")) for r in rels.get("data", [])}
if (COL, FIELD) in have:
    print("  ya existe")
else:
    st, body = api("/relations", "POST", {
        "collection": COL, "field": FIELD, "related_collection": "directus_users",
        "meta": {"many_collection": COL, "many_field": FIELD,
                 "one_collection": "directus_users", "one_field": None},
        "schema": {"table": COL, "column": FIELD,
                   "foreign_key_table": "directus_users", "foreign_key_column": "id",
                   "on_delete": "SET NULL"},
    })
    print(f"  POST relation → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

# Forzamos el on_delete (el POST /relations no siempre lo aplica).
st, body = api(f"/relations/{COL}/{FIELD}", "PATCH", {"schema": {"on_delete": "SET NULL"}})
print(f"  PATCH on_delete SET NULL → {st}")

print()
print("== Permisos ==")
st, pol = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in pol.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
allp = perms.get("data", []) if st == 200 else []

for pname, acciones in (("cliente_acceso", ["read"]), ("editor_acceso", ["read", "create", "update"])):
    pid = policies.get(pname)
    if not pid:
        continue
    for action in acciones:
        row = next((p for p in allp if p.get("policy") == pid
                    and p.get("collection") == COL and p.get("action") == action), None)
        if not row:
            print(f"  {pname}.{action}: no existe (se salta)")
            continue
        fields = row.get("fields") or []
        if "*" in fields or FIELD in fields:
            print(f"  {pname}.{action}: ok")
            continue
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + [FIELD]})
        print(f"  {pname}.{action} += {FIELD} → {st}")

print()
print("== Verificación ==")
st, _ = api(f"/fields/{COL}/{FIELD}")
print("  campo:", st == 200)
st, perms = api("/permissions?fields=policy,collection,action,fields&limit=-1")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    mine = [(p["action"], FIELD in (p.get("fields") or [])) for p in perms.get("data", [])
            if p.get("policy") == pid and p.get("collection") == COL]
    print(f"  {pname}:", mine)
api("/utils/cache/clear", "POST", {"system": True})
