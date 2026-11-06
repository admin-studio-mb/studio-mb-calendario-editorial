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

/**
 * Limpia la caché de Directus. Best-effort: si falla, la operación sigue.
 *
 * @param {string|null} token  JWT del usuario (hace falta permiso de sistema).
 * @returns {Promise<boolean>} true si se limpió.
 */
export async function clearDirectusCache(token) {
  if (!token) return false;
  try {
    const r = await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
    return r.ok;
  } catch (err) {
    console.warn('[cache] no se pudo limpiar la caché de Directus:', err?.message ?? err);
    return false;
  }
}
