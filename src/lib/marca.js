// ============================================================================
//  src/lib/marca.js
// ----------------------------------------------------------------------------
//  Marca blanca por cliente: color principal y escala de tonos derivada.
// ============================================================================

/** Morado de Studio mb (por defecto). */
export const MARCA_DEFECTO = '#4f46e5';

/** Valida y normaliza un hex de 6 dígitos ("#4F46E5" → "#4f46e5"). */
export function normalizarHex(valor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(valor ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function hexARgb(hex) {
  const h = normalizarHex(hex) ?? MARCA_DEFECTO;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbAHex(rgb) {
  return `#${rgb.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla `hex` con blanco (peso 0-1) o con negro (peso negativo). */
export function mezclar(hex, peso) {
  const [r, g, b] = hexARgb(hex);
  const objetivo = peso >= 0 ? 255 : 0;
  const p = Math.abs(peso);
  return rgbAHex([r, g, b].map((c) => c + (objetivo - c) * p));
}

/**
 * Escala de marca (50..900) a partir del color principal, imitando la
 * progresión de Tailwind: 600 es el color base.
 *
 * @param {string} color
 * @returns {Record<number, string>}
 */
export function escalaMarca(color) {
  const base = normalizarHex(color) ?? MARCA_DEFECTO;
  return {
    50: mezclar(base, 0.92),
    100: mezclar(base, 0.84),
    200: mezclar(base, 0.68),
    300: mezclar(base, 0.48),
    400: mezclar(base, 0.25),
    500: mezclar(base, 0.12),
    600: base,
    700: mezclar(base, -0.18),
    800: mezclar(base, -0.35),
    900: mezclar(base, -0.5),
  };
}

/** Variables CSS para inyectar en el <body> (solo cuando hay marca). */
export function marcaVars(color) {
  const escala = escalaMarca(color);
  return Object.entries(escala)
    .map(([tono, hex]) => `--color-brand-${tono}: ${hex}`)
    .join('; ');
}

/** Texto de color de contraste (blanco o casi negro) para fondos de marca. */
export function textoSobre(color) {
  const [r, g, b] = hexARgb(color);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? '#131418' : '#ffffff';
}
