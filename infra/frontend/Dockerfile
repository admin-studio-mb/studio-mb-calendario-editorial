# ============================================================================
#  Studio mb · Calendario Editorial — Frontend Dockerfile
#  Multi-stage: build con todas las deps → runtime mínimo con solo lo necesario.
# ============================================================================

# ---- Etapa 1: deps + build -----------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Habilitamos pnpm con la versión esperada por el repo.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copiamos solo los manifests primero para cachear mejor las deps.
# `.npmrc` se mantiene para registry/auth; `pnpm-workspace.yaml` para el resto.
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copiamos el resto del código y construimos.
COPY . .

# astro:env valida el esquema en build; pasamos placeholders válidos para
# que la validación pase. Los valores REALES los lee `env.js` desde
# process.env en runtime (Docker los inyecta vía docker-compose).
RUN PUBLIC_DIRECTUS_URL=https://placeholder.invalid \
    DIRECTUS_INTERNAL_URL=http://placeholder.invalid \
    SESSION_COOKIE_SECRET=build-placeholder-secret \
    SESSION_COOKIE_NAME=studio_mb_session \
    PUBLIC_DIRECTUS_STATIC_TOKEN= \
    pnpm build

# ---- Etapa 2: runtime -----------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Solo copiamos el bundle compilado y los manifests para que `pnpm start`
# pueda resolver las deps de runtime (Astro las necesita por require()).
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/.npmrc ./.npmrc
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Reinstalamos solo las deps de producción (omitiendo devDependencies).
RUN corepack enable && \
    pnpm install --prod --frozen-lockfile --ignore-scripts

EXPOSE 4321

# El entrypoint carga el .env desde el host (montado como volumen).
CMD ["node", "./dist/server/entry.mjs"]
