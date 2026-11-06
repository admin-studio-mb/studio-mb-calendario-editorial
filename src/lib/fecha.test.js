import { describe, it, expect } from 'vitest';
import {
  toISOlocal,
  toISOAgencia,
  normalizarFechaPublicacion,
  parseFechaPublicacion,
  esNaive,
  compararFechas,
} from './fecha.js';

describe('esNaive', () => {
  it('detecta fechas sin zona horaria', () => {
    expect(esNaive('2026-12-15T09:00:00')).toBe(true);
    expect(esNaive('2026-12-15T09:00')).toBe(true);
    expect(esNaive('2026-12-15')).toBe(true);
    expect(esNaive('2026-12-15 09:00:00')).toBe(true);
  });

  it('detecta fechas CON zona horaria', () => {
    expect(esNaive('2026-12-15T09:00:00Z')).toBe(false);
    expect(esNaive('2026-12-15T09:00:00.000Z')).toBe(false);
    expect(esNaive('2026-12-15T09:00:00+01:00')).toBe(false);
    expect(esNaive(null)).toBe(false);
    expect(esNaive(12345)).toBe(false);
  });
});

describe('toISOlocal', () => {
  it('produce naive local sin Z', () => {
    const d = new Date(2026, 11, 15, 9, 5, 0);
    expect(toISOlocal(d)).toBe('2026-12-15T09:05:00');
  });

  it('rellena con ceros', () => {
    const d = new Date(2026, 0, 3, 4, 6, 7);
    expect(toISOlocal(d)).toBe('2026-01-03T04:06:07');
  });

  it('devuelve null si la fecha es inválida', () => {
    expect(toISOlocal(new Date('nope'))).toBeNull();
    expect(toISOlocal('no-date')).toBeNull();
  });
});

describe('normalizarFechaPublicacion', () => {
  it('deja intacta una fecha naive (ya es hora de pared)', () => {
    expect(normalizarFechaPublicacion('2026-12-15T09:00:00')).toBe('2026-12-15T09:00:00');
  });

  it('normaliza "YYYY-MM-DD" a medianoche', () => {
    expect(normalizarFechaPublicacion('2026-12-15')).toBe('2026-12-15T00:00:00');
  });

  it('normaliza "YYYY-MM-DDTHH:mm" añadiendo segundos', () => {
    expect(normalizarFechaPublicacion('2026-12-15T09:00')).toBe('2026-12-15T09:00:00');
  });

  it('convierte una fecha con Z a la hora de la agencia (Madrid)', () => {
    // 08:00 UTC en diciembre = 09:00 en Madrid (CET, UTC+1)
    expect(normalizarFechaPublicacion('2026-12-15T08:00:00.000Z')).toBe('2026-12-15T09:00:00');
  });

  it('convierte una fecha con offset explícito', () => {
    expect(normalizarFechaPublicacion('2026-12-15T10:00:00+02:00')).toBe('2026-12-15T09:00:00');
  });

  it('en verano Madrid es UTC+2', () => {
    expect(normalizarFechaPublicacion('2026-07-15T08:00:00.000Z')).toBe('2026-07-15T10:00:00');
  });

  it('devuelve null para valores inválidos', () => {
    expect(normalizarFechaPublicacion('')).toBeNull();
    expect(normalizarFechaPublicacion(null)).toBeNull();
    expect(normalizarFechaPublicacion(undefined)).toBeNull();
    expect(normalizarFechaPublicacion('no-es-fecha')).toBeNull();
  });

  it('acepta un Date y lo pasa a hora de agencia', () => {
    const d = new Date('2026-12-15T08:00:00.000Z');
    expect(normalizarFechaPublicacion(d)).toBe('2026-12-15T09:00:00');
  });
});

describe('parseFechaPublicacion', () => {
  it('interpreta una fecha naive como hora LOCAL', () => {
    const d = parseFechaPublicacion('2026-12-15T09:00:00');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('interpreta "YYYY-MM-DD" como medianoche local', () => {
    const d = parseFechaPublicacion('2026-12-15');
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('convierte una fecha con Z a hora local', () => {
    const d = parseFechaPublicacion('2026-12-15T08:00:00.000Z');
    expect(d.getHours()).toBe(9); // Madrid UTC+1 en diciembre
  });

  it('devuelve null para valores inválidos', () => {
    expect(parseFechaPublicacion(null)).toBeNull();
    expect(parseFechaPublicacion('')).toBeNull();
    expect(parseFechaPublicacion('basura')).toBeNull();
  });

  it('round-trip: toISOlocal → parseFechaPublicacion conserva la hora', () => {
    const original = new Date(2026, 5, 15, 18, 30, 0);
    const iso = toISOlocal(original);
    const back = parseFechaPublicacion(iso);
    expect(back.getHours()).toBe(18);
    expect(back.getMinutes()).toBe(30);
    expect(back.getDate()).toBe(15);
  });
});

describe('toISOAgencia', () => {
  it('convierte UTC a hora de Madrid en invierno', () => {
    expect(toISOAgencia(new Date('2026-12-15T08:00:00.000Z'))).toBe('2026-12-15T09:00:00');
  });

  it('convierte UTC a hora de Madrid en verano', () => {
    expect(toISOAgencia(new Date('2026-07-15T08:00:00.000Z'))).toBe('2026-07-15T10:00:00');
  });
});

describe('compararFechas', () => {
  it('ordena por instante', () => {
    expect(compararFechas('2026-12-15T09:00:00', '2026-12-15T10:00:00')).toBeLessThan(0);
    expect(compararFechas('2026-12-15T10:00:00', '2026-12-15T09:00:00')).toBeGreaterThan(0);
    expect(compararFechas('2026-12-15T09:00:00', '2026-12-15T09:00:00')).toBe(0);
  });

  it('gestiona nulos', () => {
    expect(compararFechas(null, '2026-12-15T09:00:00')).toBeLessThan(0);
    expect(compararFechas('2026-12-15T09:00:00', null)).toBeGreaterThan(0);
    expect(compararFechas(null, null)).toBe(0);
  });
});
