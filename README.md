# Studio mb · Calendario Editorial

> Portal interno para gestionar el calendario de publicaciones en redes sociales de los clientes de la agencia.

[![Stack](https://img.shields.io/badge/stack-Astro%2012%20%2B%20React%2018%20%2B%20Directus-4f46e5)](#stack)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-required-2496ed)](https://docker.com)
[![License](https://img.shields.io/badge/license-internal-orange)](#)

---

## Tabla de contenidos

- [Qué es](#qué-es)
- [Stack](#stack)
- [Demo / URLs](#demo--urls)
- [Quick start](#quick-start)
- [Estructura del repo](#estructura-del-repo)
- [Variables de entorno](#variables-de-entorno)
- [Despliegue](#despliegue)
- [Troubleshooting](#troubleshooting)
- [Estado del proyecto](#estado-del-proyecto)
- [Documentación para agentes IA](#documentación-para-agentes-ia)

---

## Qué es

Herramienta interna de la agencia **Studio mb** para planificar las
publicaciones en redes sociales de sus clientes desde un único panel:
calendario mensual, formulario de creación, mockup del feed estilo Instagram
y comentarios por publicación.

> ⚠️ **No hay publicación automatizada**: el sistema está pensado para
> planificar y revisar. La salida a redes se hace desde otras herramientas.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Front / SSR | Astro 4 + Node Adapter |
| Islas React | Calendar, PostForm, FeedMockup, Comments |
| Estilos | Tailwind CSS |
| Backend / CMS | Directus 12 (Docker, sin BBDD propia) |
| BBDD | PostgreSQL global del servidor |
| Cache/Sesiones | Redis global del servidor |
| Reverse proxy | Nginx Proxy Manager |
| Auth | JWT en cookie HttpOnly (`studio_mb_session`) |
| MCP para IA | Servidor MCP nativo de Directus 12 |

---

## Demo / URLs

| URL | Apunta a | Quién |
| --- | --- | --- |
| `https://calendar.studiomb.es` | Frontend Astro (calendario editorial) | Agencia + clientes |
| `https://cms.studiomb.es` | Directus (panel admin + API REST) | Solo admins |

---

## Quick start

### Levantar Directus (en el VPS)

```bash
cd infra/directus
cp .env.example .env            # Edita y rellena claves reales
docker network create npm_network   # Solo la primera vez
docker compose up -d
```

### Levantar el frontend (en local)

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

## Estructura del repo

```
.
├── infra/
│   └── directus/        # Docker compose, .env.example, schema declarativo
├── src/
│   ├── components/       # Islas React (Calendar, PostForm, FeedMockup, ...)
│   ├── layouts/          # Layouts Astro
│   ├── lib/              # SDK Directus, auth, env
│   └── pages/            # Rutas (login, dashboard, api/auth/...)
├── AGENTS.md             # Contexto completo para agentes IA (léelo si eres uno)
└── README.md             # Este archivo
```

---

## Variables de entorno

Copia los `.env.example` y rellena. **Nunca commitees los `.env` reales.**

| Archivo | Variables clave |
| --- | --- |
| `infra/directus/.env` | `KEY`, `SECRET`, `DB_HOST=postgres`, `DB_PASSWORD`, `REDIS=redis://:URL_ESCAPED_PASS@redis:6379`, `PUBLIC_URL=https://cms.studiomb.es` |
| `.env` (raíz) | `PUBLIC_DIRECTUS_URL=https://cms.studiomb.es`, `SESSION_COOKIE_SECRET`, `SESSION_COOKIE_NAME=studio_mb_session` |

Detalle completo en [`AGENTS.md` §9](./AGENTS.md).

---

## Despliegue

```bash
# VPS
cd /opt/studio-mb-apps
git clone https://github.com/admin-studio-mb/studio-mb-calendario-editorial.git
cd studio-mb-calendario-editorial/infra/directus

cp .env.example .env
# Editar y rellenar claves (ver AGENTS.md §6 para los gotchas)

docker compose up -d
```

Verificación rápida:

```bash
docker compose ps                # STATUS = Up (healthy)
curl -i https://cms.studiomb.es/server/health   # 200 OK
```

---

## Troubleshooting

Si Directus no arranca sano, mira los gotchas documentados (Redis URL-escape,
bootstrap skip, healthcheck, etc.) en [`AGENTS.md` §6](./AGENTS.md#6-gotchas-críticos-de-directus-1231).

Comandos rápidos:

```bash
docker logs --tail 80 studio-mb-directus
docker restart studio-mb-directus       # limpia caché de policies
docker exec -u postgres postgres-global psql -d studio_mb_calendario -c "\du"
```

---

## Estado del proyecto

- ✅ Fase 1 — Infraestructura (Directus)
- ✅ Fase 2 — Configuración Astro + Tailwind
- ✅ Fase 3 — Autenticación JWT (HttpOnly)
- ✅ Fase 4 — Componentes (Calendar, PostForm, FeedMockup, Comments)
- ✅ Fase 5 — Despliegue en VPS tras NPM
- ✅ Upgrade Directus 11.5 → 12.3.1
- ✅ MCP server conectado vía OAuth DCR
- ⏳ Fase 6 — Crear colecciones `clientes` / `publicaciones` / `comentarios` (en curso vía UI)
- ⏳ Fase 7 — Endpoints SSR `/api/publicaciones` + `/api/comentarios`
- ⏳ Fase 8 — Sembrar datos de prueba
- ⏳ Fase 9 — Build y despliegue del frontend Astro en `calendar.studiomb.es`

---

## Documentación para agentes IA

Si eres un agente de IA (opencode, Cursor, Claude Code, etc.) que va a
trabajar en este proyecto:

1. Lee **`AGENTS.md`** entero antes de tocar nada. Tiene la arquitectura,
   gotchas, comandos frecuentes y reglas de oro.
2. **No improvises sintaxis**: el usuario (Iván) consulta docs oficiales
   antes de cualquier cosa no verificada.
3. **Trabaja paso a paso** y termina cada turno con resultado visible
   (commit, archivo nuevo, output literal).
4. **Usa bloques `bash` ejecutables** etiquetados (VPS / Windows PowerShell).
   Nada de prosa.

---

## Licencia

Uso interno — Studio mb. No distribuir fuera de la organización.
