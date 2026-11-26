import { describe, expect, it } from 'vitest';
import { agruparPorDia, colorDeAmbito, efemeridesDelMes, efemeridesVisibles, nombreMes, AMBITOS_VALIDOS } from './efemerides.js';

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

describe('efemeridesVisibles', () => {
  const CON_CLIENTE = [
    { id: 'g', nombre: 'Global', cliente_id: null },
    { id: 'c1', nombre: 'Solo cliente 1', cliente_id: 'cli-1' },
    { id: 'c2', nombre: 'Solo cliente 2', cliente_id: 'cli-2' },
  ];

  it('sin cliente activo deja pasar todas', () => {
    expect(efemeridesVisibles(CON_CLIENTE, null).map((e) => e.id)).toEqual(['g', 'c1', 'c2']);
  });

  it('con cliente activo deja las globales y las suyas', () => {
    expect(efemeridesVisibles(CON_CLIENTE, 'cli-1').map((e) => e.id)).toEqual(['g', 'c1']);
  });

  it('tolera listas vacías', () => {
    expect(efemeridesVisibles(null, 'cli-1')).toEqual([]);
  });
});

describe('nombreMes', () => {
  it('nombra los meses', () => {
    expect(nombreMes(1)).toBe('enero');
    expect(nombreMes(12)).toBe('diciembre');
    expect(nombreMes(99)).toBe('');
  });
});
