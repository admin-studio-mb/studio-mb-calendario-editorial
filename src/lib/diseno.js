// ============================================================================
//  src/lib/diseno.js
// ----------------------------------------------------------------------------
//  Diseño final de una publicación. Un post normal tiene una imagen
//  (`diseno_final`); un carrusel tiene varias (`diseno_slides`), y la
//  primera hace de portada.
// ============================================================================

export const MAX_DISENO_SLIDES = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Acepta ids de Directus o URLs absolutas. Devuelve null si no vale. */
export function idDiseno(valor) {
  const id = typeof valor === 'object' ? valor?.id : valor;
  if (typeof id !== 'string') return null;
  const limpio = id.trim();
  if (!limpio) return null;
  if (UUID_RE.test(limpio)) return limpio;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  return null;
}

/** Sanea la lista de slides: válidas, sin duplicados y con tope. */
export function normalizarDisenoSlides(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const id = idDiseno(item);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= MAX_DISENO_SLIDES) break;
  }
  return out;
}

/** Imágenes del diseño final en orden: slides o, si no hay, la portada. */
export function disenoImagenes(post) {
  const slides = normalizarDisenoSlides(post?.diseno_slides);
  if (slides.length > 0) return slides;
  const unica = idDiseno(post?.diseno_final);
  return unica ? [unica] : [];
}

/** Portada para la cuadrícula del feed. */
export function disenoPortada(post) {
  return disenoImagenes(post)[0] ?? null;
}
