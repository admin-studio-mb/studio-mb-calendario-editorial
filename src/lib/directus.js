// ============================================================================
//  src/lib/directus.js
// ----------------------------------------------------------------------------
//  Cliente del SDK de Directus con dos fábricas:
//    - getPublicClient()  → para uso desde el navegador (islas React) sin auth.
//    - getAuthedClient()  → para uso en SSR con la cookie del usuario.
//
//  Todas las claves se leen desde `import.meta.env` (Astro las inyecta desde
//  .env en build/runtime). Ningún secreto se expone al cliente.
// ============================================================================

import { createDirectus, rest, authentication, withToken } from '@directus/sdk';
import { env } from './env.js';

/**
 * Cliente REST "público" — sin token. Solo lectura de datos marcados como
 * públicos en Directus. Útil desde el navegador para islas React.
 */
export function getPublicClient() {
  return createDirectus(env.PUBLIC_DIRECTUS_URL)
    .with(rest())
    .with(authentication('json', { autoRefresh: false }));
}

/**
 * Cliente autenticado en SSR: recibe el JWT del usuario desde la cookie.
 * Se usa dentro de páginas .astro y endpoints /api/*.
 *
 * @param {string|null} token  JWT de Directus o null si no hay sesión.
 */
export function getAuthedClient(token) {
  const client = createDirectus(env.PUBLIC_DIRECTUS_URL).with(rest());

  if (!token) return client;

  // Envolvemos cada petición añadiendo el header Authorization manualmente,
  // porque la composición .with(authentication()) intenta refrescar el token
  // automáticamente y eso rompe en SSR.
  return {
    request: async (args) => {
      args.headers = { ...(args.headers ?? {}), ...withToken(token).headers };
      return client.request(args);
    },
    with: () => client, // Compatibilidad mínima con la API encadenada.
    get $fetch() { return client.$fetch; },
  };
}

/**
 * Helper: extrae el token JWT guardado en la cookie por /api/auth/login.
 * Lo usan las páginas .astro en el frontmatter para llamar a Directus.
 *
 * @param {import('astro').AstroCookies} cookies
 */
export function getTokenFromCookies(cookies) {
  const name = env.SESSION_COOKIE_NAME;
  const c = cookies.get(name);
  return c?.value ?? null;
}
