#!/usr/bin/env python3
"""Foto de perfil de los usuarios (idempotente).

Directus ya tiene `directus_users.avatar`; el problema es que las policies de
cliente/editor no lo incluían ni en lectura ni en la actualización (que está
limitada a `id = $CURRENT_USER`).
"""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
CAMPO = "avatar"

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

for nombre in ("cliente_acceso", "editor_acceso"):
    pid = policy_ids.get(nombre)
    if not pid:
        print(f"{nombre}: no existe, se salta")
        continue
    for accion in ("read", "update"):
        fila = next(
            (p for p in perms.get("data", [])
             if p.get("policy") == pid
             and p.get("collection") == "directus_users"
             and p.get("action") == accion),
            None,
        )
        if not fila:
            print(f"{nombre}.{accion}: no existe (se salta)")
            continue
        campos = fila.get("fields") or []
        if "*" in campos or CAMPO in campos:
            print(f"{nombre}.{accion}: ok")
            continue
        st, body = api(f"/permissions/{fila['id']}", "PATCH", {"fields": campos + [CAMPO]})
        print(f"{nombre}.{accion} += {CAMPO} → {st}")

api("/utils/cache/clear", "POST", {"system": True})
