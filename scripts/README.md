# Scripts de operación y auditoría — Studio mb · Calendario Editorial

Todos hablan con la API REST de Directus (`https://cms.studiomb.es`) usando el
token estático de `PUBLIC_DIRECTUS_STATIC_TOKEN` del `.env` de la raíz
(está en `.gitignore`; **nunca** se sube al repo ni se imprime por pantalla).

```bash
cd "C:/DEV/Studio mb/studio-mb-calendario-editorial"
python scripts/<script>.py
```

## Auditoría (sólo lectura)

| Script | Qué hace |
|---|---|
| `audit-directus.py` | Resumen del estado real: esquema de las 3 colecciones, datos, valores de `estado`/`formato`, huérfanos, archivos, usuarios, roles, policies y permisos. |
| `audit-directus-fine.py` | Detalle fino: `choices` exactos de los dropdowns, relaciones, permisos por colección, constraints de FK. |

## Diagnóstico (sólo lectura)

| Script | Qué comprueba |
|---|---|
| `test-timezone-drift.py` | Mide el desfase real entre la hora que se pide y la que se guarda en `fecha_publicacion`. |
| `test-cache-buster.py` | Demuestra empíricamente que **`?t=` / `?_=` NO invalidan la caché** de Directus y que sólo `POST /utils/cache/clear` lo hace (AGENTS.md §6.7). |

## Cambios (escriben en Directus)

| Script | Qué cambia | Idempotente |
|---|---|---|
| `fix-directus-schema.py` | Actualiza los `choices` de `publicaciones.estado` a los 6 estados del flujo editorial y crea las FK que faltaban en `comentarios`. | Sí |
| `fix-timezone-data.py` | Re-corrije el desfase de zona horaria de las publicaciones existentes. **Sin `--apply` es sólo informe.** | Sí |
| `setup-client-permissions.py` | Crea el campo `directus_users.cliente_id`, el rol `Cliente`, la policy `cliente_acceso` y sus permisos. | Sí |
| `setup-editor-role.py` | Crea el rol `Editor` y la policy `editor_acceso` (12 permisos: todo el contenido de todos los clientes, sin gestión de clientes/usuarios). | Sí |
| `setup-notificaciones.py` | Crea la colección `notificaciones`, sus campos/relaciones y los permisos read/update de las policies Cliente y Editor. | Sí |
| `setup-redes.py` | Añade `publicaciones.red` y `clientes.redes`, amplía los fields de los permisos y hace backfill (posts → instagram; clientes → 3 redes con tipos). | Sí |
| `setup-preferencias.py` | Añade `directus_users.preferencias` (JSON) y los permisos para que cada usuario guarde sus preferencias de UI. | Sí |
| `add-comentario-cliente-id.py` | Añade `comentarios.cliente_id` (desnormalizado), hace backfill y reconfigura los permisos de comentarios. | Sí |
| `fix-client-permissions.py` | Corrige los permisos de comentarios (deep filter + `validation`). | Sí |
| `create-e2e-user.py` | Crea un usuario admin temporal para el E2E. | Sí |

## Verificación (crean y borran datos de prueba)

| Script | Qué verifica |
|---|---|
| `verify-client-permissions.py` | 13 comprobaciones de aislamiento con un usuario de cliente real: sólo ve su cliente, sus publicaciones, no puede leer/editar/borrar lo ajeno. |
| `verify-app-flow-client.py` | El flujo de la app con usuario cliente: el GET de la publicación ajena da 403, la expansión de `usuario_id` funciona, listar→crear→listar. |
| `verify-role-guard.py` | El guard por rol de `/api/publicaciones`: con un usuario Cliente temporal verifica 403 al crear/editar/borrar/saltarse el flujo, 200 al confirmar (revision→en_diseno) y que el estado persiste. Limpia todo al final. |
| `verify-editor-role.py` | El rol Editor: 403 en usuarios y clientes (API + página), 201 creando publicación de cualquier cliente y 200 borrándola. Limpia todo al final. |
| `verify-notificaciones.py` | Comentario → notificación al equipo; confirmación del cliente → notificación al equipo; GET de la campanita y "marcar todas" (con caché invalidada). Limpia todo al final. |
| `e2e-app.py` | E2E contra la app local (Astro preview): login → crear cliente → crear publicación → comentar → editar → cambiar estado → borrar → logout. Necesita `DIRECTUS_ADMIN_PASS` y `DIRECTUS_EMAIL`. |

## Orden recomendado para reconstruir un entorno

```bash
python scripts/fix-directus-schema.py      # choices + FKs
python scripts/setup-client-permissions.py  # rol/policy/campo de cliente
python scripts/add-comentario-cliente-id.py # comentarios.cliente_id + backfill
python scripts/fix-client-permissions.py    # ajuste fino de permisos
python scripts/audit-directus.py            # comprobar
```

## Notas importantes

- **Limpia la caché** después de cualquier cambio: `POST /utils/cache/clear?system=true`.
  Directus 12 cachea los GET en Redis y no invalida al escribir (AGENTS.md §6.7).
- **Los listados que deben ser frescos** se fuerzan con `POST /utils/cache/clear?system=true`.
  Los parámetros `?t=` / `?_=` **NO** invalidan la caché de Directus (AGENTS.md §6.7).
- **No pidas `archivado` en `fields`** de los listados: incluiría los
  soft-deletes (AGENTS.md §6.9).
- **Borrar un usuario** que creó registros falla con HTTP 500 por las FK
  `creado_por` (AGENTS.md §6.11): nulla o borra antes sus registros.
