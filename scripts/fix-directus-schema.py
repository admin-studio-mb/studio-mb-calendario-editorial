#!/usr/bin/env python3
"""Aplica correcciones de esquema en Directus (idempotente).

1. Actualiza los choices de publicaciones.estado al flujo completo de 6 estados.
2. Crea la FK comentarios.publicacion_id -> publicaciones.id (ON DELETE CASCADE),
   que hoy NO existe (probado: se pudo crear un comentario con UUID inexistente).
3. Crea la FK comentarios.usuario_id -> directus_users.id (ON DELETE SET NULL),
   que hoy NO existe.
"""
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


def show(label, st, body, limit=500):
    text = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    print(f"  {label}: http {st} → {text[:limit]}")


# ─────────────────────────────────────────────────────────────────────────────
print("== A. Choices de publicaciones.estado ==")

NEW_ESTADO_CHOICES = [
    {"text": "Borrador", "value": "borrador", "color": "#E35169", "icon": "draw"},
    {"text": "Revisión texto", "value": "revision", "color": "#3B82F6", "icon": "eye_tracking"},
    {"text": "En diseño", "value": "en_diseno", "color": "#9333EA", "icon": "palette"},
    {"text": "Revisión diseño", "value": "revision_diseno", "color": "#EC4899", "icon": "image"},
    {"text": "Aprobado", "value": "aprobado", "color": "#2ECDA7", "icon": "check_circle"},
    {"text": "Publicado", "value": "publicado", "color": "#14B8A6", "icon": "send"},
]

st, field = api("/fields/publicaciones/estado")
if st != 200:
    show("GET field", st, field)
    raise SystemExit("No se pudo leer el field estado")

current_choices = ((field.get("data") or {}).get("meta") or {}).get("options", {}).get("choices")
current_values = [c.get("value") for c in (current_choices or [])]
new_values = [c.get("value") for c in NEW_ESTADO_CHOICES]

if current_values == new_values:
    print("  ya está actualizado, no se toca")
else:
    st, body = api("/fields/publicaciones/estado", method="PATCH", body={
        "meta": {"options": {"choices": NEW_ESTADO_CHOICES}},
    })
    show("PATCH field estado", st, body)

# Verificación
st, field = api("/fields/publicaciones/estado")
choices = (((field.get("data") or {}).get("meta") or {}).get("options") or {}).get("choices") or []
print(f"  choices ahora: {[c.get('value') for c in choices]}")

# ─────────────────────────────────────────────────────────────────────────────
print()
print("== B. FK comentarios.publicacion_id -> publicaciones.id (CASCADE) ==")

st, rels = api("/relations")
existing = {
    (r.get("collection"), r.get("field"))
    for r in (rels.get("data", []) if isinstance(rels, dict) else [])
}

if ("comentarios", "publicacion_id") in existing:
    print("  ya existe, no se toca")
else:
    st, body = api("/relations", method="POST", body={
        "collection": "comentarios",
        "field": "publicacion_id",
        "related_collection": "publicaciones",
        "meta": {
            "one_field": None,
            "one_allowed_collections": [],
            "one_deselect_action": "nullify",
            "many_collection": "comentarios",
            "many_field": "publicacion_id",
            "many_allowed_collections": [],
            "many_deselect_action": "nullify",
        },
        "schema": {
            "table": "comentarios",
            "column": "publicacion_id",
            "foreign_key_table": "publicaciones",
            "foreign_key_column": "id",
            "constraint_name": "comentarios_publicacion_id_foreign",
            "on_update": "NO ACTION",
            "on_delete": "CASCADE",
        },
    })
    show("POST relation publicacion_id", st, body, 600)

print()
print("== C. FK comentarios.usuario_id -> directus_users.id (SET NULL) ==")

if ("comentarios", "usuario_id") in existing:
    print("  ya existe, no se toca")
else:
    st, body = api("/relations", method="POST", body={
        "collection": "comentarios",
        "field": "usuario_id",
        "related_collection": "directus_users",
        "meta": {
            "one_field": None,
            "one_allowed_collections": [],
            "one_deselect_action": "nullify",
            "many_collection": "comentarios",
            "many_field": "usuario_id",
            "many_allowed_collections": [],
            "many_deselect_action": "nullify",
        },
        "schema": {
            "table": "comentarios",
            "column": "usuario_id",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
            "constraint_name": "comentarios_usuario_id_foreign",
            "on_update": "NO ACTION",
            "on_delete": "SET NULL",
        },
    })
    show("POST relation usuario_id", st, body, 600)

# ─────────────────────────────────────────────────────────────────────────────
print()
print("== D. Verificación final ==")
st, rels = api("/relations")
for r in (rels.get("data", []) if isinstance(rels, dict) else []):
    if r.get("collection") == "comentarios":
        print(f"  {r.get('collection')}.{r.get('field')} -> "
              f"{r.get('related_collection')}.{r.get('related_field')} "
              f"on_delete={r.get('schema', {}).get('on_delete')}")

st, field = api("/fields/publicaciones/estado")
choices = (((field.get("data") or {}).get("meta") or {}).get("options") or {}).get("choices") or []
print(f"  estado choices: {[c.get('value') for c in choices]}")

print()
print("== E. Prueba de integridad: comentario con publicacion_id inexistente ==")
st, body = api("/items/comentarios", method="POST", body={
    "publicacion_id": "00000000-0000-0000-0000-000000000000",
    "usuario_id": None,
    "texto": "probe-integridad",
})
print(f"  POST → http {st}")
if st == 201 or (isinstance(body, dict) and body.get("data", {}).get("id")):
    cid = body["data"]["id"]
    print("  ⚠ ACEPTADO: la FK sigue sin existir (o no valida). Limpiando…")
    st2, _ = api(f"/items/comentarios/{cid}", method="DELETE")
    print(f"  cleanup DELETE → http {st2}")
else:
    print(f"  ✓ RECHAZADO correctamente: {json.dumps(body, ensure_ascii=False)[:400]}")
