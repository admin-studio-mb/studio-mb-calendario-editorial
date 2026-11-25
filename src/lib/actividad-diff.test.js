import { describe, it, expect } from 'vitest';
import {
  diffPublicacion,
  textoDetalle,
  parseDetalle,
  formatearValor,
  mismoValor,
  etiquetaCampo,
  etiquetasDeResumen,
} from './actividad-diff.js';

const prev = {
  id: 'p1',
  copywriting: 'Hola',
  red: 'instagram',
  hashtags: ['#uno'],
  estado: 'borrador',
};

describe('diff de publicaciones', () => {
  it('solo devuelve los campos que cambian', () => {
    const cambios = diffPublicacion(prev, {
      copywriting: 'Hola y adiós',
      red: 'instagram',
      tipo_contenido: 'educativo',
    });
    expect(cambios.map((c) => c.campo)).toEqual(['copywriting', 'tipo_contenido']);
    expect(cambios[0].etiqueta).toBe('Copywriting');
    expect(cambios[0].antes).toBe('Hola');
    expect(cambios[0].despues).toBe('Hola y adiós');
  });

  it('trata null y cadena vacía como el mismo valor', () => {
    expect(diffPublicacion({ copywriting: null }, { copywriting: '' })).toHaveLength(0);
  });

  it('detecta cambios en arrays por contenido', () => {
    expect(diffPublicacion(prev, { hashtags: ['#uno'] })).toHaveLength(0);
    expect(diffPublicacion(prev, { hashtags: ['#uno', '#dos'] })).toHaveLength(1);
  });

  it('ignora motivo_rechazo y los campos de auditoría', () => {
    const cambios = diffPublicacion(prev, {
      motivo_rechazo: 'falta foto',
      fecha_creacion: '2026-01-01',
      red: 'linkedin',
    });
    expect(cambios.map((c) => c.campo)).toEqual(['red']);
  });

  it('puede ignorar campos extra (estado, que tiene su propio evento)', () => {
    const cambios = diffPublicacion(prev, { estado: 'revision', red: 'linkedin' }, { ignorar: ['estado'] });
    expect(cambios.map((c) => c.campo)).toEqual(['red']);
  });
});

describe('detalle del historial', () => {
  it('escribe resumen + una línea por campo', () => {
    const texto = textoDetalle([
      { etiqueta: 'Copywriting', antes: 'Hola', despues: 'Adiós' },
      { etiqueta: 'Red social', antes: 'instagram', despues: 'linkedin' },
    ]);
    expect(texto).toBe(
      'Editado: Copywriting, Red social\n• Copywriting: «Hola» → «Adiós»\n• Red social: «instagram» → «linkedin»',
    );
  });

  it('se puede volver a leer (ida y vuelta)', () => {
    const texto = textoDetalle([{ etiqueta: 'Copywriting', antes: 'Hola', despues: 'Adiós' }]);
    const { resumen, cambios } = parseDetalle(texto);
    expect(resumen).toBe('Editado: Copywriting');
    expect(cambios).toEqual([{ etiqueta: 'Copywriting', antes: 'Hola', despues: 'Adiós' }]);
  });

  it('lee el formato viejo sin líneas de detalle', () => {
    const { resumen, cambios } = parseDetalle('Editado: cliente_id, red');
    expect(cambios).toHaveLength(0);
    expect(etiquetasDeResumen(resumen)).toEqual(['Cliente', 'Red social']);
  });

  it('no rompe con textos que llevan comillas o saltos', () => {
    const texto = textoDetalle([{ etiqueta: 'Copywriting', antes: 'a «b» c', despues: 'línea1\nlínea2' }]);
    const { cambios } = parseDetalle(texto);
    expect(cambios[0].antes).toBe('a «b» c');
    expect(cambios[0].despues).toBe('línea1 línea2');
  });
});

describe('formato de valores', () => {
  it('resume listas y objetos', () => {
    expect(formatearValor(['a', 'b'])).toBe('a, b');
    expect(formatearValor([{ x: 1 }, { y: 2 }])).toBe('2 elementos');
    expect(formatearValor({ a: 1, b: 2 })).toBe('2 campos');
    expect(formatearValor(null)).toBe('—');
    expect(formatearValor(true)).toBe('sí');
  });

  it('recorta textos largos', () => {
    const largo = 'x'.repeat(200);
    expect(formatearValor(largo, 20).length).toBeLessThanOrEqual(20);
  });

  it('mismoValor compara arrays y objetos por JSON', () => {
    expect(mismoValor([1, 2], [1, 2])).toBe(true);
    expect(mismoValor({ a: 1 }, { a: 1 })).toBe(true);
    expect(mismoValor({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('etiqueta los campos conocidos y deja el resto tal cual', () => {
    expect(etiquetaCampo('diseno_slides')).toBe('Diseño final del carrusel');
    expect(etiquetaCampo('campo_raro')).toBe('campo_raro');
  });
});
