import { describe, expect, it } from 'vitest';
import { SIN_ASIGNAR, postsDelMes, resumenPorCliente, resumenPorResponsable } from './carga.js';

const CURSOR = new Date(2026, 2, 15); // marzo 2026
const EQUIPO = [
  { id: 'u1', first_name: 'Ana', last_name: 'Ruiz', email: 'ana@x.es' },
  { id: 'u2', first_name: 'Luis', email: 'luis@x.es' },
];
const POSTS = [
  { id: 'p1', fecha_publicacion: '2026-03-02T09:00:00', responsable_id: 'u1', estado: 'aprobado', cliente_id: 'c1' },
  { id: 'p2', fecha_publicacion: '2026-03-10T09:00:00', responsable_id: 'u1', estado: 'revision', cliente_id: 'c1' },
  { id: 'p3', fecha_publicacion: '2026-03-20T09:00:00', responsable_id: 'u2', estado: 'borrador', cliente_id: 'c2' },
  { id: 'p4', fecha_publicacion: '2026-03-30T09:00:00', responsable_id: null, estado: 'en_diseno', cliente_id: 'c2' },
  { id: 'p5', fecha_publicacion: '2026-04-01T09:00:00', responsable_id: 'u1', estado: 'borrador', cliente_id: 'c1' },
];
const CLIENTES = [{ id: 'c1', nombre: 'Cafetería Norte' }, { id: 'c2', nombre: 'Bodegas Vega' }];

describe('postsDelMes', () => {
  it('filtra por mes y año del cursor', () => {
    expect(postsDelMes(POSTS, CURSOR).map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('resumenPorResponsable', () => {
  it('agrupa por responsable, incluye sin asignar y ordena por carga', () => {
    const r = resumenPorResponsable(POSTS, EQUIPO, CURSOR);
    expect(r.total).toBe(4);
    expect(r.sinAsignar).toBe(1);
    expect(r.filas.map((f) => [f.nombre, f.total])).toEqual([
      ['Ana Ruiz', 2],
      ['Luis', 1],
      ['Sin asignar', 1],
    ]);
  });

  it('cuenta estados por persona', () => {
    const r = resumenPorResponsable(POSTS, EQUIPO, CURSOR);
    const ana = r.filas.find((f) => f.id === 'u1');
    expect(ana.porEstado.aprobado).toBe(1);
    expect(ana.porEstado.revision).toBe(1);
    expect(ana.porEstado.borrador).toBe(0);
  });

  it('crea fila "Usuario eliminado" si el id no está en el equipo', () => {
    const r = resumenPorResponsable(
      [{ id: 'x', fecha_publicacion: '2026-03-05T09:00:00', responsable_id: 'fantasma' }],
      EQUIPO,
      CURSOR,
    );
    expect(r.filas[0].nombre).toBe('Usuario eliminado');
  });

  it('sin asignar usa la clave interna', () => {
    const r = resumenPorResponsable([], EQUIPO, CURSOR);
    expect(r.filas).toEqual([]);
    expect(SIN_ASIGNAR).toBeTruthy();
  });
});

describe('resumenPorCliente', () => {
  it('cuenta por cliente y marca los que tienen posts sin responsable', () => {
    const filas = resumenPorCliente(POSTS, CLIENTES, CURSOR);
    expect(filas.map((f) => [f.nombre, f.total, f.sinResponsable])).toEqual([
      ['Cafetería Norte', 2, 0],
      ['Bodegas Vega', 2, 1],
    ]);
  });
});
