// ============================================================================
//  src/lib/efemerides.js
// ----------------------------------------------------------------------------
//  Efemérides y fechas clave: se repiten cada año (día/mes), con un ámbito
//  (España, Cataluña, marketing o propia) que define su color.
// ============================================================================

export const AMBITOS = {
  espana: { label: 'España', dot: 'bg-red-400', chip: 'bg-red-50 text-red-700 border-red-200' },
  cataluna: { label: 'Cataluña', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  marketing: { label: 'Marketing', dot: 'bg-brand-500', chip: 'bg-brand-50 text-brand-700 border-brand-200' },
  propia: { label: 'Propia', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export const AMBITOS_VALIDOS = Object.keys(AMBITOS);

/** Color (clase Tailwind) del punto de una efeméride. */
export function colorDeAmbito(ambito) {
  return (AMBITOS[ambito] ?? AMBITOS.propia).dot;
}

/**
 * Efemérides de un mes (1-12), ordenadas por día.
 *
 * @param {{dia:number,mes:number,nombre:string,ambito?:string}[]} items
 * @param {number} mes 1-12
 */
export function efemeridesDelMes(items, mes) {
  return (items ?? [])
    .filter((e) => Number(e?.mes) === Number(mes))
    .sort((a, b) => Number(a.dia) - Number(b.dia) || String(a.nombre).localeCompare(String(b.nombre)));
}

/** Agrupa por día: Map<number, efeméride[]> */
export function agruparPorDia(items) {
  const m = new Map();
  for (const e of items ?? []) {
    const d = Number(e?.dia);
    if (!m.has(d)) m.set(d, []);
    m.get(d).push(e);
  }
  return m;
}

/** Nombre del mes en español (1-12). */
export function nombreMes(mes) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return meses[Number(mes) - 1] ?? '';
}
