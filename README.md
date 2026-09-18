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
| Reverse Proxy   | Nginx Proxy Manager (`npm_network`)         |
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
- [ ] Fase 2 — Configuración Astro + Tailwind
- [ ] Fase 3 — Autenticación JWT (HttpOnly)
- [ ] Fase 4 — Componentes (Calendar, PostForm, FeedMockup, Comments)
- [ ] Fase 5 — Despliegue en VPS tras NPM
