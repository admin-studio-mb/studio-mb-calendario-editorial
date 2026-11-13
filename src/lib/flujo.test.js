import { describe, it, expect } from 'vitest';
import {
  ESTADOS,
  TRANSICIONES,
  esCliente,
  transicionesPermitidas,
  transicionPermitida,
} from './flujo.js';

const admin = { role: { name: 'Administrator' } };
const cliente = { role: { name: 'Cliente' } };

describe('flujo editorial', () => {
  it('tiene los 6 estados en orden', () => {
    expect(ESTADOS).toEqual(['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado']);
  });

  it('cada estado tiene sus transiciones y publicado es terminal', () => {
    expect(TRANSICIONES.borrador.map((t) => t.to)).toEqual(['revision']);
    expect(TRANSICIONES.revision.map((t) => t.to)).toEqual(['en_diseno', 'borrador']);
    expect(TRANSICIONES.en_diseno.map((t) => t.to)).toEqual(['revision_diseno']);
    expect(TRANSICIONES.revision_diseno.map((t) => t.to)).toEqual(['aprobado', 'en_diseno']);
    expect(TRANSICIONES.aprobado.map((t) => t.to)).toEqual(['publicado']);
    expect(TRANSICIONES.publicado).toEqual([]);
  });

  it('esCliente detecta el rol por nombre', () => {
    expect(esCliente(cliente)).toBe(true);
    expect(esCliente(admin)).toBe(false);
    expect(esCliente(null)).toBe(false);
    expect(esCliente({})).toBe(false);
  });

  it('el equipo ve todas las transiciones', () => {
    expect(transicionesPermitidas('revision_diseno', admin).map((t) => t.to)).toEqual(['aprobado', 'en_diseno']);
    expect(transicionesPermitidas('aprobado', admin).map((t) => t.to)).toEqual(['publicado']);
    expect(transicionesPermitidas('borrador', admin).map((t) => t.to)).toEqual(['revision']);
  });

  it('el cliente solo ve confirmaciones', () => {
    expect(transicionesPermitidas('borrador', cliente)).toEqual([]);
    expect(transicionesPermitidas('revision', cliente).map((t) => t.to)).toEqual(['en_diseno', 'borrador']);
    expect(transicionesPermitidas('en_diseno', cliente)).toEqual([]);
    expect(transicionesPermitidas('revision_diseno', cliente).map((t) => t.to)).toEqual(['aprobado', 'en_diseno']);
    expect(transicionesPermitidas('aprobado', cliente)).toEqual([]);
    expect(transicionesPermitidas('publicado', cliente)).toEqual([]);
  });

  it('transicionPermitida valida por rol y por flujo', () => {
    // Equipo: cualquier transición definida.
    expect(transicionPermitida('borrador', 'revision', admin)).toBe(true);
    expect(transicionPermitida('aprobado', 'publicado', admin)).toBe(true);
    // Transición inexistente: nadie.
    expect(transicionPermitida('borrador', 'publicado', admin)).toBe(false);
    expect(transicionPermitida('publicado', 'borrador', admin)).toBe(false);
    // Cliente: solo confirmar texto / aprobar diseño / pedir cambios.
    expect(transicionPermitida('revision', 'en_diseno', cliente)).toBe(true);
    expect(transicionPermitida('revision', 'borrador', cliente)).toBe(true);
    expect(transicionPermitida('revision_diseno', 'aprobado', cliente)).toBe(true);
    expect(transicionPermitida('revision_diseno', 'en_diseno', cliente)).toBe(true);
    expect(transicionPermitida('borrador', 'revision', cliente)).toBe(false);
    expect(transicionPermitida('en_diseno', 'revision_diseno', cliente)).toBe(false);
    expect(transicionPermitida('aprobado', 'publicado', cliente)).toBe(false);
  });

  it('estado desconocido no revienta', () => {
    expect(transicionesPermitidas('inexistente', admin)).toEqual([]);
    expect(transicionPermitida('inexistente', 'revision', admin)).toBe(false);
  });
});
