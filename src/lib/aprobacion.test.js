import { describe, expect, it } from 'vitest';
import {
  DIAS_APROBACION, accionExigeMotivo, destinoDeAccion, enlaceValido, fechaExpiracion, generarToken,
} from './aprobacion.js';

describe('generarToken', () => {
  it('genera 32 hex distintos', () => {
    const a = generarToken();
    const b = generarToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('fechaExpiracion', () => {
  it('está en el futuro (30 días por defecto)', () => {
    const dias = (new Date(fechaExpiracion()).getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(DIAS_APROBACION - 1);
    expect(dias).toBeLessThanOrEqual(DIAS_APROBACION);
  });
});

describe('enlaceValido', () => {
  it('sin token no es válido', () => {
    expect(enlaceValido({})).toBe(false);
    expect(enlaceValido({ token_aprobacion: '' })).toBe(false);
  });

  it('sin caducidad se considera válido', () => {
    expect(enlaceValido({ token_aprobacion: 'abc' })).toBe(true);
  });

  it('comprueba la caducidad', () => {
    const futuro = new Date(Date.now() + 1000).toISOString();
    const pasado = new Date(Date.now() - 1000).toISOString();
    expect(enlaceValido({ token_aprobacion: 'abc', aprobacion_expira: futuro })).toBe(true);
    expect(enlaceValido({ token_aprobacion: 'abc', aprobacion_expira: pasado })).toBe(false);
    expect(enlaceValido({ token_aprobacion: 'abc', aprobacion_expira: 'no-es-fecha' })).toBe(false);
  });
});

describe('destinoDeAccion', () => {
  it('mapea las acciones a estados', () => {
    expect(destinoDeAccion('confirmar', 'revision')).toBe('en_diseno');
    expect(destinoDeAccion('aprobar', 'revision_diseno')).toBe('aprobado');
    expect(destinoDeAccion('cambios', 'revision')).toBe('borrador');
    expect(destinoDeAccion('cambios', 'revision_diseno')).toBe('en_diseno');
  });

  it('no aplica en estados que no tocan', () => {
    expect(destinoDeAccion('aprobar', 'revision')).toBeNull();
    expect(destinoDeAccion('confirmar', 'borrador')).toBeNull();
    expect(destinoDeAccion('cambios', 'aprobado')).toBeNull();
  });

  it('solo "cambios" exige motivo', () => {
    expect(accionExigeMotivo('cambios')).toBe(true);
    expect(accionExigeMotivo('aprobar')).toBe(false);
  });
});
