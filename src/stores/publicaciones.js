// ============================================================================
//  src/stores/publicaciones.js
// ----------------------------------------------------------------------------
//  Store global reactivo compartido por las islas del dashboard (Calendar,
//  FeedMockup, PostForm, CommentThread, futuras). Cualquier isla puede
//  suscribirse y se re-renderiza al cambiar.
//
//  Patrón:
//    - El SSR inyecta el array inicial en `window.__PUBLICACIONES__` y llama
//      a `hydratePublicaciones()`.
//    - Las islas leen con `useStore(publicacionesStore)` de @nanostores/react.
//    - Para añadir, basta `publicacionesStore.set([...current, newItem])`.
//    - `resetPublicaciones()` vacía el store (p.ej. al cerrar sesión).
// ============================================================================

import { atom } from 'nanostores';

/**
 * @typedef {object} Publicacion
 * @property {string} id
 * @property {string} cliente_id
 * @property {string} [tipo_contenido]
 * @property {string} [formato]
 * @property {string} [copywriting]
 * @property {string[]} [hashtags]
 * @property {string} [textos_slides]
 * @property {(string|{id:string})[]} [imagenes_fondo]
 * @property {string} [fecha_publicacion]      ISO 8601
 * @property {string} [estado]
 * @property {{id: string}} [diseno_final]
 */

/** @type {import('nanostores').WritableAtom<Publicacion[]>} */
export const publicacionesStore = atom([]);

/**
 * Llamado desde el SSR (dashboard/index.astro) tras hidratar la página.
 * Reemplaza el contenido del store con el array de publicaciones que vino
 * del backend.
 *
 * @param {Publicacion[]} initial
 */
export function hydratePublicaciones(initial) {
  publicacionesStore.set(Array.isArray(initial) ? initial : []);
}

/**
 * Añade una publicación al store. Usado por PostForm tras un POST exitoso
 * para que el calendario se actualice al instante sin recargar.
 *
 * @param {Publicacion} pub
 */
export function addPublicacion(pub) {
  const current = publicacionesStore.get();
  publicacionesStore.set([...current, pub]);
}

/**
 * Reemplaza una publicación existente (mismo id). Útil para edición.
 *
 * @param {Publicacion} pub
 */
export function updatePublicacion(pub) {
  const current = publicacionesStore.get();
  publicacionesStore.set(current.map((p) => (p.id === pub.id ? { ...p, ...pub } : p)));
}

/**
 * Elimina una publicación del store.
 *
 * @param {string} id
 */
export function removePublicacion(id) {
  const current = publicacionesStore.get();
  publicacionesStore.set(current.filter((p) => p.id !== id));
}

/**
 * Vacía el store. Llamar en logout.
 */
export function resetPublicaciones() {
  publicacionesStore.set([]);
}
