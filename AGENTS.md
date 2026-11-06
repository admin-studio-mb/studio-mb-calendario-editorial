# AGENTS.md — Studio mb · Calendario Editorial

> Documento de contexto para agentes de IA (opencode, Cursor, Claude, etc.)
> que trabajen en este proyecto. Léelo entero antes de tocar nada.

---

## 1. Proyecto

Portal interno de la agencia **Studio mb** para gestionar el calendario de
publicaciones en redes sociales de sus clientes. Construido sobre Astro (SSR)
+ React (islas) + Tailwind, con Directus como Headless CMS autogestionado en
Docker.

El usuario es **Iván**, operador único no-técnico. Trabaja paso a paso,
evidence-driven: ejecuta comandos en su Windows local o en el VPS, pega
salidas literales, y espera confirmación antes de pasar al siguiente paso.
No improvisa — consulta docs oficiales antes de cualquier sintaxis no
verificada.

---

## 2. URLs del proyecto (decidido por el usuario)

| URL | Apunta a | Quién lo usa |
| --- | --- | --- |
| `https://cms.studiomb.es` | Directus 12.3.1 (backend / admin) | Solo admins |
| `https://calendar.studiomb.es` | Frontend Astro (calendario editorial) | Agencia + clientes (pendiente de desplegar) |

Ambos se exponen vía Nginx Proxy Manager (`nginx_proxy_manager`) apuntando a
contenedores Docker por nombre.

---

## 3. Infraestructura VPS

### 3.1 Servidor

- Ubuntu 24.04 LTS, Docker 29.1.3, Compose v5.1.1.
- Apps centralizadas en `/opt/studio-mb-apps/<app-name>/`.
- BBDD PostgreSQL global: contenedor `postgres-global` en red `servicios-internos` (172.23.0.0/16). Alias DNS: `postgres`.
- Redis global: contenedor `redis-global` en la misma red. Alias DNS: `redis`. **Tiene `requirepass` activo** — ver §6.
- NPM: contenedor `nginx_proxy_manager` en red `nginx-proxy-manager_default` (172.21.0.0/16). UI admin en `http://IP_VPS:81`.

### 3.2 Redes Docker activas (no crear nuevas sin preguntar)

- `servicios-internos` — compartida por `postgres-global`, `redis-global`, `studio-mb-directus`.
- `nginx-proxy-manager_default` — compartida por NPM, `studio-mb-directus` (para que NPM resuelva el contenedor).

### 3.3 Despliegue del repo

```bash
# En el VPS
cd /opt/studio-mb-apps
git clone https://github.com/admin-studio-mb/studio-mb-calendario-editorial.git
cd studio-mb-calendario-editorial/infra/directus
```

El contenedor Directus se llama `studio-mb-directus` y debe estar en las
**dos redes externas** (`servicios-internos` y
`nginx-proxy-manager_default`) para que vea la BBDD/Redis y para que NPM lo
resuelva por nombre de contenedor.

---

## 4. Stack técnico

| Capa | Tecnología | Versión |
| --- | --- | --- |
| Front / SSR | Astro | 4.16.x |
| Adapter | @astrojs/node | 8.x (standalone) |
| Islas React | React | 18.3 |
| Estilos | Tailwind CSS | 3.4 |
| Backend CMS | Directus | **12.3.1** (imagen Docker) |
| BBDD | PostgreSQL | 16 (contenedor `postgres-global`) |
| Cache/Sesiones | Redis | 7.4 (contenedor `redis-global`) |
| Auth | JWT en cookie HttpOnly | `studio_mb_session` |
| MCP server | @directus/mcp nativo de Directus 12 | (incluido en imagen) |
| Reverse proxy | Nginx Proxy Manager | v2 |

---

## 5. Estructura del repo

