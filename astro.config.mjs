// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// ----------------------------------------------------------------------------
//  Studio mb · Calendario Editorial
//  Astro en modo SSR con adaptador de Node. Solo las páginas que lo necesiten
//  harán `prerender = false`. Por defecto todo se renderiza en servidor para
//  poder leer cookies y datos autenticados de Directus.
// ----------------------------------------------------------------------------
export default defineConfig({
  // SSR: cada petición se renderiza en servidor.
  output: 'server',
  adapter: node({ mode: 'standalone' }),

  integrations: [
    react(),    // Islas interactivas
    tailwind(), // Utilidades CSS
  ],

  server: {
    host: '0.0.0.0',
    port: 4321,
  },

  vite: {
    ssr: {
      // El SDK de Directus y date-fns deben externalizarse para que no se
      // intenten empaquetar dentro del bundle SSR de Astro.
      noExternal: [],
      external: ['@directus/sdk', 'date-fns'],
    },
  },
});
