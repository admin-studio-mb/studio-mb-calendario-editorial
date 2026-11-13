#!/usr/bin/env python3
"""Efemérides / fechas clave (idempotente).

Colección `efemerides`:
  dia     int (1-31)
  mes     int (1-12)
  nombre  string
  ambito  'espana' | 'cataluna' | 'marketing' | 'propia'
  notas   text (opcional)

Se repiten cada año (no hay año: solo día/mes).

Permisos: read para cliente_acceso y editor_acceso; el resto (crear/editar/
borrar) solo admin.

Semilla: lista curada de fechas fijas de España, Cataluña y marketing. No
incluye fechas variables (Semana Santa, Black Friday) porque cambian cada año.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
COL = "efemerides"

SEED = [
    # España
    (1, 1, "Año Nuevo", "espana"),
    (6, 1, "Día de Reyes", "espana"),
    (2, 2, "Día de la Candelaria", "espana"),
    (14, 2, "San Valentín", "marketing"),
    (8, 3, "Día Internacional de la Mujer", "espana"),
    (19, 3, "San José / Día del Padre", "espana"),
    (23, 4, "Día del Libro", "espana"),
    (1, 5, "Día del Trabajador", "espana"),
    (2, 5, "Día de la Madre", "marketing"),
    (15, 8, "Asunción", "espana"),
    (12, 10, "Fiesta Nacional de España", "espana"),
    (1, 11, "Todos los Santos", "espana"),
    (6, 12, "Día de la Constitución", "espana"),
    (8, 12, "Inmaculada Concepción", "espana"),
    (25, 12, "Navidad", "espana"),
    (31, 12, "Nochevieja", "espana"),
    # Cataluña
    (23, 4, "Sant Jordi", "cataluna"),
    (24, 6, "Sant Joan", "cataluna"),
    (11, 9, "Diada Nacional de Catalunya", "cataluna"),
    (26, 12, "Sant Esteve", "cataluna"),
    # Marketing / estacional
    (7, 1, "Inicio de rebajas", "marketing"),
    (20, 3, "Inicio de la primavera", "marketing"),
    (21, 6, "Inicio del verano", "marketing"),
    (1, 9, "Vuelta al cole", "marketing"),
    (23, 9, "Inicio del otoño", "marketing"),
    (1, 11, "Arranque de campaña de Navidad", "marketing"),
    (21, 12, "Inicio del invierno", "marketing"),
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


FIELDS = [
    {
        "field": "id", "type": "uuid",
        "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
        "schema": {"is_primary_key": True, "has_auto_increment": False},
    },
    {"field": "dia", "type": "integer", "meta": {"interface": "input"}, "schema": {}},
    {"field": "mes", "type": "integer", "meta": {"interface": "input"}, "schema": {}},
    {"field": "nombre", "type": "string", "meta": {"interface": "input"}, "schema": {}},
    {
        "field": "ambito", "type": "string",
        "meta": {"interface": "select-dropdown", "options": {"choices": [
            {"text": "España", "value": "espana"},
            {"text": "Cataluña", "value": "cataluna"},
            {"text": "Marketing", "value": "marketing"},
            {"text": "Propia", "value": "propia"},
        ]}},
        "schema": {"default_value": "propia"},
    },
    {"field": "notas", "type": "text", "meta": {"interface": "input-multiline"}, "schema": {"is_nullable": True}},
]

print("== Colección `efemerides` ==")
st, cols = api("/collections?fields=collection&limit=-1")
existing = {c["collection"] for c in cols.get("data", [])} if st == 200 else set()
if COL in existing:
    print("  ya existe")
else:
    st, body = api("/collections", "POST", {
        "collection": COL,
        "meta": {"icon": "event", "note": "Efemérides y fechas clave (se repiten cada año)",
                 "archive_field": None, "sort_field": None, "display_template": "{{nombre}}"},
        "schema": {},
    })
    print(f"  POST /collections → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Campos ==")
for f in FIELDS:
    st, _ = api(f"/fields/{COL}/{f['field']}")
    if st == 200:
        print(f"  ya existe: {f['field']}")
        continue
    st, body = api(f"/fields/{COL}", "POST", f)
    print(f"  POST {f['field']} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Semilla ==")
st, cur = api(f"/items/{COL}?fields=dia,mes,nombre&limit=-1")
actuales = {(i["dia"], i["mes"], i["nombre"]) for i in cur.get("data", [])} if st == 200 else set()
nuevos = [d for d in SEED if d not in actuales]
if nuevos:
    st, body = api(f"/items/{COL}", "POST", [
        {"dia": d, "mes": m, "nombre": n, "ambito": a} for d, m, n, a in nuevos
    ])
    print(f"  insertadas {len(nuevos)} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))
else:
    print("  ya estaban todas")

print()
print("== Permisos de lectura ==")
st, pol = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in pol.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action&limit=-1")
allp = perms.get("data", []) if st == 200 else []
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    if not pid:
        continue
    row = next((p for p in allp if p.get("policy") == pid and p.get("collection") == COL and p.get("action") == "read"), None)
    if row:
        print(f"  {pname}.read: ya existe")
        continue
    st, body = api("/permissions", "POST", {
        "policy": pid, "collection": COL, "action": "read",
        "fields": ["*"], "permissions": {}, "validation": {},
    })
    print(f"  POST {pname}.read → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Verificación ==")
st, items = api(f"/items/{COL}?fields=id&limit=-1")
print("  efemérides:", len(items.get("data", [])) if st == 200 else "?")
api("/utils/cache/clear", "POST", {"system": True})
