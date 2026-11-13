// ============================================================================
//  src/lib/textos.js
// ----------------------------------------------------------------------------
//  Utilidades de texto para copiar/publicar: hashtags normalizados y el texto
//  completo de una publicación (copy + hashtags).
// ============================================================================

/**
 * Convierte hashtags (array o string separado por comas/espacios) en una
 * cadena limpia: cada uno con "#", sin duplicados (case-insensitive) y
 * separados por un espacio.
 *
 * @param {unknown} valor
 * @returns {string}
 */
export function hashtagsACadena(valor) {
  const lista = Array.isArray(valor)
    ? valor
    : String(valor ?? '').split(/[,\s]+/);

  const vistos = new Set();
  const salida = [];
  for (const raw of lista) {
    let h = String(raw ?? '').trim();
    if (!h) continue;
    if (!h.startsWith('#')) h = `#${h}`;
    const clave = h.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(h);
  }
  return salida.join(' ');
}

/**
 * Texto listo para pegar en la red social: copy + línea en blanco + hashtags.
 *
 * @param {unknown} copy
 * @param {unknown} hashtags
 * @returns {string}
 */
export function textoPublicacion(copy, hashtags) {
  const c = String(copy ?? '').trim();
  const h = hashtagsACadena(hashtags);
  return [c, h].filter(Boolean).join('\n\n');
}
