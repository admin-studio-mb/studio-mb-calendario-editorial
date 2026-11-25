#!/usr/bin/env python3
"""Estado de revisión conjunta (idempotente).

Añade `revision_conjunta` al desplegable `publicaciones.estado` de Directus.
Es el estado en el que el cliente revisa y aprueba texto y diseño a la vez.
"""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
FIELD = "estado"
VALUE = "revision_conjunta"
CHOICE = {
    "text": "Revisión conjunta",
    "value": VALUE,
    "color": "#6366F1",
    "icon": "fact_check",
}

with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
    TOKEN = next(
        l.split("=", 1)[1].strip().strip('"').strip("'")
        for l in fh if l.strip().startswith("PUBLIC_DIRECTUS_STATIC_TOKEN=")
    )


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


print("== publicaciones.estado += revisión conjunta ==")
st, field = api(f"/fields/publicaciones/{FIELD}")
if st != 200 or not isinstance(field, dict):
    raise SystemExit(f"no se pudo leer el campo: {st} {field}")

meta = field.get("data", {}).get("meta") or {}
options = meta.get("options") or {}
choices = list(options.get("choices") or [])

if any(c.get("value") == VALUE for c in choices):
    print("  ya existe")
    idx = next((i for i, c in enumerate(choices) if c.get("value") == VALUE), None)
    objetivo = next((i for i, c in enumerate(choices) if c.get("value") == "aprobado"), len(choices))
    if idx is not None and idx != objetivo:
        choices.insert(objetivo, choices.pop(idx))
        st, body = api(
            f"/fields/publicaciones/{FIELD}",
            "PATCH",
            {"meta": {**meta, "options": {**options, "choices": choices}}},
        )
        print(f"  reordenado → {st}" + ("" if st in (200, 204) else f" {json.dumps(body)[:300]}"))
else:
    idx = next((i for i, c in enumerate(choices) if c.get("value") == "aprobado"), len(choices))
    choices.insert(idx, CHOICE)
    st, body = api(
        f"/fields/publicaciones/{FIELD}",
        "PATCH",
        {"meta": {**meta, "options": {**options, "choices": choices}}},
    )
    print(f"  PATCH → {st}" + ("" if st in (200, 204) else f" {json.dumps(body)[:300]}"))

api("/utils/cache/clear", "POST", {"system": True})
