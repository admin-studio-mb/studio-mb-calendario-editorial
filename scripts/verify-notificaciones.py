#!/usr/bin/env python3
"""E2E de notificaciones: comentario → notificación al equipo; confirmación →
notificación al equipo; campanita (GET) y marcar leídas (POST).

Crea datos temporales (cliente, usuario Cliente, usuario Editor y publicación)
y limpia todo al final. Sin SMTP configurado, los emails se omiten (se ve en
el log del dev server) pero las filas de `notificaciones` sí se crean.
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
CLI_EMAIL = "zz-e2e-notif-cli@studiomb.es"
EDI_EMAIL = "zz-e2e-notif-edi@studiomb.es"
PASSWORD = secrets.token_urlsafe(18)


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
    if data is not None:
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


def login(email):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    form = urllib.parse.urlencode({"email": email, "password": PASSWORD}).encode()
    req = urllib.request.Request(APP + "/api/auth/login", data=form, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with opener.open(req, timeout=30) as r:
        r.read()
    if not {c.name for c in jar}:
        raise SystemExit(f"login de {email} falló")
    return opener


def app_call(opener, method, path, body=None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(APP + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=30) as r:
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


def borrar_comentarios_de(uid):
    """Borra los comentarios de un usuario (si no, la FK creado_por impide
    borrar el usuario: AGENTS.md §6.11)."""
    st, r = admin(f"/items/comentarios?filter[usuario_id][_eq]={uid}&fields=id&limit=-1")
    if st == 200 and isinstance(r, dict):
        for c in r.get("data", []):
            admin(f"/items/comentarios/{c['id']}", "DELETE")


def desvincular_usuario(uid):
    """Nulla creado_por/actualizado_por del usuario en publicaciones y
    comentarios, para que la FK no bloquee el borrado (§6.11)."""
    for coll in ("publicaciones", "comentarios"):
        for field in ("creado_por", "actualizado_por"):
            admin(f"/items/{coll}", "PATCH", {
                "data": {field: None},
                "query": {"filter": {field: {"_eq": uid}}},
            })


def borrar_usuario_si_existe(email):
    st, r = admin(f"/users?filter[email][_eq]={urllib.parse.quote(email)}&fields=id&limit=-1")
    if st == 200 and isinstance(r, dict):
        for u in r.get("data", []):
            borrar_comentarios_de(u["id"])
            desvincular_usuario(u["id"])
            # Notificaciones del usuario (por si la FK no cascadea).
            stn, rn = admin(f"/items/notificaciones?filter[usuario][_eq]={u['id']}&fields=id&limit=-1")
            if stn == 200 and isinstance(rn, dict):
                for n in rn.get("data", []):
                    admin(f"/items/notificaciones/{n['id']}", "DELETE")
            st2, _ = admin(f"/users/{u['id']}", "DELETE")
            print(f"  usuario previo {email} borrado: {st2}")


def main():
    creados = {"pub": None, "cli_user": None, "edi_user": None, "cliente": None}
    fallos = []

    def check(nombre, cond, extra=""):
        print(f"  [{'OK ' if cond else 'FALLO'}] {nombre}" + (f" — {extra}" if extra and not cond else ""))
        if not cond:
            fallos.append(nombre)

    # Restos de ejecuciones anteriores (si las hubo).
    borrar_usuario_si_existe(CLI_EMAIL)
    borrar_usuario_si_existe(EDI_EMAIL)

    try:
        st, roles = admin("/roles?fields=id,name&limit=-1")
        roles = {r["name"]: r["id"] for r in roles.get("data", [])}

        st, r = admin("/items/clientes", "POST", {"nombre": "ZZ E2E Notif"})
        creados["cliente"] = r["data"]["id"]
        cid = creados["cliente"]

        st, r = admin("/users", "POST", {
            "email": CLI_EMAIL, "password": PASSWORD, "role": roles["Cliente"],
            "cliente_id": cid, "first_name": "ZZ", "last_name": "Cliente", "status": "active",
        })
        creados["cli_user"] = r["data"]["id"]

        st, r = admin("/users", "POST", {
            "email": EDI_EMAIL, "password": PASSWORD, "role": roles["Editor"],
            "first_name": "ZZ", "last_name": "Editor", "status": "active",
        })
        creados["edi_user"] = r["data"]["id"]

        st, r = admin("/items/publicaciones", "POST", {
            "cliente_id": cid, "fecha_publicacion": "2026-12-20T09:00:00",
            "estado": "revision", "formato": "post", "copywriting": "ZZ notif",
        })
        creados["pub"] = r["data"]["id"]
        pub_id = creados["pub"]
        print(f"pub temporal: {pub_id}\n")

        edi = login(EDI_EMAIL)
        cli = login(CLI_EMAIL)

        # 1) Editor comenta → el cliente recibe notificación.
        st, _ = app_call(edi, "POST", "/api/comentarios",
                         {"publicacion_id": pub_id, "texto": "Comentario ZZ del editor"})
        check("editor comenta (201)", st == 201, str(st))

        st, data = app_call(cli, "GET", "/api/notificaciones")
        items = data.get("items", []) if isinstance(data, dict) else []
        check("cliente recibe notificación de comentario", st == 200 and len(items) >= 1,
              f"{st} items={len(items)}")
        if items:
            check("tipo=comentario", items[0].get("tipo") == "comentario", str(items[0].get("tipo")))

        # 2) Cliente confirma → el equipo recibe notificación.
        st, _ = app_call(cli, "PATCH", f"/api/publicaciones/{pub_id}", {"estado": "en_diseno"})
        check("cliente confirma (200)", st == 200, str(st))

        st, data = app_call(edi, "GET", "/api/notificaciones")
        items = data.get("items", []) if isinstance(data, dict) else []
        check("equipo recibe notificación de confirmación", st == 200 and len(items) >= 1,
              f"{st} items={len(items)}")

        # 3) Marcar leídas (todas) → desaparecen.
        st, _ = app_call(cli, "POST", "/api/notificaciones", {"all": True})
        check("marcar todas (200)", st == 200, str(st))
        st, data = app_call(cli, "GET", "/api/notificaciones")
        rest = len(data.get("items", [])) if isinstance(data, dict) else -1
        check("cliente sin pendientes tras marcar", st == 200 and rest == 0, f"{st} rest={rest}")

        # 4) La notificación del cliente quedó marcada como leída en BD.
        st, r = admin(f"/items/notificaciones?filter[usuario][_eq]={creados['cli_user']}&fields=leida")
        rows = r.get("data", []) if st == 200 else []
        check("filas leida=true en BD", rows and all(x.get("leida") for x in rows), str(rows))
    finally:
        print("\nLimpieza…")
        if creados["pub"]:
            admin(f"/items/publicaciones/{creados['pub']}", "DELETE")
            print("  publicación borrada")
        for key in ("cli_user", "edi_user"):
            if creados[key]:
                borrar_comentarios_de(creados[key])
                desvincular_usuario(creados[key])
                st, _ = admin(f"/users/{creados[key]}", "DELETE")
                print(f"  usuario {key} borrado: {st}")
        if creados["cliente"]:
            admin(f"/items/clientes/{creados['cliente']}", "DELETE")
            print("  cliente borrado")
        admin("/utils/cache/clear", "POST", {"system": True})

    if fallos:
        print("\nFALLOS:", fallos)
        sys.exit(1)
    print("\nTodos los checks OK ✓")


if __name__ == "__main__":
    main()
