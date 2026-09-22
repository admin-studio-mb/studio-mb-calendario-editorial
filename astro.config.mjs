// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// ----------------------------------------------------------------------------
//  Studio mb · Calendario Editorial
//  Astro 7 + React 19 + Tailwind 4 + Node 24 (adaptador 11). Variables de
//  entorno tipadas vía astro:env (esquema declarado en `env.schema`).
// ----------------------------------------------------------------------------
export default defineConfig({
  // SSR: cada petición se renderiza en servidor.
  output: 'server',
  adapter: node({ mode: 'standalone' }),

  integrations: [
    react(),    // Islas interactivas
  ],

  server: {
    host: '0.0.0.0',
    port: 4321,
  },

  // Desactivamos la dev toolbar de Astro para evitar ruido en consola durante
  // el desarrollo. Se vuelve a activar comentando esta línea.
  devToolbar: {
    enabled: false,
  },

  // Astro hace check de Origin por defecto para POST/PATCH/PUT/DELETE
  // con content-type de form. Cuando el front y el API están en el mismo
  // dominio (caso habitual), no hay que tocar nada. Pero en este proyecto
  // el SSR es un servidor Node escuchando en localhost y la URL pública
  // sale por NPM, así que el Origin puede no coincidir. Lo desactivamos
  // por ahora y añadimos protección CSRF por token más adelante.
  security: {
    checkOrigin: false,
  },

  // Variables tipadas vía astro:env. Lee .env automáticamente.
  env: {
    schema: {
      // Públicas (cliente + servidor)
      PUBLIC_DIRECTUS_URL: envField.string({
        context: 'client',
        access: 'public',
      }),

      // Solo servidor
      DIRECTUS_INTERNAL_URL: envField.string({
        context: 'server',
        access: 'public',
      }),
      SESSION_COOKIE_NAME: envField.string({
        context: 'server',
        access: 'public',
        default: 'studio_mb_session',
      }),
      SESSION_COOKIE_SECRET: envField.string({
        context: 'server',
        access: 'secret',
      }),
      PUBLIC_DIRECTUS_STATIC_TOKEN: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: '',
      }),
    },
  },

  vite: {
    // Tailwind 4 se integra como plugin de Vite. No hace falta el
    // adaptador `@astrojs/tailwind` (que solo soporta Tailwind 3).
    plugins: [tailwindcss()],
    ssr: {
      // El SDK de Directus y date-fns deben externalizarse para que no se
      // intenten empaquetar dentro del bundle SSR de Astro.
      noExternal: [],
      external: ['@directus/sdk', 'date-fns'],
    },
  },
});
