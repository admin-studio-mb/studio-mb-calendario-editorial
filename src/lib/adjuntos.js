// ============================================================================
//  src/lib/adjuntos.js
// ----------------------------------------------------------------------------
//  Adjuntos de los comentarios: [{ id, filename, type }] donde `id` es el uuid
//  de un archivo de Directus (subido con /api/files).
// ============================================================================

/** Máximo de imágenes por comentario. */
export const MAX_ADJUNTOS = 3;

/** Tamaño máximo por archivo YA optimizado (bytes) — 6 MB. */
export const MAX_BYTES_ADJUNTO = 6 * 1024 * 1024;

/** Tamaño máximo del archivo original que aceptamos optimizar — 15 MB. */
export const MAX_BYTES_ENTRADA = 15 * 1024 * 1024;

/** A partir de este tamaño se comprime/redimensiona antes de subir. */
export const UMBRAL_COMPRESION = 400 * 1024;

/** Lado máximo (px) al que se redimensiona una imagen. */
export const MAX_LADO = 2000;

/** Calidad de compresión (0-1) para la imagen reencodeada. */
export const CALIDAD = 0.9;

/** Tipos aceptados en el selector de archivos. */
export const TIPOS_ADJUNTO = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * ¿Merece la pena recomprimir este archivo?
 * Los GIF se dejan intactos (perderían la animación).
 *
 * @param {File|null|undefined} file
 * @returns {boolean}
 */
export function debeComprimir(file) {
  if (!file) return false;
  if (String(file.type ?? '') === 'image/gif') return false;
  return Number(file.size ?? 0) > UMBRAL_COMPRESION;
}

/**
 * Redimensiona (lado máximo MAX_LADO) y recomprime a WebP antes de subir.
 * Devuelve el archivo original si no hace falta o si algo falla: nunca rompe
 * la subida por intentar optimizar.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function comprimirImagen(file) {
  if (!debeComprimir(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', CALIDAD));
    // Si no ha mejorado (o el navegador no soporta WebP), nos quedamos el original.
    if (!blob || blob.size >= file.size) return file;

    const nombre = String(file.name ?? 'imagen').replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], nombre, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

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
