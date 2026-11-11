// ============================================================================
//  src/lib/cache.js
// ----------------------------------------------------------------------------
//  Invalidación de la caché de Directus.
//
//  Directus 12 cachea las consultas GET en Redis. **NO invalida la caché al
//  crear/actualizar/borrar items** (comprobado en producción: tras un POST a
//  /items/comentarios, el GET siguiente devolvía la lista ANTIGUA durante
//  minutos).
//
//  ⚠️ Los parámetros tipo `?t=<timestamp>` NO sirven como cache-buster:
//  Directus calcula la clave de caché sobre la query NORMALIZADA e ignora
//  los parámetros extra (comprobado: `?t=`, `?_=` y ambos a la vez
//  devolvieron la lista cacheada; sólo `POST /utils/cache/clear` la
//  invalidó). Por eso `clearDirectusCache()` es obligatorio tras cada
//  mutación, no opcional.
//
//  Para los listados que deben ser frescos sin poder limpiar caché (p.ej.
//  el SSR inicial), la alternativa es `cache: 'no-store'` en el fetch, que
//  sólo afecta al cache HTTP intermedio, NO al de Directus.
// ============================================================================

import { directusFetch } from './directus-fetch.js';
import { env } from './env.js';

/**
 * Limpia la caché de Directus. Best-effort: si falla, la operación sigue.
 *
 * `/utils/cache/clear` exige permisos de administrador: el token de un
 * Cliente o Editor devuelve 403 y la caché quedaría sucia. Por eso, si hay
 * `PUBLIC_DIRECTUS_STATIC_TOKEN` (admin, server-side), se usa siempre ése.
 *
 * @param {string|null} token  JWT del usuario (fallback si no hay estático).
 * @returns {Promise<boolean>} true si se limpió.
 */
export async function clearDirectusCache(token) {
  const t = env.PUBLIC_DIRECTUS_STATIC_TOKEN || token;
  if (!t) return false;
  try {
    const r = await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token: t,
      search: { system: 'true' },
    });
    if (!r.ok) {
      console.warn('[cache] cache/clear respondió', r.status);
    }
    return r.ok;
  } catch (err) {
    console.warn('[cache] no se pudo limpiar la caché de Directus:', err?.message ?? err);
    return false;
  }
}
