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
export const ESTADOS_CARGA = ['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado'];

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
  return { id, nombre, email, total: 0, porEstado };
}

/**
 * Resumen por responsable para el mes del cursor.
 * Devuelve solo filas con total > 0, ordenadas de más a menos carga.
 *
 * @param {object[]} publicaciones
 * @param {{id:string,first_name?:string,last_name?:string,email?:string}[]} usuarios
 * @param {Date} cursor
 */
export function resumenPorResponsable(publicaciones, usuarios, cursor) {
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
  }

  const filasVisibles = [...filas.values()]
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    posts,
    total: posts.length,
    sinAsignar: filas.get(SIN_ASIGNAR).total,
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
export function resumenPorCliente(publicaciones, clientes, cursor) {
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
      });
    }
    const fila = filas.get(key);
    fila.total += 1;
    if (!p.responsable_id) fila.sinResponsable += 1;
  }

  return [...filas.values()].sort((a, b) => b.total - a.total);
}
