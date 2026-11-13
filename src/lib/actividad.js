// ============================================================================
//  src/lib/actividad.js
// ----------------------------------------------------------------------------
//  Historial de actividad por publicación (colección `actividad`).
//
//  Lo escribe SIEMPRE el servidor con el token estático (los usuarios no
//  tienen permiso de create): así el historial no se puede falsear desde el
//  navegador. La lectura sí va con el JWT del usuario y las policies filtran
//  por cliente.
// ============================================================================

import { directusFetch } from './directus-fetch.js';
import { env } from './env.js';
import { ESTADO_LABEL } from './flujo.js';

/** Etiqueta legible de un estado del flujo. */
export function etiquetaEstado(estado) {
  if (!estado) return '—';
  return ESTADO_LABEL[estado] ?? estado;
}

/**
 * Registra un evento en el historial. Best-effort: si falla, no rompe la
 * operación principal (se loguea un warning).
 *
 * @param {object} ev
 * @param {string} ev.publicacion_id
 * @param {string} [ev.tipo] 'creado'|'estado'|'edicion'|'duplicado'|'sistema'
 * @param {string|null} [ev.detalle]
 * @param {string|null} [ev.estado_anterior]
 * @param {string|null} [ev.estado_nuevo]
 * @param {string|null} [ev.motivo]
 * @param {{id?: string}|null} [ev.usuario]
 * @returns {Promise<boolean>}
 */
export async function registrarActividad({
  publicacion_id,
  tipo = 'sistema',
  detalle = null,
  estado_anterior = null,
  estado_nuevo = null,
  motivo = null,
  usuario = null,
}) {
  if (!publicacion_id) return false;

  const token = env.PUBLIC_DIRECTUS_STATIC_TOKEN;
  if (!token) {
    console.warn('[actividad] falta PUBLIC_DIRECTUS_STATIC_TOKEN; no se registra el evento');
    return false;
  }

  const r = await directusFetch({
    path: '/items/actividad',
    method: 'POST',
    token,
    body: {
      publicacion_id,
      tipo,
      detalle: detalle ?? null,
      estado_anterior: estado_anterior ?? null,
      estado_nuevo: estado_nuevo ?? null,
      motivo: motivo ?? null,
      usuario: usuario?.id ?? null,
    },
  });

  if (!r.ok) {
    console.warn('[actividad] POST falló', r.status, r.raw);
    return false;
  }
  return true;
}

/**
 * Borra el historial de una publicación. Se llama ANTES de borrar el post:
 * la FK de `actividad.publicacion_id` no castea (quedó en SET NULL) y, sin
 * esto, las filas quedarían huérfanas.
 *
 * @param {string} publicacionId
 * @returns {Promise<number>} filas borradas
 */
export async function borrarActividadDe(publicacionId) {
  if (!publicacionId) return 0;
  const token = env.PUBLIC_DIRECTUS_STATIC_TOKEN;
  if (!token) return 0;

  const lista = await directusFetch({
    path: '/items/actividad',
    method: 'GET',
    token,
    search: {
      'filter[publicacion_id][_eq]': publicacionId,
      fields: 'id',
      limit: '-1',
    },
  });
  if (!lista.ok) return 0;

  let borradas = 0;
  for (const fila of lista.data ?? []) {
    const r = await directusFetch({
      path: `/items/actividad/${fila.id}`,
      method: 'DELETE',
      token,
    });
    if (r.ok || r.status === 204) borradas += 1;
  }
  return borradas;
}
