import { describe, expect, it } from 'vitest';
import { MARCA_DEFECTO, escalaMarca, marcaVars, mezclar, normalizarHex, textoSobre } from './marca.js';

describe('normalizarHex', () => {
  it('normaliza con y sin #', () => {
    expect(normalizarHex('#4F46E5')).toBe('#4f46e5');
    expect(normalizarHex('4f46e5')).toBe('#4f46e5');
  });

  it('rechaza valores inválidos', () => {
    expect(normalizarHex('rojo')).toBeNull();
    expect(normalizarHex('#fff')).toBeNull();
    expect(normalizarHex(null)).toBeNull();
  });
});

describe('mezclar', () => {
  it('acerca a blanco con peso positivo y a negro con negativo', () => {
    expect(mezclar('#000000', 1)).toBe('#ffffff');
    expect(mezclar('#ffffff', -1)).toBe('#000000');
    expect(mezclar('#4f46e5', 0)).toBe('#4f46e5');
  });
});

describe('escalaMarca', () => {
  it('usa el color base en 600 y genera tonos claros/oscuros', () => {
    const e = escalaMarca('#e11d48');
    expect(e[600]).toBe('#e11d48');
    expect(e[50]).not.toBe(e[600]);
    expect(e[900]).not.toBe(e[600]);
  });

  it('cae al morado por defecto con un color inválido', () => {
    expect(escalaMarca('no-es-color')[600]).toBe(MARCA_DEFECTO);
  });
});

describe('marcaVars', () => {
  it('genera las variables de Tailwind', () => {
    const vars = marcaVars('#e11d48');
    expect(vars).toContain('--color-brand-600: #e11d48');
    expect(vars).toContain('--color-brand-50:');
  });
});

describe('textoSobre', () => {
  it('elige blanco o negro según luminancia', () => {
    expect(textoSobre('#000000')).toBe('#ffffff');
    expect(textoSobre('#ffffff')).toBe('#131418');
  });
});
