#!/usr/bin/env python3
"""Crea el rol `Editor` y su policy `editor_acceso` en Directus (idempotente).

El Editor es personal de agencia: trabaja con TODOS los clientes y puede
crear/editar/borrar publicaciones y subir diseños, pero NO gestiona clientes,
usuarios ni el esquema (eso es solo del Administrator).

No asigna el rol a ningún usuario: eso se hace luego desde la app
(/dashboard/usuarios) o en la UI de Directus.
"""
import json
import os
import urllib.error
import urllib.parse
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
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
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
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def show(label, st, body, limit=260):
    text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    print(f"  {label}: http {st} → {text[:limit]}")


print("== Policy `editor_acceso` ==")
st, policies = api("/policies")
policy = next((p for p in policies.get("data", []) if p.get("name") == "editor_acceso"), None)
if policy:
    policy_id = policy["id"]
    print(f"  ya existe: {policy_id}")
else:
    st, body = api("/policies", method="POST", body={
        "name": "editor_acceso",
        "icon": "edit",
        "description": "Personal de agencia: todos los clientes, publicaciones y diseños. "
                       "Sin gestión de clientes/usuarios.",
        "admin_access": False,
        "app_access": False,
        "enforce_tfa": False,
    })
    show("POST policy", st, body)
    policy_id = (body.get("data") or {}).get("id") if st in (200, 201) else None

print()
print("== Rol `Editor` ==")
st, roles = api("/roles")
role = next((r for r in roles.get("data", []) if r.get("name") == "Editor"), None)
if role:
    role_id = role["id"]
    print(f"  ya existe: {role_id}")
else:
    st, body = api("/roles", method="POST", body={
        "name": "Editor",
        "icon": "edit",
        "description": "Personal de agencia: gestiona contenido de varios clientes.",
        "admin_access": False,
        "app_access": False,
    })
    show("POST role", st, body)
    role_id = (body.get("data") or {}).get("id") if st in (200, 201) else None

if role_id and policy_id:
    st, access = api("/access")
    linked = any(a.get("role") == role_id and a.get("policy") == policy_id
                 for a in access.get("data", []))
    if linked:
        print("  rol ya vinculado a la policy")
    else:
        st, body = api("/access", method="POST", body={"role": role_id, "policy": policy_id})
        show("POST access (rol→policy)", st, body)

print()
print("== Permisos de `editor_acceso` ==")
PERMISOS = [
    ("clientes", "read", ["id", "nombre", "logo", "tipos_contenido_disponibles"], {}),
    ("publicaciones", "read",
     ["id", "cliente_id", "tipo_contenido", "formato", "copywriting", "hashtags",
      "textos_slides", "imagenes_fondo", "fecha_publicacion", "diseno_final", "estado"],
     {}),
    ("publicaciones", "create",
     ["cliente_id", "tipo_contenido", "formato", "copywriting", "hashtags",
      "textos_slides", "imagenes_fondo", "fecha_publicacion", "diseno_final", "estado"],
     {}),
    ("publicaciones", "update",
     ["cliente_id", "tipo_contenido", "formato", "copywriting", "hashtags",
      "textos_slides", "imagenes_fondo", "fecha_publicacion", "diseno_final", "estado"],
     {}),
    ("publicaciones", "delete", ["id"], {}),
    ("comentarios", "read", ["id", "publicacion_id", "usuario_id", "texto", "fecha_creacion", "cliente_id"], {}),
    ("comentarios", "create", ["publicacion_id", "usuario_id", "texto", "cliente_id"], {}),
    ("comentarios", "update", ["texto"], {"usuario_id": {"_eq": "$CURRENT_USER"}}),
    ("comentarios", "delete", ["id"], {"usuario_id": {"_eq": "$CURRENT_USER"}}),
    ("directus_files", "read", ["*"], {}),
    ("directus_files", "create", ["*"], {}),
    ("directus_users", "read", ["id", "first_name", "last_name", "email", "role"], {}),
]

if policy_id:
    st, perms = api("/permissions")
    existing = {
        (p.get("collection"), p.get("action"))
        for p in perms.get("data", [])
        if p.get("policy") == policy_id
    }
    for coll, action, fields, permissions in PERMISOS:
        if (coll, action) in existing:
            print(f"  ya existe: {coll}.{action}")
            continue
        st, body = api("/permissions", method="POST", body={
            "policy": policy_id,
            "collection": coll,
            "action": action,
            "fields": fields,
            "permissions": permissions,
            "validation": {},
        })
        show(f"POST permission {coll}.{action}", st, body, 160)
else:
    print("  no se pudo crear la policy, se saltan los permisos")

print()
print("== Verificación ==")
st, perms = api("/permissions")
mine = [p for p in perms.get("data", []) if p.get("policy") == policy_id] if policy_id else []
print(f"  permisos de editor_acceso: {len(mine)}")
for p in mine:
    print(f"     {p.get('collection')}.{p.get('action')}")
print(f"  role_id={role_id} policy_id={policy_id}")
