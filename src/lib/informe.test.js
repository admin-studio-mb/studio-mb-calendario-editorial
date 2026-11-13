import { describe, expect, it } from 'vitest';
import { dentroDelRango, nombreArchivo, parseMes, slug } from './informe.js';

describe('parseMes', () => {
  it('calcula el rango completo del mes', () => {
    expect(parseMes('2026-02')).toEqual({
      year: 2026,
      month: 2,
      desde: '2026-02-01T00:00:00',
      hasta: '2026-02-28T23:59:59',
      label: 'febrero de 2026',
    });
    expect(parseMes('2028-02').hasta).toBe('2028-02-29T23:59:59');
  });

  it('rechaza formatos inválidos', () => {
    expect(parseMes('2026-13')).toBeNull();
    expect(parseMes('2026-1')).toBeNull();
    expect(parseMes('')).toBeNull();
    expect(parseMes(null)).toBeNull();
  });
});

describe('dentroDelRango', () => {
  it('compara fechas naive', () => {
    const { desde, hasta } = parseMes('2026-03');
    expect(dentroDelRango('2026-03-15T09:00:00', desde, hasta)).toBe(true);
    expect(dentroDelRango('2026-03-01T00:00:00', desde, hasta)).toBe(true);
    expect(dentroDelRango('2026-02-28T23:59:59', desde, hasta)).toBe(false);
    expect(dentroDelRango('2026-04-01T00:00:00', desde, hasta)).toBe(false);
    expect(dentroDelRango(null, desde, hasta)).toBe(false);
  });
});

describe('nombreArchivo', () => {
  it('slugifica el nombre del cliente', () => {
    expect(nombreArchivo('Cafetería Norte', 2026, 3)).toBe('calendario-cafeteria-norte-2026-03.pdf');
    expect(nombreArchivo('', 2026, 1)).toBe('calendario-cliente-2026-01.pdf');
  });
});

describe('slug', () => {
  it('normaliza acentos y símbolos', () => {
    expect(slug('Bodegas La Vega & Cía.')).toBe('bodegas-la-vega-cia');
  });
});
