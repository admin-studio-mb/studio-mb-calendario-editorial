#!/usr/bin/env python3
"""Carrusel de diseño final (idempotente).

Añade `publicaciones.diseno_slides` (JSON con ids/URLs de las slides). La
primera slide es la portada del mockup; `diseno_final` se mantiene como
portada para PDF y compatibilidad.
"""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
FIELD = "diseno_slides"

with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
    TOKEN = next(
        l.split("=", 1)[1].strip().strip('"').strip("'")
        for l in fh if l.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN=")
    )


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


print("== Campo publicaciones.diseno_slides ==")
st, _ = api(f"/fields/publicaciones/{FIELD}")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/publicaciones", "POST", {
        "field": FIELD,
        "type": "json",
        "meta": {
            "interface": "list",
            "note": "Slides del diseño final (ids de archivo o URLs). La primera es la portada.",
        },
        "schema": {"is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos ==")
st, pol = api("/policies?fields=id,name&limit=-1")
if not isinstance(pol, dict):
    raise SystemExit(f"sin policies: {pol}")
policy_ids = {p["name"]: p["id"] for p in pol.get("data", [])}

st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
if not isinstance(perms, dict):
    raise SystemExit(f"sin permisos: {perms}")

QUIEN = {
    "cliente_acceso": ("read",),
    "editor_acceso": ("read", "create", "update"),
}
for policy_name, acciones in QUIEN.items():
    pid = policy_ids.get(policy_name)
    if not pid:
        continue
    for accion in acciones:
        row = next(
            (p for p in perms.get("data", [])
             if p.get("policy") == pid
             and p.get("collection") == "publicaciones"
             and p.get("action") == accion),
            None,
        )
        if not row:
            print(f"  {policy_name}.{accion}: no existe (se salta)")
            continue
        campos = row.get("fields") or []
        if "*" in campos or FIELD in campos:
            print(f"  {policy_name}.{accion}: ok")
            continue
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": campos + [FIELD]})
        print(f"  {policy_name}.{accion} += {FIELD} → {st}")

api("/utils/cache/clear", "POST", {"system": True})
