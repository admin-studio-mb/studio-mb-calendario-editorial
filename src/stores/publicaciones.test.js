import { describe, it, expect, beforeEach } from 'vitest';
import {
  publicacionesStore,
  cursorStore,
  filtrosStore,
  hydratePublicaciones,
  addPublicacion,
  updatePublicacion,
  removePublicacion,
  resetPublicaciones,
} from './publicaciones.js';

const sample = [
  { id: 'a', tipo_contenido: 'Promo', estado: 'borrador', fecha_publicacion: '2026-09-22T10:00:00Z', cliente_id: 'cli-1' },
  { id: 'b', tipo_contenido: 'Behind', estado: 'aprobado', fecha_publicacion: '2026-09-23T11:00:00Z', cliente_id: 'cli-1' },
  { id: 'c', tipo_contenido: 'Noticia', estado: 'revision', fecha_publicacion: '2026-09-24T12:00:00Z', cliente_id: 'cli-2' },
];

describe('publicacionesStore', () => {
  beforeEach(() => {
    resetPublicaciones();
  });

  it('empieza vacío', () => {
    expect(publicacionesStore.get()).toEqual([]);
  });

  it('hydratePublicaciones reemplaza el array', () => {
    hydratePublicaciones(sample);
    expect(publicacionesStore.get()).toHaveLength(3);
  });

  it('hydratePublicaciones(null) vacía el store', () => {
    hydratePublicaciones(sample);
    hydratePublicaciones(null);
    expect(publicacionesStore.get()).toEqual([]);
  });

  it('addPublicacion añade con _pending: false', () => {
    hydratePublicaciones(sample);
    addPublicacion({ id: 'd', tipo_contenido: 'Nuevo', _pending: true });
    const pub = publicacionesStore.get().find((p) => p.id === 'd');
    expect(pub).toBeTruthy();
    expect(pub._pending).toBe(false); // siempre lo resetea
  });

  it('updatePublicacion reemplaza campos del id existente', () => {
    hydratePublicaciones(sample);
    updatePublicacion({ id: 'a', estado: 'aprobado' });
    const pub = publicacionesStore.get().find((p) => p.id === 'a');
    expect(pub.estado).toBe('aprobado');
    expect(pub.tipo_contenido).toBe('Promo'); // no se sobreescribe
    expect(pub._pending).toBe(false);
  });

  it('updatePublicacion con id inexistente no rompe', () => {
    hydratePublicaciones(sample);
    updatePublicacion({ id: 'no-existe', estado: 'aprobado' });
    expect(publicacionesStore.get()).toHaveLength(3);
  });

  it('removePublicacion elimina por id', () => {
    hydratePublicaciones(sample);
    removePublicacion('b');
    const list = publicacionesStore.get();
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.id === 'b')).toBeUndefined();
  });

  it('resetPublicaciones vacía el store', () => {
    hydratePublicaciones(sample);
    resetPublicaciones();
    expect(publicacionesStore.get()).toEqual([]);
  });
});

describe('cursorStore', () => {
  it('valor inicial es Date', () => {
    expect(cursorStore.get()).toBeInstanceOf(Date);
  });

  it('set acepta Date y la devuelve', () => {
    const d = new Date(2026, 8, 22);
    cursorStore.set(d);
    expect(cursorStore.get()).toEqual(d);
  });
});

describe('filtrosStore', () => {
  beforeEach(() => {
    filtrosStore.set({ texto: '', estado: '', formato: '' });
  });

  it('valor inicial vacío', () => {
    const f = filtrosStore.get();
    expect(f.texto).toBe('');
    expect(f.estado).toBe('');
    expect(f.formato).toBe('');
  });

  it('set reemplaza totalmente', () => {
    // El caller (Calendar.jsx) hace el merge con spread antes de llamar a set.
    filtrosStore.set({ texto: 'promo', estado: 'aprobado', formato: 'post' });
    expect(filtrosStore.get()).toEqual({ texto: 'promo', estado: 'aprobado', formato: 'post' });
  });

  it('merge manual antes de set conserva campos no patcheados', () => {
    // Patrón usado en producción (Calendar.jsx → setFiltros):
    filtrosStore.set({ ...filtrosStore.get(), texto: 'cafe' });
    const f = filtrosStore.get();
    expect(f.texto).toBe('cafe');
    expect(f.estado).toBe('');
    expect(f.formato).toBe('');
  });
});
