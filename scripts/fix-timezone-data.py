#!/usr/bin/env python3
"""Corrige el desfase de zona horaria en las publicaciones existentes.

Las publicaciones sembradas se crearon con el bug: el front mandaba
`toISOString()` (UTC) y Directus guardaba esa hora UTC en una columna
`timestamp without time zone`. El resultado es que el calendario muestra
una hora menos de la que realmente se_programó (2 en horario de verano).

Antes de tocar nada, este script MUESTRA el estado actual y el estado que
propondría, para poder revisar antes de aplicar.

Uso:
  python scripts/fix-timezone-data.py            # solo informe (dry-run)
  python scripts/fix-timezone-data.py --apply    # aplica los cambios
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://cms.studiomb.es"
APPLY = "--apply" in sys.argv

# Fechas de referencia: la app vive en Europe/Madrid.
# 2026-09 → CEST (UTC+2) · 2026-12 → CET (UTC+1)
MADRID_DST = timezone(timedelta(hours=2))  # horario de verano
MADRID_STD = timezone(timedelta(hours=1))  # horario estándar


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


def offset_agencia(fecha_naive: datetime) -> int:
    """Offset de Madrid para una fecha dada (considera DST)."""
    # Regla DST de la UE: último domingo de marzo → último domingo de octubre.
    year = fecha_naive.year
    mar = datetime(year, 3, 31)
    while mar.weekday() != 6:
        mar -= timedelta(days=1)
    oct_ = datetime(year, 10, 31)
    while oct_.weekday() != 6:
        oct_ -= timedelta(days=1)
    d = fecha_naive.date()
    if mar.date() <= d < oct_.date():
        return 2
    return 1


def main():
    st, pubs = api("/items/publicaciones", query={
        "limit": -1, "fields": "id,tipo_contenido,fecha_publicacion,estado", "_": bust()})
    rows = pubs.get("data", [])
    print(f"Publicaciones encontradas: {len(rows)}\n")

    cambios = []
    for p in rows:
        raw = p.get("fecha_publicacion")
        if not raw:
            continue
        try:
            naive = datetime.fromisoformat(raw)
        except ValueError:
            print(f"  ! {p['id'][:8]} fecha ilegible: {raw!r}")
            continue

        offset = offset_agencia(naive)
        # El valor guardado es UTC; la hora de pared correcta es UTC + offset.
        # Ej: guardado 08:00 (UTC) en diciembre → 09:00 Madrid.
        nueva = naive + timedelta(hours=offset)
        nuevo_str = nueva.strftime("%Y-%m-%dT%H:%M:%S")

        if nuevo_str == raw[:19]:
            continue
        cambios.append({
            "id": p["id"],
            "tipo": p.get("tipo_contenido"),
            "estado": p.get("estado"),
            "antes": raw,
            "despues": nuevo_str,
            "offset": offset,
        })

    print(f"{'PUBLICACIÓN':<18} {'TIPO':<20} {'AHORA':<22} {'DEBERÍA SER':<22}")
    print("-" * 84)
    for c in cambios:
        print(f"{c['id'][:8]:<18} {str(c['tipo'])[:19]:<20} "
              f"{c['antes']:<22} {c['despues']:<22} (+{c['offset']}h)")

    print(f"\nTotal a corregir: {len(cizaciones) if False else len(cambios)} de {len(rows)}")
    if not cambios:
        print("No hace falta corregir nada.")
        return

    if not APPLY:
        print("\n[DRY-RUN] No se ha aplicado nada. Usa --apply para corregir.")
        print("Revisa la tabla de arriba antes de aplicar.")
        return

    print("\nAplicando...")
    ok = 0
    fallos = []
    for c in cambios:
        st, body = api(f"/items/publicaciones/{c['id']}", method="PATCH",
                       body={"fecha_publicacion": c["despues"]})
        if st == 200:
            ok += 1
        else:
            fallos.append((c["id"], st, str(body)[:120]))
    print(f"  corregidas: {ok}/{len(cambios)}")
    for f in fallos:
        print(f"  FALLO {f[0][:8]} → http {f[1]} {f[2]}")

    print("\nVerificación:")
    st, after = api("/items/publicaciones", query={
        "limit": -1, "fields": "id,fecha_publicacion", "_": bust()})
    nuevos = {r["id"]: r.get("fecha_publicacion") for r in after.get("data", [])}
    for c in cambios:
        print(f"  {c['id'][:8]} → {nuevos.get(c['id'])}")


if __name__ == "__main__":
    main()
