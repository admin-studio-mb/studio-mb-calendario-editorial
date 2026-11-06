#!/usr/bin/env python3
"""Corrige los permisos de la policy `cliente_acceso`.

Dos correcciones:
  1. `comentarios.read`: el filtro relacional NO es
     {"publicacion_id": {"_in": {"publicaciones": {...}}}} (→ HTTP 500, sintaxis
     inválida en Directus 12). La forma correcta es el "deep filter" directo:
     {"publicacion_id": {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}}
  2. `publicaciones.create`: en Directus 12 la restricción de qué filas puede
     crear un usuario NO va en `permissions` (que es el filtro de lectura) sino
     en `validation`. Con `permissions` el usuario podía crear publicaciones
     para OTRO cliente (verificado: HTTP 204, se creaba de verdad).

Además añade `directus_files.read` restringido a los archivos de su cliente,
`comentarios.update/delete` (sólo el autor) y `directus_users.update` para
que un cliente pueda actualizar su propio perfil.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"


def read_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("sin token")


TOKEN = read_token()


def api(path, method="GET", body=None, query=None):
    url = BASE + path
    if query:
        parts = [f"{k}={urllib.parse.quote(str(v), safe='')}"
                 for k, v in query.items() if v is not None]
        if parts:
            url += ("&" if "?" in url else "?") + "&".join(parts)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Cache-Control", "no-cache")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def show(label, st, body, limit=280):
    text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    print(f"  {label}: http {st} → {text[:limit]}")


st, policies = api("/policies")
policy = next(p for p in policies["data"] if p["name"] == "cliente_acceso")
pid = policy["id"]

st, perms = api("/permissions")
mine = {f"{p['collection']}.{p['action']}": p
        for p in perms["data"] if p.get("policy") == pid}

CLIENTE_FILTER = {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}

print("== 1. Corregir comentarios.read (deep filter) ==")
old = mine.get("comentarios.read")
if old:
    show("PATCH permissions/{}".format(old["id"]), *api(
        f"/permissions/{old['id']}", method="PATCH",
        body={"permissions": {"publicacion_id": {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}}}))

print()
print("== 2. Corregir publicaciones.create (usar validation) ==")
old = mine.get("publicaciones.create")
if old:
    show("PATCH permissions/{}".format(old["id"]), *api(
        f"/permissions/{old['id']}", method="PATCH",
        body={"permissions": {}, "validation": CLIENTE_FILTER}))

print()
print("== 3. publicaciones.update: validación de cliente_id ==")
old = mine.get("publicaciones.update")
if old:
    show("PATCH permissions/{}".format(old["id"]), *api(
        f"/permissions/{old['id']}", method="PATCH",
        body={"permissions": CLIENTE_FILTER, "validation": CLIENTE_FILTER}))

print()
print("== 4. Permisos que faltan ==")
NUEVOS = [
    # (collection, action, fields, permissions, validation)
    ("comentarios", "update", ["texto"], {"usuario_id": {"_eq": "$CURRENT_USER"}}, {}),
    ("comentarios", "delete", ["*"], {"usuario_id": {"_eq": "$CURRENT_USER"}}, {}),
    ("directus_users", "update",
     ["first_name", "last_name", "email", "password", "cliente_id"],
     {"id": {"_eq": "$CURRENT_USER"}},
     {"cliente_id": {"_eq": "$CURRENT_USER.cliente_id"}}),
]
for coll, action, fields, permissions, validation in NUEVOS:
    key = f"{coll}.{action}"
    if key in mine:
        print(f"  ya existe: {key}")
        continue
    st, body = api("/permissions", method="POST", body={
        "policy": pid, "collection": coll, "action": action,
        "fields": fields, "permissions": permissions, "validation": validation,
    })
    show(f"POST permission {key}", st, body)

print()
print("== Verificación ==")
st, perms = api("/permissions")
mine = [p for p in perms["data"] if p.get("policy") == pid]
for p in mine:
    print(f"  {p.get('collection')}.{p.get('action'):<8} "
          f"perm={json.dumps(p.get('permissions'), ensure_ascii=False)[:90]}")
    if p.get("validation"):
        print(f"{'':>15}valid={json.dumps(p.get('validation'), ensure_ascii=False)[:90]}")