```
.
├── infra/
│   ├── directus/
│   │   ├── docker-compose.yml      # Solo contenedor studio-mb-directus
│   │   ├── .env.example             # Plantilla con vars públicas
│   │   ├── schema.json              # Snapshot declarativo (3 colecciones)
│   │   ├── schema.sql               # SQL de referencia (clientes/publicaciones/comentarios)
│   │   └── create-collections.sh    # Script idempotente para crear colecciones vía REST
│   └── frontend/                    # Despliegue del front (Astro)
│       ├── Dockerfile               # Multi-stage build (Node 24 alpine)
│       ├── docker-compose.yml       # Servicio studio-mb-calendario
│       └── .env.example
├── src/
│   ├── components/                  # Islas React (.jsx)
│   │   ├── Calendar.jsx
│   │   ├── PostForm.jsx
│   │   ├── FeedMockup.jsx
│   │   └── CommentThread.jsx
│   ├── layouts/
│   │   └── Layout.astro
│   ├── lib/
│   │   ├── directus.js              # Cliente SDK + factory authed
│   │   ├── directus-fetch.js        # Helper SSR (habla con Directus desde el servidor)
│   │   ├── auth.js                  # Login/logout/cookies
│   │   └── env.js                   # Acceso tipado a env vars
│   ├── pages/
│   │   ├── login.astro
│   │   ├── dashboard/index.astro
│   │   └── api/
│   │       ├── auth/{login,logout}.js
│   │       ├── publicaciones.js     # POST: crea publicación
│   │       ├── files.js             # POST: upload a Directus files
│   │       └── comentarios.js       # GET/POST: lista y crea comentarios
│   ├── stores/
│   │   └── publicaciones.js         # Store Nanostores (optimistic update)
│   ├── styles/globals.css
│   ├── env.d.ts
│   └── middleware.js                # Protección SSR global
├── .env.example                      # Plantilla vars frontend
├── astro.config.mjs                  # Astro 7 + astro:env + Tailwind 4 via @tailwindcss/vite
├── tsconfig.json
├── package.json
├── opencode.json                     # config MCP server para opencode
└── README.md
```

---

## 6. Gotchas críticos de Directus 12.3.1

Documentados tras batallas reales en este proyecto. **Todos se resuelven con
los pasos indicados** — si reaparece alguno, la respuesta está aquí.

### 6.1 BBDD y rol dedicado NO se crean solos

Antes del primer `docker compose up`, en `postgres-global`:

```sql
CREATE DATABASE studio_mb_calendario;
CREATE USER studio_mb WITH ENCRYPTED PASSWORD '<PASS>';
GRANT ALL PRIVILEGES ON DATABASE studio_mb_calendario TO studio_mb;
\c studio_mb_calendario
GRANT ALL ON SCHEMA public TO studio_mb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO studio_mb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO studio_mb;
```

### 6.2 Redis con requirepass → URL-escape obligatorio

Directus 12 **no lee `REDIS_PASSWORD`** como variable suelta. Hay que
meterla en la URL **con caracteres URL-encodados**:

```env
# Si la pass es: UOg6zCbW/hN7E8YOkyrbYtsDf3e08vFiNdJA0fmZObQ=
# '/', '=', etc. → %2F, %3D
REDIS=redis://:UOg6zCbW%2FhN7E8YOkyrbYtsDf3e08vFiNdJA0fmZObQ%3D@redis:6379
```

Si no, error `NOAUTH Authentication required` en bucle.

### 6.3 Bootstrap skip + 0 usuarios / 0 roles

Aunque la primera ejecución falle (por ejemplo por Redis), el segundo boot
loggea `Database already initialized, skipping install` y **no crea** el rol
Administrator ni el usuario admin aunque `ADMIN_EMAIL`/`ADMIN_PASSWORD`
estén en `.env`.

**Fix manual tras el primer `up`**:

```sql
-- Crear rol Administrator (tabla vacía, sin ON CONFLICT porque no hay UNIQUE en name)
INSERT INTO directus_roles (id, name, icon, description)
VALUES (gen_random_uuid(), 'Administrator', 'supervised_user_circle',
        'Initial administrative role with full access.');
```

Luego vía CLI (la API da 403 con policy corrupta):

