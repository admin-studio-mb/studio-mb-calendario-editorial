// ============================================================================
//  src/lib/env.js
// ----------------------------------------------------------------------------
//  Acceso tipado a variables de entorno. Astro inyecta PUBLIC_* en el bundle
//  del cliente; el resto solo está disponible en el servidor.
// ============================================================================

const requiredServer = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`[env] Falta la variable de entorno ${key}`);
  return v;
};

export const env = {
  // Públicas (cliente + servidor)
  PUBLIC_DIRECTUS_URL: import.meta.env.PUBLIC_DIRECTUS_URL ?? requiredServer('PUBLIC_DIRECTUS_URL'),

  // Solo servidor
  DIRECTUS_INTERNAL_URL: process.env.DIRECTUS_INTERNAL_URL ?? 'http://studio-mb-directus:8055',
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME ?? 'studio_mb_session',
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET ?? requiredServer('SESSION_COOKIE_SECRET'),
};
