import { describe, expect, it } from 'vitest';
import { fechaDuplicado, payloadDuplicado, DIAS_DUPLICADO } from './duplicar.js';

const POST = {
  id: 'abc',
  cliente_id: 'cli-1',
  red: 'linkedin',
  tipo_contenido: 'Artículo',
  formato: 'post',
  copywriting: 'Texto del post',
  hashtags: ['#a', 'b'],
  textos_slides: 'legacy',
  imagenes_fondo: [{ texto: 'Slide 1', imagen: 'https://x/y.jpg' }],
  fecha_publicacion: '2026-03-10T09:30:00',
  estado: 'aprobado',
  diseno_final: { id: 'file-1' },
};

describe('fechaDuplicado', () => {
  it('suma 7 días por defecto manteniendo la hora de pared', () => {
    expect(fechaDuplicado(POST)).toBe('2026-03-17T09:30:00');
  });

  it('acepta otro número de días', () => {
    expect(fechaDuplicado(POST, 1)).toBe('2026-03-11T09:30:00');
  });

  it('sin fecha válida usa hoy (no rompe)', () => {
    const out = fechaDuplicado({ fecha_publicacion: null }, DIAS_DUPLICADO);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe('payloadDuplicado', () => {
  it('copia el contenido editorial y la fecha pedida', () => {
    const p = payloadDuplicado(POST, '2026-03-20T10:00:00');
    expect(p).toMatchObject({
      cliente_id: 'cli-1',
      red: 'linkedin',
      tipo_contenido: 'Artículo',
      formato: 'post',
      copywriting: 'Texto del post',
      hashtags: ['#a', 'b'],
      fecha_publicacion: '2026-03-20T10:00:00',
    });
    expect(p.imagenes_fondo).toEqual([{ texto: 'Slide 1', imagen: 'https://x/y.jpg' }]);
    expect(p.imagenes_fondo[0]).not.toBe(POST.imagenes_fondo[0]);
  });

  it('no hereda estado ni diseño final', () => {
    const p = payloadDuplicado(POST, '2026-03-20T10:00:00');
    expect(p).not.toHaveProperty('estado');
    expect(p).not.toHaveProperty('diseno_final');
  });

  it('normaliza fecha con hora (datetime-local)', () => {
    expect(payloadDuplicado(POST, '2026-03-20T10:00').fecha_publicacion)
      .toBe('2026-03-20T10:00:00');
  });

  it('devuelve null sin post', () => {
    expect(payloadDuplicado(null, '2026-03-20T10:00:00')).toBeNull();
  });

  it('marca el origen como duplicado', () => {
    expect(payloadDuplicado(POST, '2026-03-20T10:00:00').origen).toBe('duplicado');
  });
});
