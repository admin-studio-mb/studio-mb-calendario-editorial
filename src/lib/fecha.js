// ============================================================================
//  src/lib/fecha.js
// ----------------------------------------------------------------------------
//  ÚNICA fuente de verdad para el manejo de fechas de publicación.
//
//  ─── El invariante ────────────────────────────────────────────────────────
//  `publicaciones.fecha_publicacion` se guarda en Postgres como
//  `timestamp without time zone` y SIEMPRE representa la HORA DE PARED
//  (hora local de la agencia, Europe/Madrid) de la publicación.
//
//  Ejemplo: el usuario elige el 15/12/2026 a las 09:00.
//    → se envía  "2026-12-15T09:00:00"   (naive, sin Z, sin offset)
//    → se guarda "2026-12-15 09:00:00"
//    → se lee    "2026-12-15T09:00:00"
//    → se pinta  15/12/2026 09:00        ✓
//
//  ─── Por qué hace falta ───────────────────────────────────────────────────
//  Si el navegador mandase `toISOString()` (UTC con "Z"), Directus guardaría
//  la hora UTC (08:00 en invierno, 07:00 en verano por el cambio de hora) y
//  el calendario mostraría esa hora, no la que eligió el usuario.
//
//  ─── Funciones ────────────────────────────────────────────────────────────
//  · toISOlocal(date)             → naive local (lo que MANDA el navegador)
//  · normalizarFechaPublicacion()  → server-side: acepta naive o con offset
//  · parseFechaPublicacion()      → Date local para pintar/agrupar
// ============================================================================

/** Zona horaria de referencia de la agencia (los usuarios están en Madrid). */
export const AGENCIA_TZ = 'Europe/Madrid';

// Formateador cacheado: construir un Intl.DateTimeFormat es caro.
let _fmtMadrid = null;
function fmtMadrid() {
  if (!_fmtMadrid) {
    _fmtMadrid = new Intl.DateTimeFormat('sv-SE', {
      timeZone: AGENCIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  }
  return _fmtMadrid;
}

const NAIVE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * ¿El string es una fecha naive (sin zona horaria)?
 * @param {unknown} value
 * @returns {boolean}
 */
export function esNaive(value) {
  return typeof value === 'string' && NAIVE_RE.test(value.trim());
}

/**
 * Convierte un Date a la representación naive de hora local del navegador.
 * Es lo que se envía a Directus.
 *
 * @param {Date} date
 * @returns {string} "YYYY-MM-DDTHH:mm:ss"
 */
export function toISOlocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const p = (n, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

/**
 * Convierte un instante (con zona) a la hora de pared de la agencia.
 * "2026-12-15T08:00:00.000Z" → "2026-12-15T09:00:00" (Madrid en invierno).
 *
 * @param {Date} date
 * @returns {string}
 */
export function toISOAgencia(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  // sv-SE produce "YYYY-MM-DD HH:mm:ss"
  const s = fmtMadrid().format(date).replace(' ', 'T');
  return s.length === 19 ? s : `${s}:00`;
}

/**
 * Normaliza un valor de fecha entrante al formato naive de la agencia.
 *
 * - Si viene naive ("2026-12-15T09:00:00") → se devuelve tal cual, es la
 *   hora de pared que el usuario eligió.
 * - Si viene con offset/Z ("2026-12-15T08:00:00.000Z") → se convierte a la
 *   hora de la agencia, porque el instante es correcto pero la representación
 *   naive no.
 * - Si es inválido → null.
 *
 * @param {unknown} valor
 * @returns {string|null}
 */
export function normalizarFechaPublicacion(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'string') {
    const v = valor.trim();
    if (esNaive(v)) {
      // Normalizamos "YYYY-MM-DD" → "YYYY-MM-DDT00:00:00"
      const soloFecha = /^(\d{4}-\d{2}-\d{2})$/.exec(v);
      if (soloFecha) return `${v}T00:00:00`;
      return v.replace(' ', 'T').length === 16 ? `${v.replace(' ', 'T')}:00` : v.replace(' ', 'T');
    }
  }

  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return toISOAgencia(d);
}

/**
 * Parsea la fecha de publicación a un Date en hora local, para pintar y
 * agrupar por día.
 *
 * - Naive → se interpreta como hora local (comportamiento de `parseISO`).
 * - Con offset → se convierte a hora local del navegador.
 *
 * @param {unknown} valor
 * @returns {Date|null}
 */
export function parseFechaPublicacion(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  if (typeof valor === 'string') {
    const v = valor.trim();
    if (esNaive(v)) {
      // 'YYYY-MM-DD' es UTC según la spec; lo convertimos a local explícitamente.
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, d] = v.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      const [fecha, hora] = v.replace(' ', 'T').split('T');
      const [y, mo, d] = fecha.split('-').map(Number);
      const [h, mi, s] = (hora || '00:00:00').split(':').map(Number);
      return new Date(y, mo - 1, d, h || 0, mi || 0, s || 0, 0);
    }
  }

  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compara dos valores de fecha de publicación (ambos naive o con offset).
 * Útil para filtrar por mes/rango sin demonios de zona horaria.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} -1 | 0 | 1
 */
export function compararFechas(a, b) {
  const da = parseFechaPublicacion(a);
  const db = parseFechaPublicacion(b);
  if (!da && !db) return 0;
  if (!da) return -1;
  if (!db) return 1;
  return da.getTime() - db.getTime();
}
