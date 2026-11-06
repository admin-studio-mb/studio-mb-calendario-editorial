#!/usr/bin/env python3
"""¿`t=` invalida realmente la caché de Directus?

Prueba concluyente: se pide la MISMA URL dos veces (la 1ª puebla la caché),
se inserta un item, y se vuelve a pedir la URL con y sin `t=` distinto.
"""
import json
import os
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


st, pubs = api("/items/publicaciones", query={"limit": -1, "fields": "id,cliente_id"})
pid = pubs["data"][0]["id"]
cid = pubs["data"][0].get("cliente_id")
filt = json.dumps({"publicacion_id": {"_eq": pid}})

# 1) GET con filtro y sin fields → puebla la caché
BASE_Q = {"filter": filt, "limit": 200}
st, r0 = api("/items/comentarios", query=BASE_Q)
print(f"1) GET (puebla caché) → n={len(r0.get('data', []))}")

# 2) crear un comentario nuevo
stamp = int(time.time())
st, com = api("/items/comentarios", method="POST", body={
    "publicacion_id": pid, "cliente_id": cid,
    "usuario_id": "e79b011f-8500-4211-a832-60af459d9d30",
    "texto": f"probe-cache-{stamp}"})
newid = com["data"]["id"]
print(f"2) POST → 200 ({newid[:8]})")

# 3) la MISMA URL otra vez
st, r1 = api("/items/comentarios", query=BASE_Q)
n1 = len(r1.get("data", []))
hit1 = any(x["id"] == newid for x in r1.get("data", []))
print(f"3) GET misma URL      → n={n1}  aparece: {hit1}   "
      f"{'❌ CACHÉ' if not hit1 else '✓'}")

# 4) con t= distinto
st, r2 = api("/items/comentarios", query={**BASE_Q, "t": int(time.time() * 1000)})
n2 = len(r2.get("data", []))
hit2 = any(x["id"] == newid for x in r2.get("data", []))
print(f"4) GET con t=         → n={n2}  aparece: {hit2}   "
      f"{'❌ CACHÉ (t no sirve)' if not hit2 else '✓ t sí invalida'}")

# 5) con _= distinto
st, r3 = api("/items/comentarios", query={**BASE_Q, "_": int(time.time() * 1000)})
n3 = len(r3.get("data", []))
hit3 = any(x["id"] == newid for x in r3.get("data", []))
print(f"5) GET con _=         → n={n3}  aparece: {hit3}   "
      f"{'❌ CACHÉ (_ no sirve)' if not hit3 else '✓ _ sí invalida'}")

# 6) con los dos
st, r4 = api("/items/comentarios", query={**BASE_Q, "t": int(time.time() * 1000), "_": int(time.time() * 1000)})
hit4 = any(x["id"] == newid for x in r4.get("data", []))
print(f"6) GET con t= y _=    → aparece: {hit4}")

# 7) tras cache/clear
api("/utils/cache/clear", method="POST", body={"system": True})
st, r5 = api("/items/comentarios", query=BASE_Q)
hit5 = any(x["id"] == newid for x in r5.get("data", []))
print(f"7) GET tras clear     → aparece: {hit5}   "
      f"{'✓ clear sí invalida' if hit5 else '❌'}")

api(f"/items/comentarios/{newid}", method="DELETE")
