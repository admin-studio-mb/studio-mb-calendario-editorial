// ============================================================================
//  src/lib/env.js
// ----------------------------------------------------------------------------
//  Acceso tipado a variables de entorno. Combina:
//    - `astro:env` para validación de tipos/valores en build y dev.
//    - `process.env` en runtime (Node lee el env real del contenedor).
//
//  Por qué este patrón:
//    Astro 7 inlinea las vars de `context: 'server'` en el bundle SSR
//    durante el build (con el valor que vio entonces). En Docker eso
//    significa que el valor placeholder del build-time se queda congelado
//    y runtime ignora process.env. Para evitarlo, leemos process.env
//    directamente en producción (NODE_ENV=production) y dejamos que
//    astro:env haga la validación solo en build/dev.
//
//  El esquema de validación sigue en astro.config.mjs (env.schema).
// ============================================================================

import { PUBLIC_DIRECTUS_URL as _PUBLIC } from 'astro:env/client';

import {
  DIRECTUS_INTERNAL_URL as _DIURL,
  SESSION_COOKIE_NAME as _SCN,
  SESSION_COOKIE_SECRET as _SCS,
  PUBLIC_DIRECTUS_STATIC_TOKEN as _PST,
} from 'astro:env/server';

// En producción, priorizamos process.env (que es lo que ve Node al arrancar
// el contenedor). En dev, usamos astro:env porque tiene fallbacks útiles.
const isProd = process.env.NODE_ENV === 'production';

const pick = (astroValue, envName, fallback) => {
  if (isProd) {
    const v = process.env[envName];
    if (v !== undefined && v !== '') return v;
    // Si falta en process.env pero astro:env tiene valor, úsalo como
    // fallback (caso atípico, pero evita NPE silencioso).
    if (astroValue !== undefined && astroValue !== '') return astroValue;
    return fallback;
  }
  // Dev / build: astro:env manda.
  if (astroValue !== undefined && astroValue !== '') return astroValue;
  return process.env[envName] ?? fallback;
};

export const env = {
  PUBLIC_DIRECTUS_URL: pick(_PUBLIC, 'PUBLIC_DIRECTUS_URL', 'https://cms.studiomb.es'),
  DIRECTUS_INTERNAL_URL: pick(_DIURL, 'DIRECTUS_INTERNAL_URL', 'http://studio-mb-directus:8055'),
  SESSION_COOKIE_NAME: pick(_SCN, 'SESSION_COOKIE_NAME', 'studio_mb_session'),
  SESSION_COOKIE_SECRET: pick(_SCS, 'SESSION_COOKIE_SECRET', ''),
  PUBLIC_DIRECTUS_STATIC_TOKEN: pick(_PST, 'PUBLIC_DIRECTUS_STATIC_TOKEN', ''),
};