```bash
ROLE_UUID=$(docker exec -u postgres postgres-global psql -d studio_mb_calendario -tA \
  -c "SELECT id FROM directus_roles WHERE name='Administrator'")
docker exec studio-mb-directus node cli.js users create \
  --email "admin@studiomb.es" \
  --password "$PASS" \
  --role "$ROLE_UUID"
```

### 6.4 Healthcheck: `/server/health` devuelve 403 en Directus 12

El endpoint `/server/health` requería auth en 11.x → **en 12.x directamente
devuelve 403 sin auth**. La app está sana pero el healthcheck casca.

**Fix**: cambiar el healthcheck del docker-compose a TCP-only:

```yaml
healthcheck:
  test: ["CMD", "node", "-e",
         "require('net').connect(8055,'127.0.0.1',()=>process.exit(0)).on('error',()=>process.exit(1))"]
```

(No uses `wget http://127.0.0.1:8055/server/health` — devuelve 403.)

### 6.5 Crear collections vía API / schema/apply es problemático

- `POST /collections` con token JWT admin → devuelve `403 You don't have permission to access this` aunque `admin_access:true` en el JWT.
- `POST /schema/apply` → exige `hash` + `diff` (JSON Patch), complejo y propenso a errores.
- `node cli.js schema apply` → **bug en v12.3.1**: `TypeError: Cannot read properties of undefined (reading 'filter')` en `getSnapshotDiff`.

**Workaround actual**: crear colecciones vía **UI de Directus**
(`/admin` → Settings → Data Model → Create Collection). Es la única vía
que funciona consistentemente en esta instalación.

Si en el futuro arreglamos `directus_permissions`, podemos reactivar el
script `infra/directus/create-collections.sh`.

### 6.6 Default policies NO se crean en bootstrap skip

Igual que §6.3 pero para policies. Si `directus_policies` está vacío, crear:

```sql
INSERT INTO directus_policies (id, name, icon, description, admin_access, app_access, enforce_tfa)
VALUES (gen_random_uuid(), 'full_access', 'shield', 'Full access policy.', true, true, false);
```

Y vincular rol Administrator → policy vía `directus_access`:

```sql
INSERT INTO directus_access (id, role, policy)
VALUES (gen_random_uuid(), '<role_uuid>', '<policy_uuid>');
```

Tras esto, restart duro (`docker restart studio-mb-directus`) para vaciar
caché de policies en memoria.

### 6.7 Directus 12 NO invalida la caché al escribir (Redis)

**Síntoma**: el usuario crea un comentario (o una publicación) y no aparece
hasta que expira la caché de Redis (minutos). Los listados SSR devuelven datos
viejos.

**Causa**: Directus 12 cachea los GET en Redis y **no borra la caché
al crear/actualizar/borrar items**.

**Solución**: llamar a `POST /utils/cache/clear?system=true`:
- **Después** de cada mutación (crear/editar/borrar).
- **Antes** de leer listados que deben estar frescos (p.ej. el hilo de
  comentarios al abrir un post).

En el front está centralizado en `src/lib/cache.js`
(`clearDirectusCache(token)`), que usan TODOS los endpoints de escritura.

**⚠️ Los parámetros tipo `?t=<timestamp>` NO son cache-buster.** Directus
calcula la clave de caché sobre la query **normalizada** e ignora los
parámetros extra. Comprobado en producción:

| Petición | ¿Invalida la caché? |
|---|---|
| `?t=123456` | ❌ no |
| `?_=123456` | ❌ no |
| `?t=...&_=...` | ❌ no |
| `POST /utils/cache/clear?system=true` | ✅ sí |

El `cache: 'no-store'` de `fetch` sólo afecta al **caché HTTP intermedio**
(proxy/NPM), **no** al de Directus.

```js
// src/lib/cache.js
export async function clearDirectusCache(token) {
  const r = await directusFetch({
    path: '/utils/cache/clear', method: 'POST', token, search: { system: 'true' },
  });
  return r.ok;
}
```

### 6.8 `timestamp without time zone` + `toISOString()` = desfase de horas

