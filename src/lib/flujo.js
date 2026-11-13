// ============================================================================
//  src/lib/flujo.js
// ----------------------------------------------------------------------------
//  Flujo editorial de 6 estados y qué transiciones puede hacer cada rol.
//
//  Estados:
//    borrador → revision → en_diseno → revision_diseno → aprobado → publicado
//
//  El rol `Cliente` solo puede CONFIRMAR (texto y diseño final); no puede
//  crear, editar contenido, borrar ni marcar como publicado. El equipo
//  (Administrator y Editor) puede recorrer todo el flujo.
//
//  Este módulo es la fuente única: lo usan el modal (UI) y los endpoint
//  PATCH /api/publicaciones/:id (validación en servidor).
// ============================================================================

import { esCliente } from './roles.js';

export { esCliente };


export const ESTADOS = ['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado'];

export const ESTADO_LABEL = {
  borrador: 'Borrador',
  revision: 'Revisión texto',
  en_diseno: 'En diseño',
  revision_diseno: 'Revisión diseño',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
};

/**
 * Transiciones del flujo completo (equipo).
 * `tono` mapea a clases Tailwind en EditPostModal.
 */
export const TRANSICIONES = {
  borrador: [
    { to: 'revision', label: 'Enviar a revisión de texto →', tono: 'blue' },
  ],
  revision: [
    { to: 'en_diseno', label: '✓ Confirmar texto → Pasar a diseño', tono: 'purple' },
    { to: 'borrador', label: 'Pedir cambios de texto', tono: 'amber' },
  ],
  en_diseno: [
    { to: 'revision_diseno', label: 'Enviar diseño a revisión →', tono: 'pink' },
  ],
  revision_diseno: [
    { to: 'aprobado', label: '✓ Aprobar publicación final', tono: 'emerald' },
    { to: 'en_diseno', label: 'Pedir cambios de diseño', tono: 'amber' },
  ],
  aprobado: [
    { to: 'publicado', label: '✓ Marcar como publicado', tono: 'teal' },
  ],
  publicado: [],
};

/** Transiciones que puede ejecutar el rol Cliente: solo confirmaciones. */
const TRANSICIONES_CLIENTE = new Set([
  'revision>en_diseno',
  'revision>borrador',
  'revision_diseno>aprobado',
  'revision_diseno>en_diseno',
]);

/**
 * Transiciones que puede ejecutar `user` desde `estado`.
 * @returns {Array<{to: string, label: string, tono: string}>}
 */
export function transicionesPermitidas(estado, user) {
  const todas = TRANSICIONES[estado] ?? [];
  if (!esCliente(user)) return todas;
  return todas.filter((t) => TRANSICIONES_CLIENTE.has(`${estado}>${t.to}`));
}

/**
 * ¿Puede `user` mover una publicación de `desde` a `hacia`?
 */
export function transicionPermitida(desde, hacia, user) {
  const existe = (TRANSICIONES[desde] ?? []).some((t) => t.to === hacia);
  if (!existe) return false;
  if (!esCliente(user)) return true;
  return TRANSICIONES_CLIENTE.has(`${desde}>${hacia}`);
}
