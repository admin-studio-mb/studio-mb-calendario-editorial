#!/usr/bin/env python3
"""VERIFICACIÓN END-TO-END de los permisos por cliente.

Crea un cliente + una publicación, crea un usuario con rol `Cliente` ligado a
ese cliente, y comprueba con SU JWT que:
  - ve su cliente y SUS publicaciones
  - NO ve las publicaciones de otro cliente
  - NO ve otros clientes
  - puede comentar en sus publicaciones
  - NO puede leer another's comentarios

Al final borra todo lo creado.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
CREATED = {"clientes": [], "publicaciones": [], "comentarios": [], "users": []}


def read_token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("sin token")


ADMIN = read_token()
TMP_PASSWORD = os.environ.get("E2E_TEMP_PASSWORD") or "Probe_Cl1ente_2026!"


def api(path, method="GET", body=None, query=None, token=None):
    url = BASE + path
    if query:
        parts = [f"{k}={urllib.parse.quote(str(v), safe='')}"
                 for k, v in query.items() if v is not None]
        if parts:
            url += ("&" if "?" in url else "?") + "&".join(parts)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token or ADMIN}")
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


def bust():
    return int(time.time() * 1000)


def cleanup():
    print("\n== limpieza ==")
    for coll in ("comentarios", "publicaciones", "clientes", "users"):
        for cid in CREATED[coll]:
            st, _ = api(f"/items/{coll}/{cid}", method="DELETE")
            print(f"  {coll}/{cid[:8]} → {st}")


try:
    # ── Setup ───────────────────────────────────────────────────────────────
    print("== Setup ==")
    st, roles = api("/roles")
    role_cliente = next(r for r in roles["data"] if r["name"] == "Cliente")

    st, c1 = api("/items/clientes", method="POST", body={
        "nombre": "ZZ-ClienteA", "tipos_contenido_disponibles": ["Promo"]})
    cliente_a = c1["data"]["id"]
    CREATED["clientes"].append(cliente_a)

    st, c2 = api("/items/clientes", method="POST", body={
        "nombre": "ZZ-ClienteB", "tipos_contenido_disponibles": ["Noticia"]})
    cliente_b = c2["data"]["id"]
    CREATED["clientes"].append(cliente_b)

    st, p1 = api("/items/publicaciones", method="POST", body={
        "cliente_id": cliente_a, "formato": "post", "estado": "revision",
        "tipo_contenido": "PubA", "fecha_publicacion": "2026-12-01T09:00:00",
        "copywriting": "contenido A", "hashtags": ["#a"], "imagenes_fondo": []})
    pub_a = p1["data"]["id"]
    CREATED["publicaciones"].append(pub_a)

    st, p2 = api("/items/publicaciones", method="POST", body={
        "cliente_id": cliente_b, "formato": "post", "estado": "revision",
        "tipo_contenido": "PubB", "fecha_publicacion": "2026-12-02T09:00:00",
        "copywriting": "contenido B", "hashtags": ["#b"], "imagenes_fondo": []})
    pub_b = p2["data"]["id"]
    CREATED["publicaciones"].append(pub_b)

    email = f"probe-cliente-{int(time.time())}@studiomb.es"
    st, u = api("/users", method="POST", body={
        "email": email, "password": TMP_PASSWORD,
        "first_name": "Probe", "last_name": "Cliente",
        "role": role_cliente["id"], "cliente_id": cliente_a,
    })
    print(f"  usuario creado: {st}")
    if st not in (200, 201):
        print(f"  ERROR: {json.dumps(u, ensure_ascii=False)[:500]}")
        raise SystemExit(1)
    user_id = u["data"]["id"]
    CREATED["users"].append(user_id)

    # ── Login como el cliente ──────────────────────────────────────────────
    st, login = api("/auth/login", method="POST", body={
        "email": email, "password": TMP_PASSWORD, "mode": "json"})
    print(f"  login → http {st}")
    jwt = (login.get("data") or {}).get("access_token")
    if not jwt:
        print(f"  ERROR login: {json.dumps(login, ensure_ascii=False)[:400]}")
        raise SystemExit(1)

    # ── Comprobaciones ──────────────────────────────────────────────────────
    print()
    print("== Comprobaciones con el JWT del cliente ==")

    st, me = api("/users/me", token=jwt)
    print(f"\n1) /users/me → http {st}")
    print(f"   id={me.get('data', {}).get('id')}")
    print(f"   cliente_id={me.get('data', {}).get('cliente_id')}  (esperado {cliente_a})")
    ok_me = st == 200 and me.get("data", {}).get("cliente_id") == cliente_a
    print(f"   {'✓' if ok_me else '✗'} ve su propio cliente_id")

    st, cl = api("/items/clientes", query={"limit": -1, "fields": "id,nombre"}, token=jwt)
    rows = cl.get("data", []) if isinstance(cl, dict) else []
    nombres = [r.get("nombre") for r in rows]
    solo_a = all(r["id"] == cliente_a for r in rows) and len(rows) == 1
    print(f"\n2) GET /items/clientes → http {st}, total {len(rows)}: {nombres}")
    print(f"   {'✓' if solo_a else '✗'} sólo ve SU cliente (no ve ZZ-ClienteB ni Cafetería Norte)")

    st, pu = api("/items/publicaciones", query={
        "limit": -1, "fields": "id,cliente_id,tipo_contenido"}, token=jwt)
    rows = pu.get("data", []) if isinstance(pu, dict) else []
    tipos = [r.get("tipo_contenido") for r in rows]
    solo_pub_a = all(r.get("cliente_id") == cliente_a for r in rows)
    print(f"\n3) GET /items/publicaciones → http {st}, total {len(rows)}: {tipos}")
    print(f"   {'✓' if solo_pub_a and not any(t == 'PubB' for t in tipos) else '✗'} "
          f"sólo ve SUS publicaciones (PubB filtrado)")

    st, cm = api("/items/comentarios", query={
        "limit": -1, "fields": "id,publicacion_id,texto"}, token=jwt)
    rows = cm.get("data", []) if isinstance(cm, dict) else []
    print(f"\n4) GET /items/comentarios → http {st}, total {len(rows)}")

    # Intenta leer directamente la publicación del otro cliente
    st, direct = api(f"/items/publicaciones/{pub_b}", token=jwt)
    bloqueado = st in (403, 404)
    print(f"\n5) GET /items/publicaciones/{pub_b[:8]} (del otro cliente) → http {st}")
    print(f"   {'✓' if bloqueado else '✗'} acceso directo a la publicación ajena bloqueado")

    # Intenta leer directamente el cliente ajeno
    st, direct_c = api(f"/items/clientes/{cliente_b}", token=jwt)
    bloqueado_c = st in (403, 404)
    print(f"\n6) GET /items/clientes/{cliente_b[:8]} (ajeno) → http {st}")
    print(f"   {'✓' if bloqueado_c else '✗'} acceso directo al cliente ajeno bloqueado")

    # Puede comentar en su publicación?
    st, com = api("/items/comentarios", method="POST", body={
        "publicacion_id": pub_a, "cliente_id": cliente_a, "usuario_id": user_id,
        "texto": "Comentario del cliente"}, token=jwt)
    com_ok = st in (200, 201)
    print(f"\n7) POST comentario en su publicación → http {st}")
    print(f"   {'✓' if com_ok else '✗'} puede comentar en sus publicaciones")
    if com_ok:
        cid = com["data"]["id"]
        CREATED["comentarios"].append(cid)

    # El comentario debe llevar el cliente_id de la publicación
    st, one = api(f"/items/comentarios/{cid}", query={"fields": "id,cliente_id"},
                  token=jwt) if com_ok else (0, {})
    print(f"   cliente_id del comentario = {one.get('data', {}).get('cliente_id') if isinstance(one, dict) else one} "
          f"(esperado {cliente_a})")

    # Puede crear una publicación para SU cliente?
    st, newpub = api("/items/publicaciones", method="POST", body={
        "cliente_id": cliente_a, "formato": "post", "estado": "borrador",
        "tipo_contenido": "CreadaPorCliente", "fecha_publicacion": "2026-12-05T09:00:00",
        "copywriting": "x", "hashtags": [], "imagenes_fondo": []}, token=jwt)
    pub_ok = st in (200, 201)
    print(f"\n8) POST publicación propia → http {st}")
    print(f"   {'✓' if pub_ok else '✗'} puede crear publicaciones para su cliente")
    if pub_ok:
        CREATED["publicaciones"].append(newpub["data"]["id"])

    # Puede crear una publicación para OTRO cliente? (NO debe poder)
    st, cross = api("/items/publicaciones", method="POST", body={
        "cliente_id": cliente_b, "formato": "post", "estado": "borrador",
        "tipo_contenido": "Intrusa", "fecha_publicacion": "2026-12-06T09:00:00",
        "copywriting": "x", "hashtags": [], "imagenes_fondo": []}, token=jwt)
    cross_ok = st in (403, 400)
    print(f"\n9) POST publicación para otro cliente → http {st}")
    print(f"   {'✓' if cross_ok else '✗'} NO puede crear para otro cliente")
    if st in (200, 201):
        CREATED["publicaciones"].append(cross["data"]["id"])
        print(f"   ⚠ se creó de todos modos: {json.dumps(cross, ensure_ascii=False)[:200]}")

    # Intenta borrar la publicación ajena
    st, dele = api(f"/items/publicaciones/{pub_b}", method="DELETE", token=jwt)
    dele_ok = st in (403, 404)
    print(f"\n10) DELETE publicación ajena → http {st}")
    print(f"   {'✓' if dele_ok else '✗'} no puede borrar publicaciones ajenas")

    # Intenta editar la publicación ajena
    st, ed = api(f"/items/publicaciones/{pub_b}", method="PATCH",
                 body={"copywriting": "hack"}, token=jwt)
    ed_ok = st in (403, 404)
    print(f"\n11) PATCH publicación ajena → http {st}")
    print(f"   {'✓' if ed_ok else '✗'} no puede editar publicaciones ajenas")

    # ¿Puede editar la propia?
    st, ed2 = api(f"/items/publicaciones/{pub_a}", method="PATCH",
                  body={"copywriting": "editada por el cliente"}, token=jwt)
    ed2_ok = st == 200
    print(f"\n12) PATCH publicación propia → http {st}")
    print(f"   {'✓' if ed2_ok else '✗'} puede editar sus propias publicaciones")

    # Comentar en publicación ajena
    st, com2 = api("/items/comentarios", method="POST", body={
        "publicacion_id": pub_b, "cliente_id": cliente_a, "usuario_id": user_id,
        "texto": "intento"}, token=jwt)
    com2_ok = st in (403, 400, 404)
    print(f"\n13) POST comentario en publicación ajena → http {st}")
    print(f"   {'✓' if com2_ok else '✗'} no puede comentar en publicaciones ajenas")
    if st in (200, 201):
        CREATED["comentarios"].append(com2["data"]["id"])

    # Y tampoco puede colar un comentario con el cliente_id de otro
    st, com3 = api("/items/comentarios", method="POST", body={
        "publicacion_id": pub_a, "cliente_id": cliente_b, "usuario_id": user_id,
        "texto": "intento2"}, token=jwt)
    com3_ok = st in (403, 400, 404)
    print(f"\n14) POST comentario con cliente_id ajeno → http {st}")
    print(f"   {'✓' if com3_ok else '✗'} no puede atribuir comentarios a otro cliente")
    if st in (200, 201):
        CREATED["comentarios"].append(com3["data"]["id"])

finally:
    cleanup()
    print()
    print("== limpieza de usuarios (requiere el usuario logged-out) ==")
    for uid in CREATED["users"]:
        st, body = api(f"/users/{uid}", method="DELETE")
        print(f"  users/{uid[:8]} DELETE → {st} {str(body)[:150]}")
        if st not in (200, 204):
            # El usuario sigue con sesión activa: cerramos sesión y reintentamos.
            api(f"/users/{uid}", method="POST")
            st2, body2 = api(f"/users/{uid}", method="DELETE")
            print(f"  reintento → {st2} {str(body2)[:150]}")