**Síntoma**: el usuario programa un post a las 09:00 y el calendario muestra
las 08:00 (o las 07:00 en horario de verano).

**Causa**: `publicaciones.fecha_publicacion` es `timestamp WITHOUT time zone`.
El front mandaba `date.toISOString()` (UTC, con "Z"), Directus guardaba esa
hora UTC tal cual, y al releerla el navegador la interpretaba como hora
local → una hora menos (dos en CEST).

**Invariante**: el valor SIEMPRE es **hora de pared** (hora local de la
agencia, Europe/Madrid) en formato naive `YYYY-MM-DDTHH:mm:ss`, sin `Z`.

- Para escribir: `toISOlocal(new Date(...))` (nunca `toISOString()`).
- Para leer: `parseFechaPublicacion(valor)` (nunca `parseISO()` pelado).
- Todo pasa por `src/lib/fecha.js`, que es la única fuente de verdad.

En el servidor, `normalizarFechaPublicacion()` acepta ambos formatos: si
llega con `Z`/offset lo convierte a hora de la agencia; si llega naive lo
respeta.

### 6.9 `archivado` (soft-delete) NO filtra los listados por defecto

Las 3 colecciones tienen `archive_field = 'archivado'`. Directus **excluye
los archivados de los listados**, pero sólo si NO pides ese campo
explícitamente:

| Query | Resultado |
|---|---|
| `GET /items/clientes` | sólo los no archivados ✓ |
| `GET /items/clientes?fields=id,nombre,archivado` | **incluye los archivados** ✗ |

**Regla**: nunca pedir `archivado` en `fields` de los listados de la app.

### 6.10 Los permisos por cliente NO admiten filtro relacional en `validation`

Directus 12 **no soporta** filtros relacionales en el `validation` de un
permiso `create`. Comprobado:

| Sintaxis | Resultado |
|---|---|
| `validation: {publicacion_id: {cliente_id: {_eq: "$CURRENT_USER.cliente_id"}}}` | HTTP 400 "Value is required" (siempre, incluso con UUID literal) |
| `validation: {publicacion_id: {_in: {publicaciones: {...}}}}` | HTTP 400 |
| `validation: {publicacion_id: {_some: {...}}}` | se ignora (no bloquea nada) |
| `permissions` (en vez de `validation`) en `create` | se ignora |

**Solución aplicada — desnormalizar el filtro**: se añadió `cliente_id` a
`comentarios` (FK → `clientes.id`, `SET NULL`), heredado de la publicación.
Con un campo PLANO todo funciona:

- `comentarios.read` → `permissions: {cliente_id: {_eq: "$CURRENT_USER.cliente_id"}}`
- `comentarios.create` → `validation: {cliente_id: {_eq: "$CURRENT_USER.cliente_id"}, usuario_id: {_eq: "$CURRENT_USER"}}`

El endpoint `/api/comentarios` POST **hereda el `cliente_id` de la
publicación** y lo envía; nunca lo acepta del cliente.

**En `read` sí funciona el filtro relacional** (deep filter):
`{publicacion_id: {cliente_id: {_eq: "..."}}}` → HTTP 200.

### 6.11 `DELETE` de un usuario con registros asociados → HTTP 500

Los campos `creado_por` / `actualizado_por` son FK a `directus_users` con
`ON DELETE NO ACTION`. Si el usuario creó registros, Directus devuelve:

```
delete from "directus_users" where "id" in ($1) - update or delete on table
"directus_users" violates foreign key constraint "publicaciones_creado_por_foreign"
```

**Antes de borrar un usuario**: nullar `creado_por`/`actualizado_por` de sus
registros o borrar esos registros primero.

### 6.12 `PATCH /items/:collection/:id` — el id va en la URL

En Directus 12, `PATCH /items/comentarios` con `{"id": ...}` en el body
devuelve `400 "data is required"`. El id va en la ruta:
`PATCH /items/comentarios/<id>` con el body del patch.

---

## 6.13 Permisos por cliente — configurados y verificados

Estado real en `cms.studiomb.es` (verificado E2E con un usuario real):

