// ============================================================================
//  src/lib/duplicar.js
// ----------------------------------------------------------------------------
//  Duplicar una publicación: copia el contenido editorial (copy, hashtags,
//  slides, red, tipo y formato) a una fecha nueva.
//
//  Reglas:
//  - El duplicado nace en `borrador` (nunca hereda el estado del original).
//  - El diseño final NO se copia (es una pieza gráfica única).
//  - La fecha se calcula en hora de pared naive (Europa/Madrid), sin `Z`
//    (AGENTS.md §6.8).
// ============================================================================

import { parseFechaPublicacion, normalizarFechaPublicacion, toISOlocal } from './fecha.js';

/** Días que se suman por defecto al duplicar (misma franja semanal). */
export const DIAS_DUPLICADO = 7;

/**
 * Fecha propuesta para el duplicado: la del original + `dias`.
 *
 * @param {{fecha_publicacion?: string}} post
 * @param {number} [dias]
 * @returns {string|null} "YYYY-MM-DDTHH:mm:ss" naive
 */
export function fechaDuplicado(post, dias = DIAS_DUPLICADO) {
  const base = parseFechaPublicacion(post?.fecha_publicacion);
  const d = base && !Number.isNaN(base.getTime()) ? new Date(base.getTime()) : new Date();
  d.setDate(d.getDate() + (Number(dias) || 0));
  return normalizarFechaPublicacion(toISOlocal(d));
}

/**
 * Payload para POST /api/publicaciones a partir de un post existente.
 * Omite `estado` (el endpoint pone `borrador`) y `diseno_final`.
 *
 * @param {object} post
 * @param {string} fechaISO
 * @returns {object|null}
 */
export function payloadDuplicado(post, fechaISO) {
  if (!post || typeof post !== 'object') return null;

  const clienteId = typeof post.cliente_id === 'object'
    ? post.cliente_id?.id
    : post.cliente_id;

  return {
    cliente_id: clienteId ?? null,
    red: post.red ?? null,
    tipo_contenido: post.tipo_contenido ?? null,
    formato: post.formato ?? 'post',
    copywriting: post.copywriting ?? null,
    hashtags: Array.isArray(post.hashtags) ? [...post.hashtags] : [],
    textos_slides: post.textos_slides ?? null,
    imagenes_fondo: Array.isArray(post.imagenes_fondo)
      ? post.imagenes_fondo.map((s) => (s && typeof s === 'object' ? { ...s } : s))
      : [],
    fecha_publicacion: normalizarFechaPublicacion(fechaISO),
    // Marca para que el servidor registre "duplicado" en el historial.
    origen: 'duplicado',
  };
}
