import { describe, it, expect } from 'vitest';
import { publicacionesToCsv, escape } from './csv.js';

describe('escape (RFC 4180)', () => {
  it('envuelve en comillas si hay coma', () => {
    expect(escape('a,b')).toBe('"a,b"');
  });
  it('escapa comillas dobles', () => {
    expect(escape('he said "hi"')).toBe('"he said ""hi"""');
  });
  it('escapa saltos de línea', () => {
    expect(escape('line1\nline2')).toBe('"line1\nline2"');
  });
  it('valores simples sin escapar', () => {
    expect(escape('hola')).toBe('hola');
  });
  it('null/undefined → string vacío', () => {
    expect(escape(null)).toBe('');
    expect(escape(undefined)).toBe('');
  });
});

describe('publicacionesToCsv', () => {
  const map = new Map([['cli-1', 'Bodegas La Vega']]);

  it('genera cabecera + filas en orden', () => {
    const csv = publicacionesToCsv([
      {
        id: '1',
        fecha_publicacion: '2026-09-22T10:00:00Z',
        cliente_id: 'cli-1',
        tipo_contenido: 'Promo',
        formato: 'post',
        red: 'linkedin',
        estado: 'aprobado',
        copywriting: 'Hola',
        hashtags: ['#vino'],
        textos_slides: '',
      },
    ], map);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Fecha,Hora,Cliente,Red,Tipo,Formato,Estado,Copywriting,Hashtags,Textos slides');
    expect(lines[1]).toContain('2026-09-22');
    expect(lines[1]).toContain('Bodegas La Vega');
    expect(lines[1]).toContain('LinkedIn');
    expect(lines[1]).toContain('Promo');
    expect(lines[1]).toContain('Post');
    expect(lines[1]).toContain('Aprobado');
    expect(lines[1]).toContain('#vino');
  });

  it('añade # si el hashtag no lo trae', () => {
    const csv = publicacionesToCsv([{
      id: '1',
      fecha_publicacion: null,
      cliente_id: null,
      hashtags: ['vino', '#sumate'],
    }], map);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('#vino');
    expect(lines[1]).toContain('#sumate');
  });

  it('escapado correcto del copywriting con coma y comilla', () => {
    const csv = publicacionesToCsv([{
      id: '1',
      fecha_publicacion: null,
      cliente_id: null,
      copywriting: 'Oferta, "solo hoy"',
      hashtags: [],
    }], map);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('"Oferta, ""solo hoy"""');
  });

  it('soporta múltiples publicaciones', () => {
    const csv = publicacionesToCsv([
      { id: '1', fecha_publicacion: '2026-09-22T10:00:00Z', hashtags: [] },
      { id: '2', fecha_publicacion: '2026-09-23T11:00:00Z', hashtags: [] },
    ], map);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // cabecera + 2 filas
  });

  it('estado y formato se traducen a Title Case', () => {
    const csv = publicacionesToCsv([{
      id: '1',
      fecha_publicacion: null,
      cliente_id: null,
      estado: 'borrador',
      formato: 'carrusel',
      hashtags: [],
    }], map);
    expect(csv).toContain('Borrador');
    expect(csv).toContain('Carrusel');
  });
});