- **Rol** `Cliente` (id `0156e14e-94d9-45c1-9816-57a937c59836`) — no admin.
- **Policy** `cliente_acceso` (id `89b9031c-d420-4ed5-9977-66827948f99b`),
  `admin_access=false`, `app_access=true`, vinculada al rol vía
  `directus_access`.
- **Campo** `directus_users.cliente_id` (uuid, FK → `clientes.id`,
  `SET NULL`). Así cada usuario de cliente sabe a qué cliente pertenece.
- **Permisos** de la policy:

| Colección | Acción | Filtro |
|---|---|---|
| `clientes` | read | `id = $CURRENT_USER.cliente_id` |
| `publicaciones` | read | `cliente_id = $CURRENT_USER.cliente_id` |
| `publicaciones` | create | `validation: cliente_id = $CURRENT_USER.cliente_id` |
| `publicaciones` | update | `permissions` + `validation` por `cliente_id` |
| `comentarios` | read | `cliente_id = $CURRENT_USER.cliente_id` (campo desnormalizado) |
| `comentarios` | create | `validation: cliente_id + usuario_id` |
| `comentarios` | update/delete | `usuario_id = $CURRENT_USER` (sólo el autor) |
| `directus_files` | read | — |
| `directus_users` | read/update | `id = $CURRENT_USER` |

**Cómo se da de alta un cliente** (por ahora, en la UI de Directus):

1. Settings → Data Model → `directus_users` → añadir el usuario con rol
   **Cliente**.
2. En ese usuario, poner `cliente_id` = su cliente.
3. Listo: entra en `calendar.studiomb.es` y sólo ve lo suyo.

**Limitación conocida y su impacto real**: Directus 12 no puede validar en
`create` que el `publicacion_id` de un comentario pertenezca al cliente
(ver §6.10). Consecuencia: un cliente con su JWT de Directus podría crear
un comentario apuntando a la publicación de otro cliente **siempre que
`cliente_id` sea el suyo**. La validación `cliente_id = $CURRENT_USER.cliente_id`
impide atribuirlo a otro (verificado: HTTP 400).

Efecto real de ese residuo: el comentario queda **invisible para el cliente
legítimo** (su `read` filtra por su propio `cliente_id`) y **visible sólo para
el atacante**. Es decir, no hay fuga de información ni contaminación del hilo
del otro cliente — el daño se limita a ruido en la BBDD. En la **app** no
ocurre: `/api/comentarios` POST consulta la publicación con el JWT del
usuario (403 si es ajena) y responde 404 sin crear nada (verificado E2E).

**Refuerzo opcional** (decisión de arquitectura, pendiente de confirmar):
quitar `comentarios.create` al rol `Cliente` y que el endpoint cree el
comentario con credenciales de servicio. Coste: `creado_por` en Directus
pasaría a ser el admin (el `usuario_id` —autor visible— seguiría siendo el
correcto) y la app passingía a depender de `PUBLIC_DIRECTUS_STATIC_TOKEN`,
que hoy es opcional en el `.env` del VPS (si falta, los comentarios dejarían
de funcionar). **No se ha aplicado** por ese motivo.

### 6.13.1 Rol y flujo editorial en la app (`src/lib/flujo.js`)

La UI y los endpoints de la app se adaptan al rol del usuario. **Fuente
única**: `src/lib/flujo.js` (estados, transiciones y `esCliente()`). El rol
se lee de `/users/me?fields=...,role.id,role.name` en `getCurrentUser()`
(middleware).

| Rol | Qué puede en la app |
|---|---|
| `Administrator` | Todo: contenido, **gestión de clientes** y **gestión de usuarios** (`/dashboard/usuarios`). |
| `Editor` | Contenido de TODOS los clientes: crear/editar/borrar publicaciones, diseños y comentarios. **No** gestiona clientes ni usuarios. |
| `Cliente` | Ver su calendario/mockup, comentar y **confirmar**: `revision→en_diseno`, `revision_diseno→aprobado`, `revision_diseno→en_diseno`. |

