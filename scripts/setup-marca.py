#!/usr/bin/env python3
"""Marca blanca por cliente (idempotente).

Campo `clientes.color_marca` (string hex, p.ej. "#4f46e5").

Permisos: lectura para cliente_acceso y editor_acceso (el SSR del layout
necesita el color y el logo); escritura la hace el admin al editar el cliente.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
FIELD = "color_marca"


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


print("== Campo clientes.color_marca ==")
st, _ = api(f"/fields/clientes/{FIELD}")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/clientes", "POST", {
        "field": FIELD,
        "type": "string",
        "meta": {"interface": "input", "note": "Color de marca en hex (#4f46e5). Vacío = morado Studio mb."},
        "schema": {"is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos de lectura ==")
st, pol = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in pol.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
allp = perms.get("data", []) if st == 200 else []
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    if not pid:
        continue
    row = next((p for p in allp if p.get("policy") == pid
                and p.get("collection") == "clientes" and p.get("action") == "read"), None)
    if not row:
        print(f"  {pname}.read: no existe (se salta)")
        continue
    fields = row.get("fields") or []
    if "*" in fields or FIELD in fields:
        print(f"  {pname}.read: ok")
        continue
    st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + [FIELD]})
    print(f"  {pname}.read += {FIELD} → {st}")

print()
print("== Verificación ==")
st, _ = api(f"/fields/clientes/{FIELD}")
print("  campo:", st == 200)
api("/utils/cache/clear", "POST", {"system": True})
