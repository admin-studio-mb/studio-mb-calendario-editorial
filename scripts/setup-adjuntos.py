#!/usr/bin/env python3
"""Adjuntos en comentarios (idempotente).

- Campo `comentarios.adjuntos` (JSON): [{ id, filename, type }, …]
- Añade `adjuntos` a los fields de los permisos de comentarios (read/create/
  update) de cliente_acceso y editor_acceso.
- Da permiso `create` en directus_files a ambas policies (subir imágenes).
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


print("== Campo comentarios.adjuntos ==")
st, _ = api("/fields/comentarios/adjuntos")
if st == 200:
    print("  ya existe")
else:
    st, body = api("/fields/comentarios", "POST", {
        "field": "adjuntos",
        "type": "json",
        "meta": {
            "interface": "list",
            "special": ["cast-json"],
            "note": "Imágenes adjuntas al comentario: [{ id, filename, type }]",
        },
        "schema": {"default_value": "[]", "is_nullable": True},
    })
    print(f"  POST → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos ==")
st, pol = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in pol.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
allp = perms.get("data", []) if st == 200 else []

for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    if not pid:
        print(f"  {pname}: no existe, se salta")
        continue

    # 1) adjuntos en los fields de comentarios
    for action in ("read", "create", "update"):
        row = next((p for p in allp if p.get("policy") == pid
                    and p.get("collection") == "comentarios" and p.get("action") == action), None)
        if not row:
            print(f"  {pname}.comentarios.{action}: no existe (se salta)")
            continue
        fields = row.get("fields") or []
        if "*" in fields or "adjuntos" in fields:
            print(f"  {pname}.comentarios.{action}: ok")
            continue
        st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + ["adjuntos"]})
        print(f"  {pname}.comentarios.{action} += adjuntos → {st}")

    # 2) create en directus_files (subir imágenes de los comentarios)
    row = next((p for p in allp if p.get("policy") == pid
                and p.get("collection") == "directus_files" and p.get("action") == "create"), None)
    if row:
        print(f"  {pname}.directus_files.create: ya existe")
    else:
        st, body = api("/permissions", "POST", {
            "policy": pid,
            "collection": "directus_files",
            "action": "create",
            "fields": ["*"],
            "permissions": {},
            "validation": {},
        })
        print(f"  POST {pname}.directus_files.create → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:160]}"))

print()
print("== Verificación ==")
st, _ = api("/fields/comentarios/adjuntos")
print("  campo adjuntos:", st == 200)
st, perms = api("/permissions?fields=policy,collection,action,fields&limit=-1")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    mine = [(p["action"], p.get("fields")) for p in perms.get("data", [])
            if p.get("policy") == pid and p.get("collection") in ("comentarios", "directus_files")]
    print(f"  {pname}:", mine)
api("/utils/cache/clear", "POST", {"system": True})
