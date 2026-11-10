#!/usr/bin/env python3
"""Verifica el rol Editor contra la app (dev server local).

Comprueba que un Editor:
  - PUEDE crear/borrar publicaciones de CUALQUIER cliente.
  - NO puede gestionar usuarios (API y página) ni crear/editar/borrar clientes.

Crea un usuario Editor temporal y una publicación temporal, y limpia todo.
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
EMAIL = "zz-e2e-editor@studiomb.es"
# Contraseña aleatoria por ejecución: nunca se hardcodea.
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


def app_login():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    form = urllib.parse.urlencode({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(APP + "/api/auth/login", data=form, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with opener.open(req, timeout=30) as r:
        r.read()
    if not {c.name for c in jar}:
        raise SystemExit("Login del editor temporal falló: sin cookie")
    return opener


def app_call(opener, method, path, body=None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401
        return None


def main():
    creados = {"publicacion": None, "usuario": None}
    fallos = []
    try:
        st, roles = admin("/roles?filter[name][_eq]=Editor&fields=id,name")
        if st != 200 or not roles.get("data"):
            raise SystemExit(f"No existe el rol Editor (ejecuta setup-editor-role.py): {st} {roles}")
        rol_id = roles["data"][0]["id"]

        st, clientes = admin("/items/clientes?fields=id,nombre&limit=1")
        if st != 200 or not clientes.get("data"):
            raise SystemExit("No hay clientes para probar")
        cliente = clientes["data"][0]

        st, r = admin("/users", "POST", {
            "email": EMAIL, "password": PASSWORD, "role": rol_id,
            "first_name": "ZZ", "last_name": "Editor", "status": "active",
        })
        if st not in (200, 201):
            raise SystemExit(f"No se pudo crear el editor temporal: {st} {r}")
        creados["usuario"] = r["data"]["id"]
        print(f"editor temporal: {creados['usuario']} | cliente de prueba: {cliente['nombre']}")

        opener = app_login()
        print("login del editor: OK\n")

        def check(nombre, esperado, method, path, body=None):
            st, raw = app_call(opener, method, path, body)
            ok = st == esperado
            print(f"  [{'OK ' if ok else 'FALLO'}] {nombre}: {st} (esperado {esperado})")
            if not ok:
                fallos.append(f"{nombre}: {st} != {esperado} — {raw[:160]}")

        print("Rol Editor — lo que NO puede:")
        check("listar usuarios", 403, "GET", "/api/usuarios")
        check("crear usuario", 403, "POST", "/api/usuarios",
              {"email": "x@x.com", "password": "12345678", "role": "Editor"})
        check("crear cliente", 403, "POST", "/api/clientes",
              {"nombre": "ZZ no", "tipos_contenido_disponibles": ["post"]})
        check("editar cliente", 403, "PATCH", f"/api/clientes/{cliente['id']}",
              {"nombre": cliente["nombre"]})
        check("borrar cliente", 403, "DELETE", f"/api/clientes/{cliente['id']}")

        print("\nRol Editor — lo que SÍ puede:")
        st, raw = app_call(opener, "POST", "/api/publicaciones", {
            "cliente_id": cliente["id"],
            "fecha_publicacion": "2026-12-15T09:00:00",
            "formato": "post",
            "copywriting": "ZZ editor temporal",
        })
        pub_id = None
        try:
            pub_id = (json.loads(raw) or {}).get("id")
        except Exception:
            pass
        if st in (200, 201) and pub_id:
            print(f"  [OK ] crear publicación de un cliente: {st}")
            creados["publicacion"] = pub_id
            check("borrar publicación", 200, "DELETE", f"/api/publicaciones/{pub_id}")
            creados["publicacion"] = None
        else:
            print(f"  [FALLO] crear publicación: {st} — {raw[:160]}")
            fallos.append(f"crear publicación: {st}")

        # Página de usuarios → redirect al dashboard (no la puede ver).
        # Login con opener normal (sigue el 303 del login), luego un opener
        # que NO sigue redirects para capturar el 302 de la página.
        jar = http.cookiejar.CookieJar()
        login_opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar),
        )
        form = urllib.parse.urlencode({"email": EMAIL, "password": PASSWORD}).encode()
        req = urllib.request.Request(APP + "/api/auth/login", data=form, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        login_opener.open(req, timeout=30).read()

        page_opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar),
            NoRedirect(),
        )
        st, _ = app_call(page_opener, "GET", "/dashboard/usuarios")
        ok = st in (301, 302, 303, 307)
        print(f"  [{'OK ' if ok else 'FALLO'}] GET /dashboard/usuarios redirige: {st}")
        if not ok:
            fallos.append(f"/dashboard/usuarios: {st} (esperado redirect)")
    finally:
        print("\nLimpieza…")
        if creados["publicacion"]:
            st, _ = admin(f"/items/publicaciones/{creados['publicacion']}", "DELETE")
            print(f"  publicación borrada: {st}")
        if creados["usuario"]:
            st, _ = admin(f"/users/{creados['usuario']}", "DELETE")
            print(f"  usuario borrado: {st}")
        admin("/utils/cache/clear", "POST", {"system": True})

    if fallos:
        print("\nFALLOS:")
        for f in fallos:
            print("  -", f)
        sys.exit(1)
    print("\nTodos los checks OK ✓")


if __name__ == "__main__":
    main()
