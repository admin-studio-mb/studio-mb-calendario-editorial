#!/usr/bin/env python3
"""Campo `preferencias` (JSON) en directus_users + permisos (idempotente).

`preferencias` guarda opciones de UI por usuario, p.ej.:
    { "panelNueva": true }

Permisos:
  - cliente_acceso: añade `preferencias` a los fields del update propio.
  - editor_acceso: crea el permiso update (solo `preferencias`, solo el suyo).
  - Administrator: full_access ya puede.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"


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


print("== Campo directus_users.preferencias ==")
st, _ = api("/fields/directus_users/preferencias")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/directus_users", "POST", {
        "field": "preferencias",
        "type": "json",
        "meta": {
            "interface": "input-code",
            "special": ["cast-json"],
            "options": {"language": "json"},
            "note": "Preferencias de UI por usuario (panelNueva, ...)",
        },
        "schema": {"default_value": "{}", "is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos ==")
st, policies = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in policies.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields,permissions&limit=-1")
allp = perms.get("data", []) if st == 200 else []

# 1) cliente_acceso: añadir 'preferencias' al update existente.
cid = policies.get("cliente_acceso")
row = next((p for p in allp if p.get("policy") == cid
            and p.get("collection") == "directus_users" and p.get("action") == "update"), None)
if row:
    fields = row.get("fields") or []
    if "preferencias" in fields:
        print("  cliente_acceso update: ya tiene preferencias")
    else:
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + ["preferencias"]})
        print(f"  cliente_acceso update += preferencias → {st}")
else:
    print("  cliente_acceso: no hay update de directus_users (revisar)")

# 2) editor_acceso: crear update de directus_users (solo preferencias).
eid = policies.get("editor_acceso")
row = next((p for p in allp if p.get("policy") == eid
            and p.get("collection") == "directus_users" and p.get("action") == "update"), None)
if row:
    fields = row.get("fields") or []
    if "preferencias" in fields:
        print("  editor_acceso update: ya existe")
    else:
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + ["preferencias"]})
        print(f"  editor_acceso update += preferencias → {st}")
else:
    st, body = api("/permissions", "POST", {
        "policy": eid,
        "collection": "directus_users",
        "action": "update",
        "fields": ["preferencias"],
        "permissions": {"id": {"_eq": "$CURRENT_USER"}},
        "validation": {},
    })
    print(f"  POST editor_acceso update → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Verificación ==")
st, f = api("/fields/directus_users/preferencias")
print("  campo existe:", st == 200)
st, perms = api("/permissions?fields=policy,collection,action,fields&limit=-1")
for name in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(name)
    rows = [p for p in perms.get("data", []) if p.get("policy") == pid
            and p.get("collection") == "directus_users" and p.get("action") == "update"]
    print(f"  {name} update fields:", rows[0].get("fields") if rows else "—")
api("/utils/cache/clear", "POST", {"system": True})
