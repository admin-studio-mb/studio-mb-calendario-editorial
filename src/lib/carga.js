// ============================================================================
//  src/lib/carga.js
// ----------------------------------------------------------------------------
//  Cálculo de la carga de trabajo del mes: posts por responsable y por
//  cliente. Sin dependencias de UI para poder testearlo.
// ============================================================================

import { parseFechaPublicacion } from './fecha.js';

/** Clave para publicaciones sin responsable. */
export const SIN_ASIGNAR = '__sin_asignar__';

/** Estados en orden del flujo (para pintar barras y leyendas). */
export const ESTADOS_CARGA = ['borrador', 'revision', 'en_diseno', 'revision_diseno', 'revision_conjunta', 'aprobado', 'publicado'];

/** Estados en los que la pelota está en el tejado del cliente. */
export const ESTADOS_ESPERA_CLIENTE = ['revision', 'revision_diseno', 'revision_conjunta'];

export function esEsperaCliente(estado) {
  return ESTADOS_ESPERA_CLIENTE.includes(estado);
}

/**
 * Días completos desde el último cambio de estado. `estado_desde` lo rellena
 * la página de Carga con la última actividad de tipo `estado`; si no hay
 * historial, se usa `fecha_actualizacion` como aproximación.
 *
 * @param {object} post
 * @param {Date} [ahora]
 * @returns {number|null}
 */
export function diasEnEstado(post, ahora = new Date()) {
  const fecha = parseFechaPublicacion(post?.estado_desde ?? post?.fecha_actualizacion ?? null);
  if (!fecha) return null;
  const ms = ahora.getTime() - fecha.getTime();
  if (!Number.isFinite(ms)) return null;
  return ms <= 0 ? 0 : Math.floor(ms / 86400000);
}

/** Posts cuyo fecha_publicacion cae en el mes del cursor. */
export function postsDelMes(publicaciones, cursor) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  return (publicaciones ?? []).filter((p) => {
    const d = parseFechaPublicacion(p.fecha_publicacion);
    return d && !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
  });
}

function nombreDe(u) {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return n || u?.email || 'Sin nombre';
}

function filaVacia(id, nombre, email) {
  const porEstado = {};
  for (const e of ESTADOS_CARGA) porEstado[e] = 0;
  return {
    id, nombre, email,
    total: 0,
    porEstado,
    esperandoCliente: 0,
    diasEsperando: null,
  };
}

function anotarEspera(fila, post, ahora) {
  const estado = post.estado ?? 'borrador';
  if (!esEsperaCliente(estado)) return;
  fila.esperandoCliente += 1;
  const dias = diasEnEstado(post, ahora);
  if (dias !== null && (fila.diasEsperando === null || dias > fila.diasEsperando)) {
    fila.diasEsperando = dias;
  }
}

/**
 * Resumen por responsable para el mes del cursor.
 * Devuelve solo filas con total > 0, ordenadas de más a menos carga.
 *
 * @param {object[]} publicaciones
 * @param {{id:string,first_name?:string,last_name?:string,email?:string}[]} usuarios
 * @param {Date} cursor
 */
export function resumenPorResponsable(publicaciones, usuarios, cursor, ahora = new Date()) {
  const posts = postsDelMes(publicaciones, cursor);

  const filas = new Map();
  for (const u of usuarios ?? []) {
    filas.set(u.id, filaVacia(u.id, nombreDe(u), u.email ?? null));
  }
  filas.set(SIN_ASIGNAR, filaVacia(SIN_ASIGNAR, 'Sin asignar', null));

  for (const p of posts) {
    const key = p.responsable_id || SIN_ASIGNAR;
    if (!filas.has(key)) {
      // Usuario eliminado o no incluido en la lista del equipo.
      filas.set(key, filaVacia(key, 'Usuario eliminado', null));
    }
    const fila = filas.get(key);
    fila.total += 1;
    const estado = p.estado ?? 'borrador';
    fila.porEstado[estado] = (fila.porEstado[estado] ?? 0) + 1;
    anotarEspera(fila, p, ahora);
  }

  const filasVisibles = [...filas.values()]
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total);

  const esperandoCliente = filasVisibles.reduce((n, f) => n + f.esperandoCliente, 0);
  const diasEsperando = filasVisibles.reduce(
    (max, f) => (f.diasEsperando === null ? max : Math.max(max, f.diasEsperando)),
    null,
  );

  return {
    posts,
    total: posts.length,
    sinAsignar: filas.get(SIN_ASIGNAR).total,
    esperandoCliente,
    diasEsperando,
    filas: filasVisibles,
  };
}

/**
 * Resumen por cliente para el mes del cursor.
 *
 * @param {object[]} publicaciones
 * @param {{id:string,nombre:string}[]} clientes
 * @param {Date} cursor
 */
export function resumenPorCliente(publicaciones, clientes, cursor, ahora = new Date()) {
  const posts = postsDelMes(publicaciones, cursor);
  const nombre = new Map((clientes ?? []).map((c) => [c.id, c.nombre]));

  const filas = new Map();
  for (const p of posts) {
    const key = p.cliente_id ?? '__sin_cliente__';
    if (!filas.has(key)) {
      filas.set(key, {
        id: key,
        nombre: nombre.get(key) ?? 'Sin cliente',
        total: 0,
        sinResponsable: 0,
        esperandoCliente: 0,
        diasEsperando: null,
        porEstado: {},
      });
    }
    const fila = filas.get(key);
    fila.total += 1;
    if (!p.responsable_id) fila.sinResponsable += 1;
    const estado = p.estado ?? 'borrador';
    fila.porEstado[estado] = (fila.porEstado[estado] ?? 0) + 1;
    anotarEspera(fila, p, ahora);
  }

  return [...filas.values()].sort((a, b) => b.total - a.total);
}