**Alta de usuarios desde la web** (`/dashboard/usuarios`, solo Administrator):
crear Cliente (con cliente asignado obligatorio), Editor o Administrador;
editar, suspender y borrar. Los endpoints `/api/usuarios` y
`/api/usuarios/[id]` validan el rol en servidor (403 para no-admin) y
protegen contra autobloqueo (no puedes cambiarte el rol, suspenderte ni
borrarte a ti mismo). El borrado de un usuario con registros asociados
devuelve 409 explicando que hay que suspenderlo o reasignar (§6.11).

Guard en servidor (`/api/publicaciones`, `/api/publicaciones/[id]`):
- POST y DELETE → 403 para Cliente.
- PATCH → 403 si el body toca cualquier campo que no sea `estado`.
- PATCH de `estado` → se lee el estado actual con el JWT del usuario y se
  valida la transición contra `flujo.js`; si no es válida → 403.

En la UI: el Cliente no ve el panel "Nueva publicación" ni el nav "Clientes";
en el modal ve una vista de solo lectura + sus botones de confirmación +
el hilo de comentarios. El select de `estado` desapareció del formulario:
el estado solo cambia con los botones del flujo.

**Limitación honesta**: el guard vive en los endpoints de la app. Si un
Cliente usa su JWT de Directus **directamente** contra `cms.studiomb.es`
puede seguir haciendo `PATCH` de `estado` dentro de sus publicaciones (la
policy permite `update` con `validation` por `cliente_id`). Cerrarlo del todo
requiere limitar campos en el permiso de Directus 12 (field-level
permissions) — pendiente de decidir. Por la app, el flujo se cumple.

Verificación: `python scripts/verify-role-guard.py` (7 checks, limpia sus
datos temporales) y `python scripts/verify-editor-role.py` (8 checks del rol
Editor: no gestiona clientes/usuarios, sí crea/borra publicaciones de
cualquier cliente).

El rol `Editor` y su policy `editor_acceso` (12 permisos, sin gestión de
clientes/usuarios) se crean con `python scripts/setup-editor-role.py`
(idempotente).

Scripts de referencia en `scripts/`: `setup-client-permissions.py`,
`add-comentario-cliente-id.py`, `verify-client-permissions.py`,
`verify-app-flow-client.py`. Ver `scripts/README.md`.

---

## 7. Configuración MCP en opencode

`opencode.json` registra el MCP server de Directus:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "directus-studio-mb": {
      "type": "remote",
      "url": "https://cms.studiomb.es/mcp",
      "enabled": true
    }
  }
}
```

### 7.1 Habilitar OAuth + DCR en Directus

En `.env` de Directus:

```env
MCP_OAUTH_ENABLED=true
MCP_OAUTH_DCR_ENABLED=true
```

En la UI de Directus: **Settings → AI → Model Context Protocol**, activar:

- ☑ MCP Server
- ☑ OAuth Enabled
- ☑ **Dynamic Client Registration** (sin este toggle, opencode da
  `Incompatible auth server: does not support dynamic client registration`)

### 7.2 Autorizar

```powershell
opencode mcp auth directus-studio-mb
# Abre navegador → login admin → consentimiento → token guardado en
# %LOCALAPPDATA%\opencode\mcp-auth.json (Windows) o ~/.local/share/opencode/mcp-auth.json (Linux)
```

CIMD **NO** funciona con opencode (sólo soporta DCR).

---

## 8. Comandos frecuentes

### 8.1 En el VPS (tras `cd /opt/studio-mb-apps/studio-mb-calendario-editorial`)

```bash
git pull                                # actualizar repo
cd infra/directus
docker compose ps                       # estado del contenedor
docker logs --tail 80 studio-mb-directus
docker restart studio-mb-directus        # reiniciar (limpia caché de policies)
docker exec -u postgres postgres-global psql -d studio_mb_calendario ...
```

### 8.2 En Windows (PowerShell)

```powershell
opencode mcp list                        # estado de MCP servers
opencode mcp auth directus-studio-mb     # reautorizar OAuth si caduca
gh auth status                          # verificar cuenta gh activa
gh repo view admin-studio-mb/studio-mb-calendario-editorial
```

---

## 9. Variables de entorno (resumen)

### `infra/directus/.env`

| Var | Ejemplo | Notas |
| --- | --- | --- |
| `KEY` | 64 chars hex | `openssl rand -hex 32` |
| `SECRET` | 64 chars hex | idem |
| `DB_HOST` | `postgres` | alias DNS en servicios-internos |
| `DB_DATABASE` | `studio_mb_calendario` | |
| `DB_USER` | `studio_mb` | creado manualmente |
| `DB_PASSWORD` | la del paso §6.1 | |
| `REDIS` | `redis://:%2F...%3D@redis:6379` | **URL-escaped**, ver §6.2 |
| `ADMIN_EMAIL` | `admin@studiomb.es` | |
| `ADMIN_PASSWORD` | 22 chars | `Admin_<16 hex>` |
| `PUBLIC_URL` | `https://cms.studiomb.es` | **no** calendar.studiomb.es |
| `MCP_OAUTH_ENABLED` | `true` | |
| `MCP_OAUTH_DCR_ENABLED` | `true` | |

