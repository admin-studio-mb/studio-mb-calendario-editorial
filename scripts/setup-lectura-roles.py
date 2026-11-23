#!/usr/bin/env python3
"""Lectura de roles para el equipo y los clientes (idempotente).

Sin permiso de lectura sobre `directus_roles`, Directus devuelve
`role` como id y no como objeto `{id, name}` al pedir `role.name` en
`/users/me`. Eso deja a `esEditor()`/`esCliente()` sin nombre de rol.
"""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"

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


st, pol = api("/policies?fields=id,name&limit=-1")
if not isinstance(pol, dict):
    raise SystemExit(f"sin policies: {pol}")
policy_ids = {p["name"]: p["id"] for p in pol.get("data", [])}

st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
if not isinstance(perms, dict):
    raise SystemExit(f"sin permisos: {perms}")

for nombre in ("editor_acceso", "cliente_acceso"):
    pid = policy_ids.get(nombre)
    if not pid:
        print(f"{nombre}: no existe, se salta")
        continue
    actual = next(
        (p for p in perms.get("data", [])
         if p.get("policy") == pid and p.get("collection") == "directus_roles" and p.get("action") == "read"),
        None,
    )
    if actual:
        if "*" in (actual.get("fields") or []) or set(["id", "name"]).issubset(actual.get("fields") or []):
            print(f"{nombre}: ya puede leer roles")
            continue
        st, body = api(f"/permissions/{actual['id']}", "PATCH", {"fields": ["id", "name"]})
        print(f"{nombre}: PATCH → {st}")
    else:
        st, body = api("/permissions", "POST", {
            "policy": pid,
            "collection": "directus_roles",
            "action": "read",
            "fields": ["id", "name"],
            "permissions": {},
            "validation": {},
            "presets": {},
        })
        print(f"{nombre}: POST → {st}")

api("/utils/cache/clear", "POST", {"system": True})
