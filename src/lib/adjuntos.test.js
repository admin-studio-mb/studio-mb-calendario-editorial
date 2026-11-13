import { describe, expect, it } from 'vitest';
import {
  MAX_ADJUNTOS, UMBRAL_COMPRESION, debeComprimir, normalizarAdjuntos,
  urlAdjunto, urlAdjuntoOriginal,
} from './adjuntos.js';

describe('debeComprimir', () => {
  it('comprime imágenes grandes que no son GIF', () => {
    expect(debeComprimir({ type: 'image/jpeg', size: UMBRAL_COMPRESION + 1 })).toBe(true);
    expect(debeComprimir({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe(true);
  });

  it('no comprime archivos pequeños ni GIF', () => {
    expect(debeComprimir({ type: 'image/jpeg', size: 1000 })).toBe(false);
    expect(debeComprimir({ type: 'image/gif', size: 5 * 1024 * 1024 })).toBe(false);
    expect(debeComprimir(null)).toBe(false);
  });
});

describe('normalizarAdjuntos', () => {
  it('acepta una lista válida y recorta filename/type', () => {
    const out = normalizarAdjuntos([
      { id: ' f-1 ', filename: 'foto.png', type: 'image/png' },
    ]);
    expect(out).toEqual([{ id: 'f-1', filename: 'foto.png', type: 'image/png' }]);
  });

  it('descarta elementos sin id o que no son objetos', () => {
    expect(normalizarAdjuntos([{ filename: 'x.png' }, null, 'texto', {}, { id: '' }])).toEqual([]);
  });

  it('elimina duplicados', () => {
    expect(normalizarAdjuntos([{ id: 'a' }, { id: 'a' }]).map((a) => a.id)).toEqual(['a']);
  });

  it('limita a MAX_ADJUNTOS', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));
    expect(normalizarAdjuntos(many)).toHaveLength(MAX_ADJUNTOS);
  });

  it('tolera null/undefined', () => {
    expect(normalizarAdjuntos(null)).toEqual([]);
    expect(normalizarAdjuntos(undefined)).toEqual([]);
    expect(normalizarAdjuntos({})).toEqual([]);
  });
});

describe('urls de adjuntos', () => {
  it('construye la miniatura con la ruta del proxy', () => {
    expect(urlAdjunto('abc', 200, 200)).toBe('/api/assets/abc?width=200&height=200&fit=cover&quality=80');
  });

  it('devuelve null sin id', () => {
    expect(urlAdjunto('')).toBeNull();
    expect(urlAdjuntoOriginal(null)).toBeNull();
  });
});
