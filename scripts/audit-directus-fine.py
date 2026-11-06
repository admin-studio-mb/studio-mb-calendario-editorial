#!/usr/bin/env python3
"""Verificaciones finas: choices exactos, relaciones reales, permisos y orphans."""
import json
import os
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


print("== 1. CHOICES exactos (texto -> valor) ==")
st, snap = api("/schema/snapshot")
for f in snap.get("data", {}).get("fields", []):
    if f.get("collection") in ("publicaciones", "clientes") and f.get("field") in ("estado", "formato", "tipos_contenido_disponibles"):
        meta = f.get("meta") or {}
        opts = meta.get("options") or {}
        print(f"  {f['collection']}.{f['field']}  interface={meta.get('interface')}")
        print(f"     choices_raw={json.dumps(opts.get('choices'), ensure_ascii=False)}")
        print(f"     display=json:{opts.get('display')}, display_value={opts.get('display_value')}, display_template={opts.get('display_template')}")

print()
print("== 2. TODAS las relaciones de comentarios/publicaciones/clientes ==")
st, rels = api("/relations")
for r in rels.get("data", []):
    if r.get("collection") in ("clientes", "publicaciones", "comentarios"):
        print(f"  {r.get('collection')}.{r.get('field')}  related={r.get('related_collection')}"
              f".{r.get('related_field')}  on_delete={r.get('schema', {}).get('on_delete')}"
              f"  meta.one_field={r.get('meta', {}).get('one_field')}")

print()
print("== 3. Constraints en BD via /items? (indirecto) ==")
# Intentamos borrar un comentario de prueba inexistente: si hay FK, error distinto.
# Mejor: comprobamos orphans reales en comentarios.
st, coms = api("/items/comentarios", query={"limit": -1, "fields": "id,publicacion_id,usuario_id"})
st2, pubs = api("/items/publicaciones", query={"limit": -1, "fields": "id"})
st3, users = api("/directus_users", query={"limit": -1, "fields": "id"})
pub_ids = {p["id"] for p in pubs.get("data", [])}
user_ids = {u["id"] for u in users.get("data", [])}
orphan_pub = [c["id"] for c in coms.get("data", []) if c.get("publicacion_id") not in pub_ids]
orphan_user = [c["id"] for c in coms.get("data", []) if c.get("usuario_id") and c["usuario_id"] not in user_ids]
print(f"  comentarios totales={len(coms.get('data', []))}  huérfanos por publicacion={orphan_pub}  huérfanos por usuario={orphan_user}")

print()
print("== 4. PERMISOS completos (todas las colecciones) ==")
st, perms = api("/permissions")
for p in perms.get("data", []):
    print(f"  {str(p.get('collection')):<20} action={str(p.get('action')):<8} "
          f"role={p.get('role')} policy={p.get('policy')} "
          f"fields={p.get('fields')} permissions={p.get('permissions')}")

print()
print("== 5. Fields de comentarios: relaciones declaradas ==")
for f in snap.get("data", {}).get("fields", []):
    if f.get("collection") == "comentarios" and f.get("field") in ("publicacion_id", "usuario_id"):
        sch = f.get("schema") or {}
        meta = f.get("meta") or {}
        print(f"  {f['field']}: type={f.get('type')} fk_table={sch.get('foreign_key_table')} "
              f"fk_col={sch.get('foreign_key_column')} special={meta.get('special')} "
              f"interface={meta.get('interface')}")

print()
print("== 6. Intento de escritura: estado nuevo 'en_diseno' (dry) ==")
st, body = api("/items/publicaciones", method="PATCH",
                body={"id": "00000000-0000-0000-0000-000000000000", "estado": "en_diseno"})
print(f"  PATCH inexistente → http {st}: {json.dumps(body, ensure_ascii=False)[:300]}")

print()
print("== 7. Snapshot de indexes/constraints vía schema diff no disponible; probamos POST comentario con publicacion_id inexistente ==")
st, body = api("/items/comentarios", method="POST",
                body={"publicacion_id": "00000000-0000-0000-0000-000000000000",
                      "usuario_id": None, "texto": "probe-fk-test"})
print(f"  POST comentario con publicacion_id inexistente → http {st}")
print(f"     {json.dumps(body, ensure_ascii=False)[:600]}")
if isinstance(body, dict) and body.get("data", {}).get("id"):
    st2, _ = api(f"/items/comentarios/{body['data']['id']}", method="DELETE")
    print(f"     cleanup DELETE → http {st2}")
