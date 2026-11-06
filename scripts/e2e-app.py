#!/usr/bin/env python3
"""Prueba END-TO-END contra la app local (Astro preview) en :4399.

Login real → sesión con cookie → crear cliente → crear publicación →
comentar → editar comentario → borrar → comprobar que todo se ve.

Usa el usuario admin@studiomb.es. La contraseña se lee de una variable de
entorno (DIRECTUS_ADMIN_PASS) para no dejarla escrita en el repo.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

APP = os.environ.get("APP_URL", "http://127.0.0.1:4399")
EMAIL = os.environ.get("DIRECTUS_EMAIL", "admin@studiomb.es")
PASSWORD = os.environ.get("DIRECTUS_ADMIN_PASS")
COOKIE = None
CREATED = {"clientes": [], "publicaciones": [], "comentarios": []}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """No sigue los redirects: queremos ver el 303 y su Set-Cookie."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def req(path, method="GET", body=None, form=None, headers=None):
    global COOKIE
    url = APP + path
    data = None
    hdrs = dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        hdrs["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in hdrs.items():
        r.add_header(k, v)
    if COOKIE:
        r.add_header("Cookie", COOKIE)
    try:
        with OPENER.open(r, timeout=30) as resp:
            sc = resp.headers.get("Set-Cookie")
            if sc and "studio_mb_session=" in sc:
                COOKIE = sc.split(";")[0]
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw), dict(resp.headers)
            except json.JSONDecodeError:
                return resp.status, raw, dict(resp.headers)
    except urllib.error.HTTPError as e:
        sc = e.headers.get("Set-Cookie")
        if sc and "studio_mb_session=" in sc:
            COOKIE = sc.split(";")[0]
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw), dict(e.headers)
        except json.JSONDecodeError:
            return e.code, raw, dict(e.headers)


if not PASSWORD:
    print("Falta DIRECTUS_ADMIN_PASS")
    sys.exit(2)

print("== 1. Login ==")
st, body, h = req("/api/auth/login", method="POST",
                  form={"email": EMAIL, "password": PASSWORD, "next": "/dashboard"})
# urllib sigue el 303 automáticamente, así que we'll 200 con el HTML del dashboard.
print(f"   POST /api/auth/login → {st}")
if not COOKIE:
    print("   ✗ no se emitió cookie de sesión")
    print(f"   {str(body)[:300]}")
    sys.exit(1)
print(f"   ✓ cookie emitida: {'sí' if COOKIE else 'no'}")

print()
print("== 2. Dashboard con sesión ==")
st, body, h = req("/dashboard")
print(f"   GET /dashboard → {st}")
if st != 200:
    print(str(body)[:400])
    sys.exit(1)
html = body if isinstance(body, str) else str(body)
for marcador in ("Calendario editorial", "Nueva publicación", "Comentarios", "Mockup de feed"):
    print(f"   {'✓' if marcador.lower() in html.lower() else '✗'} contiene «{marcador}»")

print()
print("== 3. Crear cliente (el caso que fallaba con 'fetch error') ==")
st, cli, h = req("/api/clientes", method="POST", body={
    "nombre": f"ZZ-E2E-{int(time.time())}",
    "tipos_contenido_disponibles": ["Promo", "Noticia"],
})
print(f"   POST /api/clientes → {st}")
if st != 201:
    print(f"   {json.dumps(cli, ensure_ascii=False)[:400]}")
    sys.exit(1)
cliente_id = cli["id"]
CREATED["clientes"].append(cliente_id)
print(f"   cliente creado: {cliente_id[:8]} «{cli['nombre']}»")

print()
print("== 4. Crear publicación ==")
st, pub, h = req("/api/publicaciones", method="POST", body={
    "cliente_id": cliente_id, "tipo_contenido": "Promo", "formato": "post",
    "estado": "borrador", "copywriting": "Copy de prueba E2E",
    "hashtags": ["#e2e"], "textos_slides": "", "imagenes_fondo": [],
    "fecha_publicacion": "2026-12-24T09:00:00",
})
print(f"   POST /api/publicaciones → {st}")
if st != 201:
    print(f"   {json.dumps(pub, ensure_ascii=False)[:400]}")
    sys.exit(1)
