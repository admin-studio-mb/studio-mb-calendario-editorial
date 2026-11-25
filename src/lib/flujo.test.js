import { describe, it, expect } from 'vitest';
import {
  ESTADOS,
  TRANSICIONES,
  esCliente,
  transicionesPermitidas,
  transicionPermitida,
  tieneDiseno,
  puedeRevisionConjunta,
} from './flujo.js';

const admin = { role: { name: 'Administrator' } };
const cliente = { role: { name: 'Cliente' } };

describe('flujo editorial', () => {
  it('tiene los 7 estados en orden', () => {
    expect(ESTADOS).toEqual([
      'borrador', 'revision', 'en_diseno', 'revision_diseno',
      'revision_conjunta', 'aprobado', 'publicado',
    ]);
  });

  it('cada estado tiene sus transiciones y publicado permite volver a borrador', () => {
    expect(TRANSICIONES.borrador.map((t) => t.to)).toEqual(['revision', 'revision_conjunta']);
    expect(TRANSICIONES.revision.map((t) => t.to)).toEqual(['en_diseno', 'revision_conjunta', 'borrador']);
    expect(TRANSICIONES.en_diseno.map((t) => t.to)).toEqual(['revision_diseno', 'revision_conjunta', 'borrador']);
    expect(TRANSICIONES.revision_diseno.map((t) => t.to)).toEqual(['aprobado', 'en_diseno', 'borrador']);
    expect(TRANSICIONES.revision_conjunta.map((t) => t.to)).toEqual(['aprobado', 'borrador', 'en_diseno']);
    expect(TRANSICIONES.aprobado.map((t) => t.to)).toEqual(['publicado', 'borrador']);
    expect(TRANSICIONES.publicado.map((t) => t.to)).toEqual(['borrador']);
  });

  it('esCliente detecta el rol por nombre', () => {
    expect(esCliente(cliente)).toBe(true);
    expect(esCliente(admin)).toBe(false);
    expect(esCliente(null)).toBe(false);
    expect(esCliente({})).toBe(false);
  });

  it('el equipo ve todas las transiciones', () => {
    expect(transicionesPermitidas('revision_diseno', admin).map((t) => t.to)).toEqual(['aprobado', 'en_diseno', 'borrador']);
    expect(transicionesPermitidas('revision_conjunta', admin).map((t) => t.to)).toEqual(['aprobado', 'borrador', 'en_diseno']);
    expect(transicionesPermitidas('aprobado', admin).map((t) => t.to)).toEqual(['publicado', 'borrador']);
    expect(transicionesPermitidas('borrador', admin).map((t) => t.to)).toEqual(['revision', 'revision_conjunta']);
  });

  it('oculta la revisión conjunta si falta copy o diseño', () => {
    const sinDiseno = { copywriting: 'Texto listo', diseno_final: null, diseno_slides: [] };
    const sinCopy = { copywriting: '', diseno_final: 'archivo-1' };
    const completo = { copywriting: 'Texto listo', diseno_slides: ['archivo-1'] };

    expect(tieneDiseno(sinDiseno)).toBe(false);
    expect(tieneDiseno(completo)).toBe(true);
    expect(puedeRevisionConjunta(sinDiseno)).toBe(false);
    expect(puedeRevisionConjunta(sinCopy)).toBe(false);
    expect(puedeRevisionConjunta(completo)).toBe(true);

    expect(transicionesPermitidas('revision', admin, sinDiseno).map((t) => t.to))
      .toEqual(['en_diseno', 'borrador']);
    expect(transicionesPermitidas('revision', admin, completo).map((t) => t.to))
      .toEqual(['en_diseno', 'revision_conjunta', 'borrador']);
    expect(transicionPermitida('revision', 'revision_conjunta', admin, sinDiseno)).toBe(false);
    expect(transicionPermitida('revision', 'revision_conjunta', admin, completo)).toBe(true);
  });

  it('el cliente solo ve confirmaciones', () => {
    expect(transicionesPermitidas('borrador', cliente)).toEqual([]);
    expect(transicionesPermitidas('revision', cliente).map((t) => t.to)).toEqual(['en_diseno', 'borrador']);
    expect(transicionesPermitidas('en_diseno', cliente)).toEqual([]);
    expect(transicionesPermitidas('revision_diseno', cliente).map((t) => t.to)).toEqual(['aprobado', 'en_diseno']);
    expect(transicionesPermitidas('revision_conjunta', cliente).map((t) => t.to))
      .toEqual(['aprobado', 'borrador', 'en_diseno']);
    expect(transicionesPermitidas('aprobado', cliente)).toEqual([]);
    expect(transicionesPermitidas('publicado', cliente)).toEqual([]);
  });

  it('transicionPermitida valida por rol y por flujo', () => {
    // Equipo: cualquier transición definida.
    expect(transicionPermitida('borrador', 'revision', admin)).toBe(true);
    expect(transicionPermitida('aprobado', 'publicado', admin)).toBe(true);
    // Transición inexistente: nadie.
    expect(transicionPermitida('borrador', 'publicado', admin)).toBe(false);
    expect(transicionPermitida('publicado', 'borrador', admin)).toBe(true);
    expect(transicionPermitida('publicado', 'borrador', cliente)).toBe(false);
    // Cliente: solo confirmar texto / aprobar diseño / pedir cambios.
    expect(transicionPermitida('revision', 'en_diseno', cliente)).toBe(true);
    expect(transicionPermitida('revision', 'borrador', cliente)).toBe(true);
    expect(transicionPermitida('revision_diseno', 'aprobado', cliente)).toBe(true);
    expect(transicionPermitida('revision_diseno', 'en_diseno', cliente)).toBe(true);
    expect(transicionPermitida('revision_conjunta', 'aprobado', cliente)).toBe(true);
    expect(transicionPermitida('revision_conjunta', 'borrador', cliente)).toBe(true);
    expect(transicionPermitida('revision_conjunta', 'en_diseno', cliente)).toBe(true);
    expect(transicionPermitida('borrador', 'revision', cliente)).toBe(false);
    expect(transicionPermitida('en_diseno', 'revision_diseno', cliente)).toBe(false);
    expect(transicionPermitida('aprobado', 'publicado', cliente)).toBe(false);
  });

  it('estado desconocido no revienta', () => {
    expect(transicionesPermitidas('inexistente', admin)).toEqual([]);
    expect(transicionPermitida('inexistente', 'revision', admin)).toBe(false);
  });
});
