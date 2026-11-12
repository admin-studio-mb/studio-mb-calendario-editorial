import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, normalizarPrefs, prefsDe } from './prefs.js';

describe('normalizarPrefs', () => {
  it('sin datos devuelve los defaults', () => {
    expect(normalizarPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs('')).toEqual(DEFAULT_PREFS);
  });

  it('acepta JSON en string', () => {
    expect(normalizarPrefs('{"panelNueva":false}')).toEqual({ panelNueva: false });
  });

  it('ignora claves desconocidas y valores que no son boolean', () => {
    expect(normalizarPrefs({ panelNueva: 'no', otraCosa: true })).toEqual({ panelNueva: true });
    expect(normalizarPrefs({ panelNueva: false, otraCosa: 1 })).toEqual({ panelNueva: false });
  });

  it('tolera JSON roto y arrays', () => {
    expect(normalizarPrefs('{roto')).toEqual(DEFAULT_PREFS);
    expect(normalizarPrefs([1, 2])).toEqual(DEFAULT_PREFS);
  });
});

describe('prefsDe', () => {
  it('lee las preferencias del usuario', () => {
    expect(prefsDe({ preferencias: { panelNueva: false } })).toEqual({ panelNueva: false });
    expect(prefsDe(null)).toEqual(DEFAULT_PREFS);
  });
});
