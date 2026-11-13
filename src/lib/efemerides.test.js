import { describe, expect, it } from 'vitest';
import { agruparPorDia, colorDeAmbito, efemeridesDelMes, nombreMes, AMBITOS_VALIDOS } from './efemerides.js';

const ITEMS = [
  { id: '1', dia: 6, mes: 1, nombre: 'Reyes', ambito: 'espana' },
  { id: '2', dia: 1, mes: 1, nombre: 'Año Nuevo', ambito: 'espana' },
  { id: '3', dia: 14, mes: 2, nombre: 'San Valentín', ambito: 'marketing' },
  { id: '4', dia: 6, mes: 1, nombre: 'Otra cosa', ambito: 'propia' },
];

describe('efemeridesDelMes', () => {
  it('filtra por mes y ordena por día', () => {
    expect(efemeridesDelMes(ITEMS, 1).map((e) => e.nombre)).toEqual(['Año Nuevo', 'Otra cosa', 'Reyes']);
  });

  it('tolera lista vacía', () => {
    expect(efemeridesDelMes(null, 3)).toEqual([]);
    expect(efemeridesDelMes([], 3)).toEqual([]);
  });
});

describe('agruparPorDia', () => {
  it('agrupa varios eventos del mismo día', () => {
    const m = agruparPorDia(efemeridesDelMes(ITEMS, 1));
    expect(m.get(6).map((e) => e.nombre)).toEqual(['Otra cosa', 'Reyes']);
    expect(m.get(1)).toHaveLength(1);
  });
});

describe('colorDeAmbito', () => {
  it('devuelve el punto del ámbito y cae en "propia"', () => {
    expect(colorDeAmbito('marketing')).toBe('bg-brand-500');
    expect(colorDeAmbito('desconocido')).toBe('bg-emerald-500');
  });

  it('todos los ámbitos tienen punto', () => {
    for (const a of AMBITOS_VALIDOS) expect(colorDeAmbito(a)).toMatch(/^bg-/);
  });
});

describe('nombreMes', () => {
  it('nombra los meses', () => {
    expect(nombreMes(1)).toBe('enero');
    expect(nombreMes(12)).toBe('diciembre');
    expect(nombreMes(99)).toBe('');
  });
});