### `.env` (raíz, frontend)

| Var | Valor |
| --- | --- |
| `PUBLIC_DIRECTUS_URL` | `https://cms.studiomb.es` |
| `DIRECTUS_INTERNAL_URL` | `http://studio-mb-directus:8055` |
| `SESSION_COOKIE_SECRET` | `openssl rand -hex 32` |
| `SESSION_COOKIE_NAME` | `studio_mb_session` |
| `PUBLIC_DIRECTUS_STATIC_TOKEN` | token estático de un admin — **sólo para scripts de auditoría/ops** (`scripts/*.py`). Está en `.gitignore`. **No** lo usa la app en runtime. |

---

## 10. Estado del proyecto (nov 2026)

- ✅ Fase 1 — Infraestructura Directus
- ✅ Fase 2 — Astro config + Tailwind + SDK + auth JWT
- ✅ Fase 3 — Auth JWT en cookie HttpOnly + middleware SSR
- ✅ Fase 4 — Componentes React (Calendar, PostForm, FeedMockup, CommentThread)
- ✅ Fase 5 — Despliegue VPS + NPM Proxy Host + admin login
- ✅ Upgrade Directus 11.5.0 → 12.3.1
- ✅ MCP server conectado vía OAuth DCR
- ✅ Fase 6 — Colecciones `clientes` / `publicaciones` / `comentarios` creadas vía MCP fields-tool (tras recrear `clientes` por typo `ararchivados`; rename de campo choca con 403 §6.5). Values de `formato` y `estado` en minúscula; frontend adaptado en `Calendar.jsx`, `PostForm.jsx`, `FeedMockup.jsx`.
- ✅ `PUBLIC_URL` corregido a `https://cms.studiomb.es` (antes apuntaba a `calendar.studiomb.es`, residuo de prueba). `/.well-known/oauth-authorization-server` ya apunta todo a `cms`.
- ✅ Fase 7 — Endpoints SSR `/api/publicaciones`, `/api/files`, `/api/comentarios`
- ✅ Fase 8 — Sembrar datos de prueba y admin `ivan.luengo@studiomb.es`
- ✅ Upgrade stack a las últimas estables: Astro **7.3.3**, React **19.3.0**, Tailwind CSS **4.3.3** (vía `@tailwindcss/vite`), `@astrojs/node` **11.1.6**, `@astrojs/react` **6.0.6**. `astro:env` para tipado de variables. `security.checkOrigin: false` por mismatch de origen con NPM.
- ✅ Optimistic update con Nanostores — crear publicación refresca el calendario sin recargar. Rollback si el POST falla con aviso al usuario.
- ✅ Cache busting: `cache: 'no-store'` + `t=<ts>` + `POST /utils/cache/clear` tras mutaciones para evitar que Directus sirva listas cacheadas.
- ✅ Cookie: bug `Max-Age=60` corregido (Directus devuelve `expires` en **ms epoch**, antes se calculaba como segundos y daba negativo). Ahora 8h en local, alineable a 1 semana en prod.
- ✅ Rediseño visual: layout con sidebar + KPIs en dashboard + FeedMockup estilo Instagram + login split screen. Tailwind 4 con paleta `brand` y `ink` en `@theme`.
- ✅ **Fase 9** — Frontend desplegado en `calendar.studiomb.es` (Docker + NPM).
- ✅ **Flujo editorial completo** de 6 estados (`borrador` → `revision` → `en_diseno` → `revision_diseno` → `aprobado` → `publicado`) con botones de acción rápida en el modal de detalle y comentarios integrados en el propio modal.
- ✅ **Rutas relativas en el navegador** (`/api/...` en vez de URL absoluta) — evita el error `fetch failed` por Mixed Content detrás de NPM (§6 del informe de la auditoría).
- ✅ **Zona horaria corregida** — `src/lib/fecha.js` como fuente única; los 15 posts existentes re-corregidos (+1h/+2h según DST).
- ✅ **Caché de Directus** — `src/lib/cache.js` centraliza `POST /utils/cache/clear`; ya no hay comentarios/publicaciones que "no aparecen".
- ✅ **Permisos por cliente** — rol `Cliente` + policy `cliente_acceso` + campo `directus_users.cliente_id`, verificados E2E (§6.13).
- ✅ **Tests** — Vitest (58 tests) + build SSR Astro en verde.
- ✅ **Guard por rol** — `src/lib/flujo.js` como fuente única de transiciones; la UI se adapta al rol (el Cliente no crea ni edita, solo confirma y comenta) y los endpoints validan en servidor (`verify-role-guard.py`, 7 checks).
- ✅ **Roles Admin / Editor / Cliente** — rol `Editor` + policy `editor_acceso` creados en Directus (`setup-editor-role.py`); gestión de usuarios desde `/dashboard/usuarios` (solo Admin): crear Cliente/Editor/Admin, asignar cliente, suspender y borrar. Verificado con `verify-editor-role.py` (8 checks).
- ⏳ Publicación automatizada a redes (fuera de alcance: hoy se hace a mano).
- ⏳ Asignación de `cliente_id` a usuarios desde la UI de la app (hoy se hace en la UI de Directus).