pub_id = pub["id"]
CREATED["publicaciones"].append(pub_id)
print(f"   publicación: {pub_id[:8]} fecha={pub.get('fecha_publicacion')!r}")
print(f"   {'✓' if pub.get('fecha_publicacion') == '2026-12-24T09:00:00' else '✗'} "
      f"la hora se guardó tal cual (sin desfase de zona horaria)")

print()
print("== 5. Comentar ==")
st, com, h = req("/api/comentarios", method="POST",
                  body={"publicacion_id": pub_id, "texto": "Comentario E2E"})
print(f"   POST /api/comentarios → {st}")
if st != 201:
    print(f"   {json.dumps(com, ensure_ascii=False)[:400]}")
    sys.exit(1)
com_id = com["id"]
CREATED["comentarios"].append(com_id)
print(f"   comentario: {com_id[:8]} cliente_id={com.get('cliente_id')}")

print()
print("== 6. El hilo muestra el comentario recién creado (cache de Directus) ==")
st, lista, h = req(f"/api/comentarios?publicacion_id={pub_id}")
print(f"   GET /api/comentarios → {st}, total {len(lista) if isinstance(lista, list) else '?'}")
vistos = [c.get("texto") for c in lista] if isinstance(lista, list) else []
print(f"   {'✓' if 'Comentario E2E' in vistos else '✗'} el comentario aparece (sin esperar a que expire la caché)")
print(f"   {vistos}")

print()
print("== 7. Editar comentario ==")
st, ed, h = req(f"/api/comentarios/{com_id}", method="PATCH",
                body={"texto": "Comentario E2E editado"})
print(f"   PATCH → {st}")
st, lista2, h = req(f"/api/comentarios?publicacion_id={pub_id}")
vistos2 = [c.get("texto") for c in lista2] if isinstance(lista2, list) else []
print(f"   {'✓' if 'Comentario E2E editado' in vistos2 else '✗'} refleja la edición: {vistos2}")

print()
print("== 8. Mover la publicación (drag & drop) ==")
st, mv, h = req(f"/api/publicaciones/{pub_id}", method="PATCH",
                body={"fecha_publicacion": "2026-12-25T18:30:00"})
print(f"   PATCH fecha → {st}, guardado={mv.get('fecha_publicacion') if isinstance(mv, dict) else mv!r}")
print(f"   {'✓' if isinstance(mv, dict) and mv.get('fecha_publicacion') == '2026-12-25T18:30:00' else '✗'} "
      f"la fecha se guardó sin desfase")

print()
print("== 9. Cambiar estado por el flujo editorial ==")
for estado in ("revision", "en_diseno", "revision_diseno", "aprobado", "publicado"):
    st, r, h = req(f"/api/publicaciones/{pub_id}", method="PATCH", body={"estado": estado})
    ok = st == 200 and isinstance(r, dict) and r.get("estado") == estado
    print(f"   → {estado:<16} http {st}  {'✓' if ok else '✗'}")

print()
print("== 10. Listados SSR ==")
for ruta in ("/dashboard", "/dashboard/clientes"):
    st, body, h = req(ruta)
    ok = st == 200
    print(f"   GET {ruta:<22} → {st}  {'✓' if ok else '✗'}")
    if ok and isinstance(body, str):
        tiene = "Cafetería" in body or "ZZ-E2E" in body
        print(f"      contiene datos de clientes: {'sí' if tiene else 'no'}")

print()
print("== 11. Borrar (limpieza) ==")
st, r, h = req(f"/api/comentarios/{com_id}", method="DELETE")
print(f"   DELETE comentario → {st}")
st, r, h = req(f"/api/publicaciones/{pub_id}", method="DELETE")
print(f"   DELETE publicación → {st}")
st, r, h = req(f"/api/clientes/{cliente_id}", method="DELETE")
print(f"   DELETE cliente → {st}")
st, lista3, h = req(f"/api/comentarios?publicacion_id={pub_id}")
print(f"   GET comentarios tras borrar → {st}, total {len(lista3) if isinstance(lista3, list) else '?'}")
print(f"   {'✓' if not lista3 else '✗'} el hilo queda vacío")

print()
print("== 12. Logout ==")
st, r, h = req("/api/auth/logout", method="POST")
print(f"   POST /api/auth/logout → {st}")
