import { describe, expect, it } from 'vitest';
import { MAX_DISENO_SLIDES, disenoImagenes, disenoPortada, disenoPropuesto, fotoPropuesta, idDiseno, normalizarDisenoSlides } from './diseno.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('idDiseno', () => {
  it('acepta uuid y URLs', () => {
    expect(idDiseno(A)).toBe(A);
    expect(idDiseno({ id: B })).toBe(B);
    expect(idDiseno('https://example.com/foto.jpg')).toBe('https://example.com/foto.jpg');
  });

  it('rechaza basura', () => {
    expect(idDiseno('')).toBeNull();
    expect(idDiseno('no-es-un-id')).toBeNull();
    expect(idDiseno(null)).toBeNull();
  });
});

describe('normalizarDisenoSlides', () => {
  it('limpia, deduplica y respeta el orden', () => {
    expect(normalizarDisenoSlides([A, { id: B }, A, 'x', null])).toEqual([A, B]);
  });

  it('corta al máximo permitido', () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.jpg`);
    expect(normalizarDisenoSlides(many)).toHaveLength(MAX_DISENO_SLIDES);
  });

  it('devuelve [] si no es un array', () => {
    expect(normalizarDisenoSlides('nope')).toEqual([]);
    expect(normalizarDisenoSlides(null)).toEqual([]);
  });
});

describe('disenoImagenes', () => {
  it('usa las slides si existen', () => {
    expect(disenoImagenes({ diseno_slides: [A, B], diseno_final: C })).toEqual([A, B]);
  });

  it('cae a la portada si no hay slides', () => {
    expect(disenoImagenes({ diseno_final: C })).toEqual([C]);
    expect(disenoImagenes({})).toEqual([]);
  });

  it('disenoPortada devuelve la primera', () => {
    expect(disenoPortada({ diseno_slides: [B, C] })).toBe(B);
    expect(disenoPortada({})).toBeNull();
  });
});

describe('fotoPropuesta / disenoPropuesto', () => {
  it('usa la primera foto de los slides', () => {
    expect(fotoPropuesta({ imagenes_fondo: [{ texto: 'Hola', imagen: A }, { imagen: B }] })).toBe(A);
    expect(fotoPropuesta({ imagenes_fondo: [{ texto: 'sin foto' }] })).toBeNull();
  });

  it('prioriza el diseño final sobre la foto propuesta', () => {
    expect(disenoPropuesto({ diseno_final: C, imagenes_fondo: [{ imagen: A }] })).toEqual([C]);
    expect(disenoPropuesto({ imagenes_fondo: [{ imagen: A }] })).toEqual([A]);
    expect(disenoPropuesto({ imagenes_fondo: [] })).toEqual([]);
  });
});
