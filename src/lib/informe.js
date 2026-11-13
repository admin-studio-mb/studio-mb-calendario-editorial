// ============================================================================
//  src/lib/informe.js
// ----------------------------------------------------------------------------
//  Utilidades del PDF mensual: rango del mes y nombre de archivo.
// ============================================================================

/**
 * Parsea "YYYY-MM" y devuelve el rango naive del mes (hora de pared).
 * @param {string} valor
 * @returns {{year:number, month:number, desde:string, hasta:string, label:string}|null}
 */
export function parseMes(valor) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(valor ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;

  const mm = String(month).padStart(2, '0');
  const ultimo = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });

  return {
    year,
    month,
    desde: `${year}-${mm}-01T00:00:00`,
    hasta: `${year}-${mm}-${String(ultimo).padStart(2, '0')}T23:59:59`,
    label,
  };
}

/** ¿La fecha naive cae dentro del rango? (comparación lexicográfica ISO). */
export function dentroDelRango(fecha, desde, hasta) {
  const f = String(fecha ?? '').replace(' ', 'T');
  if (!f) return false;
  return f >= desde && f <= hasta;
}

/** Slug sencillo para nombres de archivo. */
export function slug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'cliente';
}

/** Nombre del PDF: calendario-<cliente>-<yyyy>-<mm>.pdf */
export function nombreArchivo(clienteNombre, year, month) {
  return `calendario-${slug(clienteNombre)}-${year}-${String(month).padStart(2, '0')}.pdf`;
}

/** Etiqueta corta de estado para el PDF. */
export const ESTADO_PDF = {
  borrador: 'Borrador',
  revision: 'Revisión texto',
  en_diseno: 'En diseño',
  revision_diseno: 'Revisión diseño',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
};
