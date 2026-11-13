#!/usr/bin/env python3
"""Enlace público de aprobación (idempotente).

Campos en `publicaciones`:
  token_aprobacion   string único (32 hex) — null = sin enlace
  aprobacion_expira  string ISO UTC ("2027-01-01T09:00:00.000Z")

El token NO se añade a los fields legibles del rol Cliente: solo el equipo
(Administrator/Editor) puede verlo en la UI. La página pública lo usa en
servidor con el token estático.
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


FIELDS = [
    {
        "field": "token_aprobacion",
        "type": "string",
        "meta": {"interface": "input", "note": "Token del enlace público de aprobación", "hidden": True},
        "schema": {"is_nullable": True, "is_unique": True},
    },
    {
        "field": "aprobacion_expira",
        "type": "string",
        "meta": {"interface": "input", "note": "Caducidad ISO UTC del enlace (texto para evitar líos de zona)", "hidden": True},
        "schema": {"is_nullable": True},
    },
]

print("== Campos de publicaciones ==")
for f in FIELDS:
    st, _ = api(f"/fields/publicaciones/{f['field']}")
    if st == 200:
        print(f"  ya existe: {f['field']}")
        continue
    st, body = api("/fields/publicaciones", "POST", f)
    print(f"  POST {f['field']} → {st}" + ("" if st in (200, 201) else f" {json.dumps(body)[:200]}"))

print()
print("== Permisos (editor puede ver el token para gestionar el enlace) ==")
st, pol = api("/policies?fields=id,name&limit=-1")
policies = {p["name"]: p["id"] for p in pol.get("data", [])}
st, perms = api("/permissions?fields=id,policy,collection,action,fields&limit=-1")
allp = perms.get("data", []) if st == 200 else []

pid = policies.get("editor_acceso")
if pid:
    row = next((p for p in allp if p.get("policy") == pid
                and p.get("collection") == "publicaciones" and p.get("action") == "read"), None)
    if row:
        fields = row.get("fields") or []
        extra = [f["field"] for f in FIELDS if f["field"] not in fields]
        if "*" in fields or not extra:
            print("  editor read: ok")
        else:
            st, body = api(f"/permissions/{row['id']}", "PATCH", {"fields": fields + extra})
            print(f"  editor read += {extra} → {st}")
    else:
        print("  editor read: no existe (se salta)")
else:
    print("  editor_acceso: no existe (se salta)")

print()
print("== Verificación ==")
for f in FIELDS:
    st, _ = api(f"/fields/publicaciones/{f['field']}")
    print(f"  {f['field']}:", st == 200)
st, perms = api("/permissions?fields=policy,collection,action,fields&limit=-1")
for pname in ("cliente_acceso", "editor_acceso"):
    pid = policies.get(pname)
    row = next((p for p in perms.get("data", []) if p.get("policy") == pid
                and p.get("collection") == "publicaciones" and p.get("action") == "read"), None)
    print(f"  {pname} read tiene token:", bool(row and "token_aprobacion" in (row.get("fields") or [])))
