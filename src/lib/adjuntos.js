// ============================================================================
//  src/lib/adjuntos.js
// ----------------------------------------------------------------------------
//  Adjuntos de los comentarios: [{ id, filename, type }] donde `id` es el uuid
//  de un archivo de Directus (subido con /api/files).
// ============================================================================

/** Máximo de imágenes por comentario. */
export const MAX_ADJUNTOS = 3;

/** Tamaño máximo por archivo (bytes) — 6 MB. */
export const MAX_BYTES_ADJUNTO = 6 * 1024 * 1024;

/** Tipos aceptados en el selector de archivos. */
export const TIPOS_ADJUNTO = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Valida y sanea una lista de adjuntos venida del cliente.
 * Descarta elementos sin id, recorta textos y limita a MAX_ADJUNTOS.
 *
 * @param {unknown} raw
 * @returns {{id: string, filename: string|null, type: string|null}[]}
 */
export function normalizarAdjuntos(raw) {
  if (!Array.isArray(raw)) return [];

  const out = [];
  const vistos = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      id,
      filename: item.filename ? String(item.filename).slice(0, 200) : null,
      type: item.type ? String(item.type).slice(0, 100) : null,
    });
    if (out.length >= MAX_ADJUNTOS) break;
  }
  return out;
}

/** URL de miniatura de un archivo de Directus. */
export function urlAdjunto(id, width = 480, height = 480) {
  if (!id) return null;
  return `/api/assets/${id}?width=${width}&height=${height}&fit=cover&quality=80`;
}

/** URL del archivo original. */
export function urlAdjuntoOriginal(id) {
  if (!id) return null;
  return `/api/assets/${id}`;
}
