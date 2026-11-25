// ============================================================================
//  src/lib/flujo.js
// ----------------------------------------------------------------------------
//  Flujo editorial y qué transiciones puede hacer cada rol.
//
//  Flujo normal:
//    borrador → revision → en_diseno → revision_diseno → aprobado → publicado
//
//  Atajo de revisión conjunta (texto y diseño a la vez):
//    borrador / revision / en_diseno → revision_conjunta → aprobado
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


export const ESTADOS = [
  'borrador',
  'revision',
  'en_diseno',
  'revision_diseno',
  'revision_conjunta',
  'aprobado',
  'publicado',
];

export const ESTADO_LABEL = {
  borrador: 'Borrador',
  revision: 'Revisión texto',
  en_diseno: 'En diseño',
  revision_diseno: 'Revisión diseño',
  revision_conjunta: 'Revisión conjunta',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
};

function idDe(valor) {
  return typeof valor === 'object' ? valor?.id : valor;
}

function slidesDe(post) {
  let slides = post?.diseno_slides;
  if (typeof slides === 'string') {
    try { slides = JSON.parse(slides); } catch { slides = []; }
  }
  return Array.isArray(slides) ? slides : [];
}

/** ¿La publicación tiene algún diseño final (imagen única o carrusel)? */
export function tieneDiseno(post) {
  if (idDe(post?.diseno_final)) return true;
  return slidesDe(post).some((slide) => Boolean(idDe(slide)));
}

/**
 * ¿Se puede enviar a revisión conjunta? Hace falta copy y algún diseño.
 * No vale una propuesta sin diseño: el cliente tiene que poder aprobar
 * el texto y el diseño de verdad.
 */
export function puedeRevisionConjunta(post) {
  return Boolean(String(post?.copywriting ?? '').trim()) && tieneDiseno(post);
}

/**
 * Transiciones del flujo completo (equipo).
 * `tono` mapea a clases Tailwind en EditPostModal.
 * `requiereConjunta` se comprueba con la publicación cuando está disponible.
 */
export const TRANSICIONES = {
  borrador: [
    { to: 'revision', label: 'Enviar a revisión de texto →', tono: 'blue' },
    {
      to: 'revision_conjunta',
      label: 'Enviar a revisión conjunta →',
      tono: 'indigo',
      requiereConjunta: true,
    },
  ],
  revision: [
    { to: 'en_diseno', label: '✓ Confirmar texto → Pasar a diseño', tono: 'purple' },
    {
      to: 'revision_conjunta',
      label: 'Pasar a revisión conjunta →',
      tono: 'indigo',
      requiereConjunta: true,
    },
    { to: 'borrador', label: 'Pedir cambios de texto', tono: 'amber' },
  ],
  en_diseno: [
    { to: 'revision_diseno', label: 'Enviar diseño a revisión →', tono: 'pink' },
    {
      to: 'revision_conjunta',
      label: 'Enviar a revisión conjunta →',
      tono: 'indigo',
      requiereConjunta: true,
    },
  ],
  revision_conjunta: [
    { to: 'aprobado', label: '✓ Aprobar texto y diseño', tono: 'emerald' },
    { to: 'borrador', label: 'Pedir cambios de texto', tono: 'amber' },
    { to: 'en_diseno', label: 'Pedir cambios de diseño', tono: 'amber' },
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
  'revision_conjunta>aprobado',
  'revision_conjunta>borrador',
  'revision_conjunta>en_diseno',
]);

/**
 * Transiciones que puede ejecutar `user` desde `estado`.
 * Si se pasa la publicación, se ocultan las que no aplican (por ejemplo,
 * revisión conjunta sin diseño final).
 *
 * @returns {Array<{to: string, label: string, tono: string}>}
 */
export function transicionesPermitidas(estado, user, publicacion = null) {
  let todas = TRANSICIONES[estado] ?? [];
  if (publicacion) {
    todas = todas.filter((t) => !t.requiereConjunta || puedeRevisionConjunta(publicacion));
  }
  if (!esCliente(user)) return todas;
  return todas.filter((t) => TRANSICIONES_CLIENTE.has(`${estado}>${t.to}`));
}

/**
 * ¿Puede `user` mover una publicación de `desde` a `hacia`?
 * `publicacion` es opcional; si se pasa, también se valida el requisito de
 * revisión conjunta.
 */
export function transicionPermitida(desde, hacia, user, publicacion = null) {
  const transicion = (TRANSICIONES[desde] ?? []).find((t) => t.to === hacia);
  if (!transicion) return false;
  if (transicion.requiereConjunta && publicacion && !puedeRevisionConjunta(publicacion)) {
    return false;
  }
  if (!esCliente(user)) return true;
  return TRANSICIONES_CLIENTE.has(`${desde}>${hacia}`);
}
