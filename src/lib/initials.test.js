import { describe, it, expect } from 'vitest';
import { initials } from './initials.js';

describe('initials', () => {
  it('devuelve iniciales de first_name + last_name', () => {
    expect(initials({ first_name: 'Iván', last_name: 'Luengo' })).toBe('IL');
  });

  it('mayúsculas aunque venga en minúsculas', () => {
    expect(initials({ first_name: 'maria', last_name: 'pérez' })).toBe('MP');
  });

  it('fallback al email si no hay nombres', () => {
    expect(initials({ email: 'ivan.luengo@studiomb.es' })).toBe('IL');
  });

  it('fallback a ? si no hay nada', () => {
    expect(initials({})).toBe('?');
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
  });

  it('limita a 2 caracteres', () => {
    expect(initials({ first_name: 'Juan', last_name: 'Pablo' })).toBe('JP');
    expect(initials({ first_name: 'A', last_name: 'B' })).toBe('AB');
  });

  it('maneja nombres vacíos sin romper', () => {
    expect(initials({ first_name: '', last_name: 'Pérez' })).toBe('P');
    expect(initials({ first_name: null, last_name: 'Pérez' })).toBe('P');
  });
});
