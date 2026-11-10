#!/usr/bin/env python3
"""Verifica el guard por rol de /api/publicaciones (POST/PATCH/DELETE).

Crea un cliente, un usuario rol Cliente y una publicación TEMPORALES en
Directus, ejecuta la matriz de permisos contra la app (dev server local o la
URL que se pase en APP_URL) y limpia TODO al final.

Uso:
    python scripts/verify-role-guard.py
    APP_URL=http://127.0.0.1:4321 python scripts/verify-role-guard.py
"""
import http.cookiejar
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRECTUS = "https://cms.studiomb.es"
APP = os.environ.get("APP_URL", "http://127.0.0.1:4321").rstrip("/")
EMAIL = "zz-e2e-rol@studiomb.es"
# Contraseña aleatoria por ejecución: nunca se hardcodea (el usuario es
# temporal y se borra al final del script).
PASSWORD = os.environ.get("E2E_TEMP_PASSWORD") or secrets.token_urlsafe(18)


def read_static_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Falta PUBLIC_DIRECTUS_STATIC_TOKEN en .env")


ADMIN_TOKEN = read_static_token()


def admin(path, method="GET", body=None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(DIRECTUS + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + ADMIN_TOKEN)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def make_app_opener():
    """Opener con cookies de sesión (login por formulario en /api/auth/login)."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    form = urllib.parse.urlencode({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(APP + "/api/auth/login", data=form, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with opener.open(req, timeout=30) as r:
        r.read()

    cookies = {c.name for c in jar}
    if not cookies:
        raise SystemExit("Login del usuario temporal falló: sin cookie de sesión")
    return opener


def app_call(opener, method, path, body=None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main():
    creados = {"publicacion": None, "usuario": None, "cliente": None}
    fallos = []
    try:
        # 1) Rol Cliente
        st, roles = admin("/roles?filter[name][_eq]=Cliente&fields=id,name")
        if st != 200 or not roles.get("data"):
            raise SystemExit(f"No se encontró el rol Cliente: {st} {roles}")
        rol_id = roles["data"][0]["id"]
        print(f"rol Cliente: {rol_id}")

        # 2) Cliente temporal
        st, r = admin("/items/clientes", "POST", {"nombre": "ZZ E2E Rol"})
        if st not in (200, 201):
            raise SystemExit(f"No se pudo crear el cliente temporal: {st} {r}")
        cliente_id = r["data"]["id"]
        creados["cliente"] = cliente_id

        # 3) Usuario temporal rol Cliente
        st, r = admin("/users", "POST", {
            "email": EMAIL,
            "password": PASSWORD,
            "role": rol_id,
            "cliente_id": cliente_id,
            "first_name": "ZZ",
            "last_name": "E2E",
            "status": "active",
        })
        if st not in (200, 201):
            raise SystemExit(f"No se pudo crear el usuario temporal: {st} {r}")
        creados["usuario"] = r["data"]["id"]

        # 4) Publicación temporal en 'revision'
        st, r = admin("/items/publicaciones", "POST", {
            "cliente_id": cliente_id,
            "fecha_publicacion": "2026-12-01T09:00:00",
            "estado": "revision",
            "formato": "post",
            "copywriting": "ZZ temporal",
        })
        if st not in (200, 201):
            raise SystemExit(f"No se pudo crear la publicación temporal: {st} {r}")
        pub_id = r["data"]["id"]
        creados["publicacion"] = pub_id
        print(f"publicación temporal: {pub_id}")

        opener = make_app_opener()
        print("login del usuario Cliente: OK\n")

        def check(nombre, esperado, method, path, body=None):
            st, raw = app_call(opener, method, path, body)
            ok = st == esperado
            print(f"  [{'OK ' if ok else 'FALLO'}] {nombre}: {st} (esperado {esperado})")
            if not ok:
                fallos.append(f"{nombre}: {st} != {esperado} — {raw[:200]}")

        print("Matriz de permisos del rol Cliente:")
        check("crear publicación", 403, "POST", "/api/publicaciones",
              {"cliente_id": cliente_id, "fecha_publicacion": "2026-12-02T09:00:00"})
        check("editar copywriting", 403, "PATCH", f"/api/publicaciones/{pub_id}",
              {"copywriting": "hack"})
        check("salto a publicado", 403, "PATCH", f"/api/publicaciones/{pub_id}",
              {"estado": "publicado"})
        check("transición inexistente", 403, "PATCH", f"/api/publicaciones/{pub_id}",
              {"estado": "revision"})
        check("confirmar texto (revision→en_diseno)", 200, "PATCH",
              f"/api/publicaciones/{pub_id}", {"estado": "en_diseno"})
        check("aprobar sin diseño (en_diseno→aprobado)", 403, "PATCH",
              f"/api/publicaciones/{pub_id}", {"estado": "aprobado"})
        check("borrar publicación", 403, "DELETE", f"/api/publicaciones/{pub_id}")

        # La confirmación válida debió persistir.
        st, r = admin(f"/items/publicaciones/{pub_id}?fields=estado")
        estado = r.get("data", {}).get("estado") if st == 200 else f"error {st}"
        print(f"\nestado persistido tras confirmar: {estado} (esperado en_diseno)")
        if estado != "en_diseno":
            fallos.append(f"estado persistido {estado} != en_diseno")
    finally:
        print("\nLimpieza…")
        if creados["publicacion"]:
            st, _ = admin(f"/items/publicaciones/{creados['publicacion']}", "DELETE")
            print(f"  publicación borrada: {st}")
        if creados["usuario"]:
            st, _ = admin(f"/users/{creados['usuario']}", "DELETE")
            print(f"  usuario borrado: {st}")
        if creados["cliente"]:
            st, _ = admin(f"/items/clientes/{creados['cliente']}", "DELETE")
            print(f"  cliente borrado: {st}")
        admin("/utils/cache/clear", "POST", {"system": True})

    if fallos:
        print("\nFALLOS:")
        for f in fallos:
            print("  -", f)
        sys.exit(1)
    print("\nTodos los checks OK ✓")


if __name__ == "__main__":
    main()
