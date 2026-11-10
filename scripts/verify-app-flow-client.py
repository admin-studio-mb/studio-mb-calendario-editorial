#!/usr/bin/env python3
"""Simula el flujo REAL de la app (calendar.studiomb.es) con un usuario cliente:

1. El endpoint /api/comentarios hace GET /items/publicaciones/:id con el JWT del
   usuario. Si la publicación es de otro cliente → 403 → el endpoint debe
   responder 404 y NO crear el comentario.
2. Verifica que la expansión `usuario_id.first_name` funciona con los
   permisos de cliente (si no, los comentarios saldrían sin autor).
3. Verifica el ciclo completo: listar → crear → listar de nuevo.
"""
import json
import os
import secrets
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


ADMIN = read_token()
TMP_PASSWORD = os.environ.get("E2E_TEMP_PASSWORD") or secrets.token_urlsafe(18)


def api(path, method="GET", body=None, token=None, query=None):
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


st, roles = api("/roles")
role_id = next(r["id"] for r in roles["data"] if r["name"] == "Cliente")

st, c = api("/items/clientes", method="POST",
            body={"nombre": "ZZ-FlowA", "tipos_contenido_disponibles": ["P"]})
cid_a = c["data"]["id"]
st, c2 = api("/items/clientes", method="POST",
             body={"nombre": "ZZ-FlowB", "tipos_contenido_disponibles": ["P"]})
cid_b = c2["data"]["id"]
st, pa = api("/items/publicaciones", method="POST", body={
    "cliente_id": cid_a, "formato": "post", "estado": "revision",
    "tipo_contenido": "FlowA", "fecha_publicacion": "2026-12-01T09:00:00",
    "copywriting": "contenido A", "hashtags": ["#a"], "imagenes_fondo": []})
pid_a = pa["data"]["id"]
st, pb = api("/items/publicaciones", method="POST", body={
    "cliente_id": cid_b, "formato": "post", "estado": "revision",
    "tipo_contenido": "FlowB", "fecha_publicacion": "2026-12-02T09:00:00",
    "copywriting": "contenido B", "hashtags": ["#b"], "imagenes_fondo": []})
pid_b = pb["data"]["id"]

email = f"flow-{int(time.time())}@studiomb.es"
st, u = api("/users", method="POST", body={
    "email": email, "password": TMP_PASSWORD, "first_name": "Flow",
    "last_name": "Cliente", "role": role_id, "cliente_id": cid_a})
uid = u["data"]["id"]
st, login = api("/auth/login", method="POST",
                body={"email": email, "password": TMP_PASSWORD, "mode": "json"})
jwt = login["data"]["access_token"]

print("== 1. El endpoint de la app: GET publicación con el JWT del usuario ==")
for etiqueta, pid in (("PROPIA", pid_a), ("AJENA", pid_b)):
    st, r = api(f"/items/publicaciones/{pid}", query={"fields": "id,cliente_id"}, token=jwt)
    print(f"   GET publicación {etiqueta:<7} → http {st}  "
          f"{'legible' if st == 200 else 'BLOQUEADA (el endpoint devolverá 404 y no creará el comentario)'}")
    if st == 200:
        print(f"      cliente_id={r.get('data', {}).get('cliente_id')}")

print()
print("== 2. Expansión de usuario_id con permisos de cliente ==")
st, com = api("/items/comentarios", method="POST", body={
    "publicacion_id": pid_a, "cliente_id": cid_a, "usuario_id": uid,
    "texto": "Comentario de prueba"}, token=jwt)
print(f"   POST comentario propio → http {st}")
cid_com = com.get("data", {}).get("id") if isinstance(com, dict) else None

FIELDS = "id,publicacion_id,cliente_id,texto,fecha_creacion,usuario_id.id,usuario_id.first_name,usuario_id.last_name,usuario_id.email"
st, lista = api("/items/comentarios", query={
    "filter": json.dumps({"publicacion_id": {"_eq": pid_a}}),
    "sort": "fecha_creacion", "limit": 200, "fields": FIELDS}, token=jwt)
print(f"   GET comentarios con expansión → http {st}")
if st == 200 and lista.get("data"):
    c0 = lista["data"][0]
    uid_val = c0.get("usuario_id")
    print(f"      usuario_id = {json.dumps(uid_val, ensure_ascii=False)}")
    tiene_nombre = isinstance(uid_val, dict) and bool(uid_val.get("first_name"))
    print(f"      {'✓' if tiene_nombre else '✗'} trae el nombre del autor (si no, saldría Anónimo)")
else:
    print(f"      {json.dumps(lista, ensure_ascii=False)[:250]}")

print()
print("== 3. Ciclo completo: listar → crear → listar ==")
st, antes = api("/items/comentarios", query={
    "filter": json.dumps({"publicacion_id": {"_eq": pid_a}}), "limit": 200,
    "t": int(time.time() * 1000)}, token=jwt)
n_antes = len(antes.get("data", [])) if st == 200 else -1
st, nuevo = api("/items/comentarios", method="POST", body={
    "publicacion_id": pid_a, "cliente_id": cid_a, "usuario_id": uid,
    "texto": "Segundo comentario"}, token=jwt)
st, despues = api("/items/comentarios", query={
    "filter": json.dumps({"publicacion_id": {"_eq": pid_a}}), "limit": 200,
    "t": int(time.time() * 1000)}, token=jwt)
n_despues = len(despues.get("data", [])) if st == 200 else -1
print(f"   antes={n_antes}  POST→{st}  después={n_despues}  "
      f"{'✓' if n_despues == n_antes + 1 else '✗'} el comentario aparece en el hilo")

print()
print("== 4. El cliente NO ve los comentarios del otro cliente ==")
st, ajenos = api("/items/comentarios", query={"limit": -1, "fields": "id,publicacion_id"}, token=jwt)
rows = ajenos.get("data", []) if st == 200 else []
vistos = [r["id"][:8] for r in rows]
print(f"   comentarios visibles: {vistos}")
print(f"   {'✓' if not any(r.get('publicacion_id') == pid_b for r in rows) else '✗'} "
      f"ninguno pertenece al cliente ajeno")

print()
print("== limpieza ==")
st, allc = api("/items/comentarios", query={"limit": -1, "fields": "id,texto"})
for row in allc.get("data", []):
    if str(row.get("texto", "")).startswith(("Comentario de prueba", "Segundo comentario")):
        api(f"/items/comentarios/{row['id']}", method="DELETE")
api(f"/items/publicaciones/{pid_a}", method="DELETE")
api(f"/items/publicaciones/{pid_b}", method="DELETE")
api(f"/items/clientes/{cid_a}", method="DELETE")
api(f"/items/clientes/{cid_b}", method="DELETE")
api(f"/users/{uid}", method="DELETE")
print("  ok")
