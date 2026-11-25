// ============================================================================
//  src/lib/actividad-diff.js
// ----------------------------------------------------------------------------
//  Diff legible de una publicación para el historial de actividad.
//
//  El PATCH manda muchos campos aunque no cambien (el formulario envía todo),
//  así que comparamos contra la fila anterior y solo guardamos lo que cambia,
//  con su valor de antes y de después. El detalle se guarda como texto:
//
//      Editado: Copywriting, Fecha de publicación
//      • Copywriting: «Hola» → «Hola y adiós»
//
//  `parseDetalle()` lo vuelve a convertir en datos para pintarlo en el modal.
// ============================================================================

/** Etiquetas visibles de los campos de `publicaciones`. */
export const CAMPOS_LABEL = {
  cliente_id: 'Cliente',
  red: 'Red social',
  responsable_id: 'Responsable',
  tipo_contenido: 'Tipo de contenido',
  formato: 'Formato',
  copywriting: 'Copywriting',
  hashtags: 'Hashtags',
  textos_slides: 'Textos de los slides',
  imagenes_fondo: 'Imágenes de fondo',
  fecha_publicacion: 'Fecha de publicación',
  hora_publicacion: 'Hora de publicación',
  diseno_final: 'Diseño final',
  diseno_slides: 'Diseño final del carrusel',
  estado: 'Estado',
};

/** Tipos de evento de la colección `actividad`. */
export const TIPO_ACTIVIDAD_LABEL = {
  creado: 'Creado',
  estado: 'Cambio de estado',
  edicion: 'Edición',
  duplicado: 'Duplicado',
  sistema: 'Sistema',
};

/** Campos que nunca cuentan como cambio. */
const IGNORAR = new Set(['id', 'motivo_rechazo', 'fecha_creacion', 'fecha_actualizacion']);

export function etiquetaCampo(campo) {
  return CAMPOS_LABEL[campo] ?? campo;
}

function recortar(texto, max) {
  const t = String(texto).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Normaliza para comparar (arrays y objetos por JSON, null y undefined iguales). */
function normalizar(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

export function mismoValor(a, b) {
  return normalizar(a) === normalizar(b);
}

/** Fechas ISO («2026-11-20», «2026-11-20T09:00») → «20 nov 2026, 09:00». */
export function formatearFechaIso(texto) {
  const m = String(texto).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, anio, mes, dia, hora, min] = m;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const base = `${Number(dia)} ${meses[Number(mes) - 1]} ${anio}`;
  return hora ? `${base}, ${hora}:${min}` : base;
}

/** Valor corto y legible para el detalle («—», «sí», «3 elementos», texto recortado). */
export function formatearValor(valor, max = 70) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (Array.isArray(valor)) {
    if (!valor.length) return '—';
    if (valor.every((x) => typeof x !== 'object' || x === null)) return recortar(valor.join(', '), max);
    return `${valor.length} elemento${valor.length === 1 ? '' : 's'}`;
  }
  if (typeof valor === 'object') return `${Object.keys(valor).length} campos`;
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no';
  const fecha = formatearFechaIso(valor);
  if (fecha) return fecha;
  return recortar(valor, max);
}

/**
 * Campos del payload que cambian de verdad respecto a la fila anterior.
 * @returns {{campo:string, etiqueta:string, antes:any, despues:any}[]}
 */
export function diffPublicacion(prev, payload = {}, { ignorar = [] } = {}) {
  const saltar = new Set([...IGNORAR, ...ignorar]);
  const cambios = [];
  for (const [campo, despues] of Object.entries(payload || {})) {
    if (despues === undefined || saltar.has(campo)) continue;
    const antes = prev ? prev[campo] : undefined;
    if (mismoValor(antes, despues)) continue;
    cambios.push({ campo, etiqueta: etiquetaCampo(campo), antes, despues });
  }
  return cambios;
}

/** «Editado: A, B» */
export function resumenCambios(cambios = []) {
  if (!cambios.length) return '';
  return `Editado: ${cambios.map((c) => c.etiqueta).join(', ')}`;
}

/** Texto que se guarda en `actividad.detalle` (resumen + una línea por campo). */
export function textoDetalle(cambios = [], { maxLineas = 12 } = {}) {
  if (!cambios.length) return '';
  const lineas = cambios
    .slice(0, maxLineas)
    .map((c) => `• ${c.etiqueta}: «${formatearValor(c.antes)}» → «${formatearValor(c.despues)}»`);
  return [resumenCambios(cambios), ...lineas].join('\n');
}

/**
 * Convierte el detalle guardado en { resumen, cambios }.
 * Tolera el formato viejo («Editado: cliente_id, red, …» sin líneas).
 */
export function parseDetalle(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return { resumen: '', cambios: [] };

  const [primera, ...resto] = limpio.split('\n');
  const cambios = [];
  for (const linea of resto) {
    const t = linea.trim();
    if (!t.startsWith('•')) continue;
    const m = t.slice(1).trim().match(/^(.*?):\s*«([\s\S]*?)»\s*→\s*«([\s\S]*?)»$/);
    cambios.push(m
      ? { etiqueta: m[1].trim(), antes: m[2], despues: m[3] }
      : { etiqueta: '', antes: '', despues: t.slice(1).trim() });
  }
  return { resumen: primera.trim(), cambios };
}

/** Parte «Editado: cliente_id, red» en etiquetas legibles. */
export function etiquetasDeResumen(resumen) {
  const m = String(resumen ?? '').match(/^Editado:\s*(.+)$/i);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => etiquetaCampo(s.trim()))
    .filter(Boolean);
}

/** Fecha legible si el valor es una fecha ISO; si no, el valor tal cual. */
export function valorLegible(valor) {
  const t = String(valor ?? '').trim();
  return formatearFechaIso(t) ?? t;
}
