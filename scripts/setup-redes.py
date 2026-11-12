#!/usr/bin/env python3
"""Añade el modelo de redes sociales (idempotente).

  1. `publicaciones.red` (string: instagram | linkedin | facebook).
  2. `clientes.redes` (json: [{red, tipos: string[]}]).
  3. Permisos: añade `red` a los fields de publicaciones y `redes` a los de
     clientes en las policies cliente_acceso y editor_acceso.
  4. Backfill: publicaciones sin red → 'instagram'; clientes sin redes →
     Instagram con sus tipos actuales + LinkedIn/Facebook con tipos por
     defecto.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"

REDES_DEFAULT = [
    {"red": "instagram", "tipos": ["Post", "Reel", "Carrusel", "Story"]},
    {"red": "linkedin", "tipos": ["Post", "Artículo", "Vídeo"]},
    {"red": "facebook", "tipos": ["Post", "Vídeo", "Story"]},
]


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


print("== Campo publicaciones.red ==")
st, _ = api("/fields/publicaciones/red")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/publicaciones", "POST", {
        "field": "red",
        "type": "string",
        "meta": {
            "interface": "select-dropdown",
            "options": {"choices": [
                {"text": "Instagram", "value": "instagram"},
                {"text": "LinkedIn", "value": "linkedin"},
                {"text": "Facebook", "value": "facebook"},
            ]},
        },
        "schema": {"is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Campo clientes.redes ==")
st, _ = api("/fields/clientes/redes")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/clientes", "POST", {
        "field": "redes",
        "type": "json",
        "meta": {"interface": "input-code", "special": ["cast-json"],
                 "options": {"language": "json"}, "note": "[{red, tipos:[...]}]"},
        "schema": {"default_value": "[]", "is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos ==")
st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
perm_rows = perms.get("data", []) if st == 200 else []
st, policies = api("/policies?fields=id,name&limit=-1")
pid = {p["name"]: p["id"] for p in policies.get("data", [])}

EXTRA = {
    ("publicaciones", "read"): "red",
    ("publicaciones", "create"): "red",
    ("publicaciones", "update"): "red",
    ("clientes", "read"): "redes",
}

for pname in ("cliente_acceso", "editor_acceso"):
    policy = pid.get(pname)
    if not policy:
        print(f"  {pname}: no existe")
        continue
    for row in perm_rows:
        if row.get("policy") != policy:
            continue
        key = (row.get("collection"), row.get("action"))
        field = EXTRA.get(key)
        if not field:
            continue
        fields = row.get("fields") or []
        if field in fields:
            print(f"  {pname} {key[0]}.{key[1]}: ya tiene {field}")
            continue
        st, body = api(f"/permissions/{row['id']}", "PATCH",
                       {"fields": fields + [field]})
        print(f"  {pname} {key[0]}.{key[1]} += {field} → {st}" +
              ("" if st == 200 else f" {json.dumps(body)[:160]}"))

print()
print("== Backfill publicaciones.red = 'instagram' ==")
st, body = api("/items/publicaciones", "PATCH", {
    "data": {"red": "instagram"},
    "query": {"filter": {"red": {"_null": True}}},
})
print(f"  → {st}")

print()
print("== Backfill clientes.redes ==")
st, r = api("/items/clientes?fields=id,nombre,tipos_contenido_disponibles,redes&limit=-1")
for c in r.get("data", []) if isinstance(r, dict) else []:
    redes = c.get("redes")
    if isinstance(redes, list) and len(redes) > 0:
        print(f"  {c['nombre']}: ya tiene redes")
        continue
    tipos = c.get("tipos_contenido_disponibles") or []
    redes_new = [{
        "red": "instagram",
        "tipos": tipos if tipos else REDES_DEFAULT[0]["tipos"],
    }, REDES_DEFAULT[1], REDES_DEFAULT[2]]
    st, body = api(f"/items/clientes/{c['id']}", "PATCH", {"redes": redes_new})
    print(f"  {c['nombre']}: redes → {st}")

print()
print("== Verificación ==")
st, f = api("/fields/publicaciones/red")
print("  publicaciones.red existe:", st == 200)
st, f = api("/fields/clientes/redes")
print("  clientes.redes existe:", st == 200)
st, r = api("/items/publicaciones?filter[red][_null]=true&fields=id&limit=1")
print("  publicaciones sin red:", len(r.get("data", [])) if isinstance(r, dict) else "?")
st, r = api("/items/clientes?fields=nombre,redes&limit=-1")
for c in r.get("data", []) if isinstance(r, dict) else []:
    print(f"  {c['nombre']}: {[(x.get('red'), len(x.get('tipos') or [])) for x in (c.get('redes') or [])]}")
api("/utils/cache/clear", "POST", {"system": True})
