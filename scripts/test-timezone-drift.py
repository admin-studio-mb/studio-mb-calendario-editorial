#!/usr/bin/env python3
"""Mide el desvío real de zona horaria en fecha_publicacion.

Simula exactamente lo que hace el front:
  1) Usuario elige 15/12/2026 09:00 (hora LOCAL del navegador, Madrid = UTC+1).
  2) PostForm: d = new Date(fecha); d.setHours(9,0,0,0); payload = d.toISOString()
  3) POST a Directus.
  4) GET a Directus -> lo que devuelve la API.
  5) Front: parseISO(valor) -> format(..., 'HH:mm')  (lo que VE el usuario).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
MADRID = timezone(timedelta(hours=1))  # CET, enero


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


def bust():
    return int(time.time() * 1000)


st, pubs = api("/items/publicaciones", query={"limit": 1, "fields": "id,cliente_id"})
base_pub = pubs["data"][0]
cliente_id = base_pub.get("cliente_id") or "681c7545-6bdb-483d-9434-91a5c3939fe5"

# Paso 1: el usuario elige 15/12/2026 09:00 hora local Madrid
chosen_local = datetime(2026, 12, 15, 9, 0, 0, tzinfo=MADRID)
# Paso 2: el front construye el ISO (toISOString -> UTC con Z)
iso_sent = chosen_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
print(f"1) Usuario elige (local Madrid) : {chosen_local.strftime('%Y-%m-%d %H:%M %Z')}")
print(f"2) Front envía (toISOString)    : {iso_sent}")

st, created = api("/items/publicaciones", method="POST", body={
    "cliente_id": cliente_id, "formato": "post", "estado": "borrador",
    "tipo_contenido": "TZProbe2", "fecha_publicacion": iso_sent,
    "copywriting": "tz probe 2", "hashtags": [], "imagenes_fondo": []})
pid = created["data"]["id"]

st, got = api(f"/items/publicaciones/{pid}", query={"fields": "id,fecha_publicacion"})
returned = got["data"]["fecha_publicacion"]
print(f"3) Directus devuelve            : {returned!r}")

# Paso 5: qué ve el usuario con parseISO (que es lo que hace el front hoy)
naive = datetime.fromisoformat(returned)               # sin offset -> se trata como LOCAL
shown_local = naive.strftime("%Y-%m-%d %H:%M")
print(f"4) Front parseISO() lo lee como : {shown_local} (hora local, sin offset)")
print(f"   ⇒ el usuario ve {shown_local.split()[1]} pero pidió {chosen_local.strftime('%H:%M')}")

delta = (datetime.strptime(shown_local, "%Y-%m-%d %H:%M")
         - chosen_local.replace(tzinfo=None))
print(f"   ⇒ DESVÍO: {delta.total_seconds() / 3600:+.0f} h")

# Y el día puede cambiar de fecha si la publicación cae cerca de medianoche
st, got2 = api(f"/items/publicaciones/{pid}", query={"fields": "id,fecha_publicacion"})
print(f"\n   (fecha ISO naive que usa el front para agrupar por día: {returned})")

api(f"/items/publicaciones/{pid}", method="DELETE")
print("\n   cleanup OK")

print()
print("=== schema data_type de fecha_publicacion ===")
st, snap = api("/schema/snapshot")
for f in snap.get("data", {}).get("fields", []):
    if f.get("collection") == "publicaciones" and f.get("field") == "fecha_publicacion":
        print("  ", json.dumps(f.get("schema"), ensure_ascii=False, indent=2))