---

## 11. Reglas de oro para el agente

1. **Antes de inventar sintaxis**, consulta docs oficiales (Directus, Astro, opencode) — el usuario lo exige.
2. **Cada paso debe terminar con resultado visible** (commit, output, archivo nuevo). Nada de planes sin ejecución.
3. **El agente debe confirmar antes de saltar** cuando hay decisiones no triviales (formato, naming, breaking changes).
4. **El frontend va a `calendar.studiomb.es` y el backend a `cms.studiomb.es`**. No los mezcles.
5. **No subir imagen de Directus sin documentar el §6 correspondiente**. Cada gotcha conocido tiene que quedar en este archivo.
6. **El usuario trabaja paso a paso**, pegando salidas literales. Responde con bloques `bash` ejecutables etiquetados ("VPS" o "Windows PowerShell"), no prosa.
7. **Nunca uses `toISOString()` para fechas de publicación** ni `parseISO()` para leerlas — pasa por `src/lib/fecha.js` (§6.8).
8. **Toda mutación en Directus va seguida de `clearDirectusCache()`** (§6.7).
9. **Verifica con datos, no con suposiciones**: los scripts de `scripts/` auditan el estado real de Directus contra la API antes de dar por bueno cualquier cambio.
10. **Checkpoint obligatorio en tareas largas**: detente y reporta (qué llevas hecho y qué falta) cada **~15 minutos o ~15 llamadas de herramientas**, lo que ocurra antes. Nunca encadenes decenas de acciones en silencio; el usuario debe poder intervenir. Si vas a lanzar un bloque grande de verificación, anúncialo primero y espera confirmación. Antes de redescubrir algo, mira si ya está documentado en este archivo (§6).
