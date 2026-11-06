#!/usr/bin/env python3
"""Crea un usuario ADMIN temporal para poder ejecutar el E2E de la app local.

Se borra al terminar. La contraseña se genera aquí y sólo vive en este script.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
EMAIL = "e2e-temp@studiomb.es"
PASSWORD = os.environ.get("E2E_TEMP_PASSWORD") or "Tmp_E2E_2026_xK9!"


def read_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("sin token")


TOKEN = read_token()


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def cleanup():
    """Borra el usuario temporal (y lo que haya creado)."""
    st, users = api("/users")
    for u in (users.get("data", []) if isinstance(users, dict) else []):
        if u.get("email") == EMAIL:
            st, r = api(f"/users/{u['id']}", method="DELETE")
            if st not in (200, 204):
                print(f"  ⚠ no se pudo borrar {u['id'][:8]}: {st}")
                print(f"    {json.dumps(r, ensure_ascii=False)[:200]}")
            else:
                print(f"  usuario temporal borrado ({u['id'][:8]})")


# Limpieza de un posible usuario previo
st, users = api("/users")
for u in (users.get("data", []) if isinstance(users, dict) else []):
    if u.get("email") == EMAIL:
        api(f"/users/{u['id']}", method="DELETE")

if "--cleanup" in sys.argv:
    print("usuario temporal ya borrado")
    raise SystemExit(0)

st, roles = api("/roles")
admin_role = next(r["id"] for r in roles["data"] if r["name"] == "Administrator")

st, u = api("/users", method="POST", body={
    "email": EMAIL,
    "password": PASSWORD,
    "first_name": "E2E",
    "last_name": "Temporal",
    "role": admin_role,
})
if st not in (200, 201):
    print(f"ERROR al crear el usuario: {st} {json.dumps(u, ensure_ascii=False)[:400]}")
    raise SystemExit(1)

uid = u["data"]["id"]
st, login = api("/auth/login", method="POST",
                body={"email": EMAIL, "password": PASSWORD, "mode": "json"})
print(f"usuario creado: {uid}")
print(f"login: {st} → {'OK' if login.get('data', {}).get('access_token') else 'FALLO'}")
print(f"EMAIL={EMAIL}")
print(f"PASSWORD={PASSWORD}")
print()
print("--- Ejecuta ahora scripts/e2e-app.py con:")
print(f"  DIRECTUS_EMAIL={EMAIL} DIRECTUS_ADMIN_PASS='<la de arriba>' python scripts/e2e-app.py")
print("--- Cuando termines, borra el usuario temporal:")
print(f"  python scripts/create-e2e-user.py --cleanup")
