// ============================================================================
//  src/lib/env.js
// ----------------------------------------------------------------------------
//  Fachada de compat sobre `astro:env` (Astro 5+). El esquema vive en
//  astro.config.mjs (env.schema). Aquí re-exportamos para que
//  `import { env } from '../lib/env.js'` siga funcionando en todos los
//  archivos del proyecto.
// ============================================================================

import { PUBLIC_DIRECTUS_URL } from 'astro:env/client';

import {
  DIRECTUS_INTERNAL_URL,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECRET,
  PUBLIC_DIRECTUS_STATIC_TOKEN,
} from 'astro:env/server';

export const env = {
  PUBLIC_DIRECTUS_URL,
  DIRECTUS_INTERNAL_URL,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECRET,
  PUBLIC_DIRECTUS_STATIC_TOKEN,
};
