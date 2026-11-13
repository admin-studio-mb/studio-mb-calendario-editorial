// ============================================================================
//  src/lib/aprobacion.js
// ----------------------------------------------------------------------------
//  Enlaces públicos de aprobación: token por publicación + caducidad.
//  El token se guarda como texto plano (32 hex) en `publicaciones.token_aprobacion`
//  y la caducidad como ISO UTC en `aprobacion_expira` (string, para evitar
//  líos de zona horaria).
// ============================================================================

import { randomBytes } from 'node:crypto';

/** Días de validez por defecto de un enlace. */
export const DIAS_APROBACION = 30;

/** Acciones que permite el enlace público. */
export const ACCIONES_PUBLICAS = ['confirmar', 'aprobar', 'cambios'];

/** Token aleatorio de 32 caracteres hex. */
export function generarToken() {
  return randomBytes(16).toString('hex');
}

/** ISO UTC de caducidad a `dias` vista. */
export function fechaExpiracion(dias = DIAS_APROBACION) {
  return new Date(Date.now() + Number(dias) * 86400000).toISOString();
}

/**
 * ¿El enlace del post sigue vigente?
 * Sin caducidad guardada se considera válido (enlaces antiguos).
 *
 * @param {{token_aprobacion?: string|null, aprobacion_expira?: string|null}} post
 * @param {number} [ahora]
 */
export function enlaceValido(post, ahora = Date.now()) {
  if (!post?.token_aprobacion) return false;
  if (!post?.aprobacion_expira) return true;
  const t = new Date(post.aprobacion_expira).getTime();
  return Number.isNaN(t) ? false : t > ahora;
}

/**
 * Estado destino de una acción pública según el estado actual.
 * Devuelve null si la acción no aplica a ese estado.
 *
 * @param {'confirmar'|'aprobar'|'cambios'} accion
 * @param {string} estado
 * @returns {string|null}
 */
export function destinoDeAccion(accion, estado) {
  if (accion === 'confirmar' && estado === 'revision') return 'en_diseno';
  if (accion === 'aprobar' && estado === 'revision_diseno') return 'aprobado';
  if (accion === 'cambios') {
    if (estado === 'revision') return 'borrador';
    if (estado === 'revision_diseno') return 'en_diseno';
  }
  return null;
}

/** ¿La acción exige motivo escrito? */
export function accionExigeMotivo(accion) {
  return accion === 'cambios';
}
