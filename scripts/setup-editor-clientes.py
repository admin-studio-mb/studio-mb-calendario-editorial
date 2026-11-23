#!/usr/bin/env python3
"""Permite al rol Editor actualizar la información de un cliente.

Puede tocar logo, tipos de post, redes y color de marca; NO el nombre
(eso sigue siendo solo del Administrador, también a nivel de Directus).
"""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
CAMPOS = ["logo", "tipos_contenido_disponibles", "redes", "color_marca"]

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
    raise SystemExit(f"no se pudieron leer las policies: {pol}")
pid = next(p["id"] for p in pol.get("data", []) if p["name"] == "editor_acceso")

st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
if not isinstance(perms, dict):
    raise SystemExit(f"no se pudieron leer los permisos: {perms}")
existente = next(
    (p for p in perms.get("data", [])
     if p.get("policy") == pid and p.get("collection") == "clientes" and p.get("action") == "update"),
    None,
)

if existente:
    st, body = api(f"/permissions/{existente['id']}", "PATCH", {"fields": CAMPOS})
    print("update existente →", st, CAMPOS)
else:
    st, body = api("/permissions", "POST", {
        "policy": pid,
        "collection": "clientes",
        "action": "update",
        "fields": CAMPOS,
        "permissions": {},
        "validation": {},
        "presets": {},
    })
    print("update nuevo →", st)

api("/utils/cache/clear", "POST", {"system": True})
