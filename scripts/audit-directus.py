#!/usr/bin/env python3
"""Resumen compacto del estado de Directus (Studio mb · Calendario Editorial)."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")
BASE = "https://cms.studiomb.es"
TARGET = {"clientes", "publicaciones", "comentarios"}


def read_token():
    with open(ENV_PATH, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("PUBLIC_DIRECTUS_STATIC_TOKEN="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val
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


def items(collection, **query):
    query.setdefault("limit", -1)
    st, body = api(f"/items/{collection}", query=query)
    if isinstance(body, dict):
        return st, body.get("data", [])
    return st, []


def main():
    print("# ESQUEMA (campos propios)")
    st, snap = api("/schema/snapshot")
    snap = snap.get("data", {}) if isinstance(snap, dict) else {}
    rows = []
    for f in snap.get("fields", []):
        if f.get("collection") not in TARGET:
            continue
        sch = f.get("schema") or {}
        meta = f.get("meta") or {}
        options = meta.get("options") or {}
        choices = options.get("choices") if isinstance(options, dict) else None
        rows.append({
            "col": f["collection"],
            "field": f["field"],
            "type": f.get("type"),
            "null": sch.get("is_nullable"),
            "default": sch.get("default_value"),
            "fk": sch.get("foreign_key_table"),
            "required": meta.get("required"),
            "readonly": meta.get("readonly"),
            "special": meta.get("special"),
            "choices": choices,
        })
    for r in rows:
        extra = ""
        if r["choices"]:
            extra = " choices=" + ",".join(
                (c.get("text") or c.get("value") or str(c)) if isinstance(c, dict) else str(c)
                for c in r["choices"]
            )
        print(f"  {r['col']:<15} {r['field']:<30} {str(r['type']):<12} "
              f"null={str(r['null']):<5} req={str(r['required']):<5} ro={str(r['readonly']):<5} "
              f"default={r['default']!r} fk={r['fk']} special={r['special']}{extra}")

    print()
    print("# DATOS")
    st_c, clientes = items("clientes")
    st_p, pubs = items("publicaciones")
    st_m, coms = items("comentarios")
    print(f"  clientes={len(clientes)} (http {st_c})  "
          f"publicaciones={len(pubs)} (http {st_p})  comentarios={len(coms)} (http {st_m})")

    for name, coll in (("clientes", clientes), ("publicaciones", pubs), ("comentarios", coms)):
        print(f"\n  -- {name}: columnas presentes --")
        keys = Counter()
        for row in coll:
            for k, v in row.items():
                if v is not None:
                    keys[k] += 1
        for k, n in sorted(keys.items()):
            print(f"     {k:<32} {n}/{len(coll)}")

    print()
    print("# CLIENTES")
    for c in clientes:
        print(f"  {c.get('nombre')!r:<28} id={c.get('id')} logo={c.get('logo')} "
              f"tipos={c.get('tipos_contenido_disponibles')} archivado={c.get('archivado')}")

    print()
    print("# PUBLICACIONES (valores por campo clave)")
    print("  estado:", dict(Counter(p.get("estado") for p in pubs)))
    print("  formato:", dict(Counter(p.get("formato") for p in pubs)))
    print("  tipo_contenido:", dict(Counter(p.get("tipo_contenido") for p in pubs)))
    print("  cliente_id:", dict(Counter(str(p.get("cliente_id")) for p in pubs)))
    print("  sin cliente_id:", sum(1 for p in pubs if not p.get("cliente_id")))
    print("  sin fecha_publicacion:", sum(1 for p in pubs if not p.get("fecha_publicacion")))
    print("  con diseno_final:", sum(1 for p in pubs if p.get("diseno_final")))
    print("  archivado:", dict(Counter(str(p.get("archivado")) for p in pubs)))

    # huérfanos
    client_ids = {c.get("id") for c in clientes}
    orphan = [p.get("id") for p in pubs if p.get("cliente_id") and p.get("cliente_id") not in client_ids]
    print("  publicaciones con cliente_id inexistente:", orphan)

    # archivos referenciados
    st, files = api("/files", query={"limit": -1, "fields": "id,filename_download,type,filesize,uploaded_on"})
    file_list = files.get("data", []) if isinstance(files, dict) else []
    file_ids = {f.get("id") for f in file_list}
    print(f"\n  archivos en Directus: {len(file_list)}")
    for f in file_list:
        print(f"     {f.get('id')} {f.get('filename_download')} {f.get('type')} {f.get('filesize')}B")
    bad_diseno = [p.get("id") for p in pubs
                  if p.get("diseno_final") and p.get("diseno_final") not in file_ids]
    bad_logo = [c.get("id") for c in clientes
                if c.get("logo") and c.get("logo") not in file_ids]
    print("  publicaciones con diseno_final roto:", bad_diseno)
    print("  clientes con logo roto:", bad_logo)

    # imágenes de fondo
    print("\n  -- imagenes_fondo (muestra) --")
    for p in pubs[:6]:
        print(f"     {p.get('id')[:8]} tipo={p.get('tipo_contenido')!r} "
              f"imgs={p.get('imagenes_fondo')}")

    print()
    print("# COMENTARIOS")
    print("  usuario_id:", dict(Counter(str(c.get("usuario_id")) for c in coms)))
    print("  sin usuario:", sum(1 for c in coms if not c.get("usuario_id")))
    for c in coms:
        print(f"     {c.get('id')[:8]} pub={str(c.get('publicacion_id'))[:8]} "
              f"user={str(c.get('usuario_id'))[:8]} txt={str(c.get('texto'))[:50]!r}")

    print()
    print("# USUARIOS")
    st, users = api("/users", query={"fields": "id,email,first_name,last_name,role,status", "limit": -1})
    for u in (users.get("data", []) if isinstance(users, dict) else []):
        print(f"  {u.get('email'):<32} role={u.get('role')} status={u.get('status')} "
              f"nombre={u.get('first_name')} {u.get('last_name')}")

    print()
    print("# ROLES / POLITICAS / ACCESS")
    st, roles = api("/roles")
    for r in (roles.get("data", []) if isinstance(roles, dict) else []):
        print(f"  role {r.get('id')} name={r.get('name')!r} admin={r.get('admin_access')} "
              f"app={r.get('app_access')} policy={r.get('policy')}")
    st, policies = api("/policies")
    for p in (policies.get("data", []) if isinstance(policies, dict) else []):
        print(f"  policy {p.get('id')} name={p.get('name')!r} admin={p.get('admin_access')} "
              f"app={p.get('app_access')} enforce_tfa={p.get('enforce_tfa')}")
    st, access = api("/access")
    for a in (access.get("data", []) if isinstance(access, dict) else []):
        print(f"  access role={a.get('role')} policy={a.get('policy')}")

    print()
    print("# PERMISOS por colección")
    st, perms = api("/permissions")
    if isinstance(perms, dict):
        for p in perms.get("data", []):
            if p.get("collection") in TARGET or p.get("collection") in ("directus_files", "directus_users"):
                print(f"  {p.get('collection'):<20} action={p.get('action'):<8} role={p.get('role')} "
                      f"policy={p.get('policy')} fields={p.get('fields')} "
                      f"permissions={p.get('permissions')}")
        print(f"  (total permisos: {len(perms.get('data', []))})")

    print()
    print("# RELACIONES (directus_relations)")
    st, rels = api("/relations")
    for r in (rels.get("data", []) if isinstance(rels, dict) else []):
        if r.get("collection") in TARGET:
            print(f"  {r.get('collection')}.{r.get('field')} -> "
                  f"{r.get('related_collection')}.{r.get('meta', {}).get('one_field') or r.get('related_field')} "
                  f"schema={r.get('schema', {}).get('on_delete')}")


if __name__ == "__main__":
    main()
