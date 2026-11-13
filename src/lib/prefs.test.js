import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, normalizarPrefs, parchearPrefs, prefsDe } from './prefs.js';

describe('normalizarPrefs', () => {
  it('sin datos devuelve los defaults', () => {
    expect(normalizarPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs('')).toEqual(DEFAULT_PREFS);
  });

  it('acepta JSON en string', () => {
    expect(normalizarPrefs('{"panelNueva":false}')).toMatchObject({ panelNueva: false });
  });

  it('ignora claves desconocidas y valores inválidos', () => {
    expect(normalizarPrefs({ panelNueva: 'no', otraCosa: true })).toMatchObject({ panelNueva: true });
    expect(normalizarPrefs({ panelNueva: false, otraCosa: 1 })).toMatchObject({ panelNueva: false });
    expect(normalizarPrefs({ notifEmail: 'cada-hora' })).toMatchObject({ notifEmail: 'instante' });
  });

  it('normaliza notifTipos filtrando valores raros', () => {
    expect(normalizarPrefs({ notifTipos: ['comentario', 'otro'] }).notifTipos).toEqual(['comentario']);
    expect(normalizarPrefs({ notifTipos: [] }).notifTipos).toEqual([]);
  });

  it('tolera JSON roto y arrays', () => {
    expect(normalizarPrefs('{roto')).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs([1, 2])).toEqual(DEFAULT_PREFS);
  });
});

describe('parchearPrefs', () => {
  it('acepta un patch válido', () => {
    expect(parchearPrefs({ panelNueva: false, notifEmail: 'diario', notifTipos: ['estado'] }))
      .toEqual({ patch: { panelNueva: false, notifEmail: 'diario', notifTipos: ['estado'] }, error: null });
  });

  it('rechaza tipos incorrectos', () => {
    expect(parchearPrefs({ panelNueva: 'si' }).error).toMatch(/boolean/);
    expect(parchearPrefs({ notifEmail: 'semanal' }).error).toMatch(/notifEmail/);
    expect(parchearPrefs({ notifTipos: 'comentario' }).error).toMatch(/array/);
    expect(parchearPrefs({ notifTipos: ['comentario', 'otro'] }).error).toMatch(/notifTipos/);
  });

  it('quita duplicados de notifTipos', () => {
    expect(parchearPrefs({ notifTipos: ['estado', 'estado'] }).patch.notifTipos).toEqual(['estado']);
  });

  it('permite lista vacía (no avisar de nada)', () => {
    expect(parchearPrefs({ notifTipos: [] }).patch).toEqual({ notifTipos: [] });
  });
});

describe('prefsDe', () => {
  it('lee las preferencias del usuario', () => {
    expect(prefsDe({ preferencias: { panelNueva: false } })).toMatchObject({ panelNueva: false });
    expect(prefsDe(null)).toEqual(DEFAULT_PREFS);
  });
});
