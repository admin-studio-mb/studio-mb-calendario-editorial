import { describe, it, expect } from 'vitest';
import { ROL, rolDe, esAdmin, esEditor, esCliente, esEquipo } from './roles.js';

describe('roles', () => {
  it('expone los nombres exactos de Directus', () => {
    expect(ROL).toEqual({ ADMIN: 'Administrator', EDITOR: 'Editor', CLIENTE: 'Cliente' });
  });

  it('rolDe lee role.name o devuelve null', () => {
    expect(rolDe({ role: { name: 'Editor' } })).toBe('Editor');
    expect(rolDe({ role: null })).toBe(null);
    expect(rolDe(null)).toBe(null);
    expect(rolDe(undefined)).toBe(null);
  });

  it('detecta cada rol', () => {
    const admin = { role: { name: 'Administrator' } };
    const editor = { role: { name: 'Editor' } };
    const cliente = { role: { name: 'Cliente' } };

    expect(esAdmin(admin)).toBe(true);
    expect(esAdmin(editor)).toBe(false);
    expect(esEditor(editor)).toBe(true);
    expect(esEditor(admin)).toBe(false);
    expect(esCliente(cliente)).toBe(true);
    expect(esCliente(admin)).toBe(false);
  });

  it('esEquipo = admin o editor, nunca cliente', () => {
    expect(esEquipo({ role: { name: 'Administrator' } })).toBe(true);
    expect(esEquipo({ role: { name: 'Editor' } })).toBe(true);
    expect(esEquipo({ role: { name: 'Cliente' } })).toBe(false);
    expect(esEquipo(null)).toBe(false);
  });

  it('un rol desconocido no es admin ni editor ni cliente', () => {
    const raro = { role: { name: 'Otro' } };
    expect(esAdmin(raro)).toBe(false);
    expect(esEditor(raro)).toBe(false);
    expect(esCliente(raro)).toBe(false);
    expect(esEquipo(raro)).toBe(false);
  });
});
