# Studio mb · Calendario Editorial

Portal interno de la agencia **Studio mb** para gestionar el calendario de
publicaciones en redes sociales de sus clientes. Construido sobre
**Astro (SSR) + React (islas) + Tailwind**, con **Directus** como Headless CMS
autogestionado.

---

## Stack

| Capa            | Tecnología                                  |
| --------------- | ------------------------------------------- |
| Front / SSR     | Astro 4 + Node Adapter                      |
| Islas React     | Calendar, PostForm, FeedMockup, Comments    |
| Estilos         | Tailwind CSS                                |
| Backend / CMS   | Directus 11 (Docker, sin BBDD propia)       |
| BBDD            | PostgreSQL global del servidor              |
| Cache/Sesiones  | Redis global del servidor                   |
| Reverse Proxy   | Nginx Proxy Manager (`nginx-proxy-manager_default`) |
| Auth            | JWT en cookie HttpOnly                      |

---

## Estructura del repositorio

```
.
├── infra/
│   └── directus/
│       ├── docker-compose.yml     # Solo contenedor Directus
│       └── .env.example
├── src/                          # Código del frontend Astro
│   ├── components/               # Islas React
│   ├── layouts/
│   ├── lib/                      # SDK Directus + auth
│   └── pages/
└── .env.example                  # Variables del frontend
```

---

## Puesta en marcha rápida

### 1. Levantar Directus (en el VPS)

```bash
cd infra/directus
cp .env.example .env            # Edita y rellena claves reales
docker network create npm_network   # Solo la primera vez
docker compose up -d
```

### 2. Levantar el frontend (en local)

```bash
pnpm create astro@latest . -- --template minimal --typescript strict --no-install
pnpm add @astrojs/react @astrojs/node @astrojs/tailwind \
         react@^18 react-dom@^18 @types/react@^18 @types/react-dom@^18 \
         tailwindcss@^3 @directus/sdk date-fns
pnpm dev
```

> ⚠️ Los pasos exactos están en [`docs/SETUP.md`](./docs/SETUP.md) cuando lo
> generemos; por ahora consulta la documentación oficial:
> <https://docs.astro.build/en/guides/integrations-guide/react/>

---

## Estado del proyecto

- [x] Fase 1 — Infraestructura (Directus)
- [x] Fase 2 — Configuración Astro + Tailwind
- [x] Fase 3 — Autenticación JWT (HttpOnly)
- [x] Fase 4 — Componentes (Calendar, PostForm, FeedMockup, Comments)
- [x] Fase 5 — Despliegue en VPS tras NPM
- [ ] Fase 6 — Colecciones `clientes` / `publicaciones` / `comentarios` en Directus
- [ ] Fase 7 — Endpoints `/api/publicaciones` + `/api/comentarios`

---

## Despliegue en VPS — gotchas conocidos (Directus 11.5.0)

Cuando despliegas de cero en un VPS con PostgreSQL y Redis globales ya
existentes, hay tres cosas que el `docker compose up` no resuelve solo:

### 1. BBDD y usuario dedicado

`Directus` no crea automáticamente la BBDD ni el rol. Antes de arrancarlo:

```bash
docker exec -u postgres postgres-global psql <<'SQL'
CREATE DATABASE studio_mb_calendario;
CREATE USER studio_mb WITH ENCRYPTED PASSWORD 'TU_PASS';
GRANT ALL PRIVILEGES ON DATABASE studio_mb_calendario TO studio_mb;
\c studio_mb_calendario
GRANT ALL ON SCHEMA public TO studio_mb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO studio_mb;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO studio_mb;
SQL
```

### 2. Redis con password — URL-escapada obligatoria

Si tu `redis-global` tiene `requirepass`, no puedes meterla como
`REDIS_PASSWORD=…` (Directus 11.5 no la lee). Tienes que meterla en la URL
con caracteres especiales URL-encodados:

```
# Pass con '/' o '=' → %2F / %3D
REDIS=redis://:UOg6zCbW%2FhN7E8YOkyrbYtsDf3e08vFiNdJA0fmZObQ%3D@redis:6379
```

### 3. Bootstrap skip + admin inexistente

Si Directus arranca después de que las migraciones se hayan aplicado al
menos una vez (aunque sea un boot fallido anterior), loggea
`Database already initialized, skipping install` y **no crea el rol
Administrator ni el usuario admin**, aunque tengas `ADMIN_EMAIL` /
`ADMIN_PASSWORD` en el `.env`.

Hay que crearlos manualmente tras el primer `up`:

```bash
# 1. Crear el rol Administrator (tabla vacía al inicio)
docker exec -u postgres postgres-global psql -d studio_mb_calendario -tA \
  -c "INSERT INTO directus_roles (id, name, icon, description)
      VALUES (gen_random_uuid(), 'Administrator', 'supervised_user_circle',
              'Initial administrative role with full access.');"

# 2. Sacar su UUID y crear el usuario admin con la CLI de Directus
ROLE_UUID=$(docker exec -u postgres postgres-global psql -d studio_mb_calendario -tA \
  -c "SELECT id FROM directus_roles WHERE name='Administrator'")
docker exec studio-mb-directus node cli.js users create \
  --email "admin@studiomb.es" \
  --password "$PASS" \
  --role "$ROLE_UUID"
```

### 4. Healthcheck de Directus en imagen Alpine

El `wget` de busybox intenta IPv6 primero (`::1:8055`) y Directus solo
escucha en IPv4 → `Connection refused` aunque la app esté sana. Por eso
nuestro `docker-compose.yml` usa `node` directamente:

```yaml
healthcheck:
  test:
    - "CMD"
    - "node"
    - "-e"
    - "require('http').get('http://127.0.0.1:8055/server/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
```

> ⚠️ Considera subir la imagen a `directus/directus:11.9.x` o `12.x` cuando
> esté validado el flujo, porque varios de estos bugs son fixes en versiones
> posteriores.
