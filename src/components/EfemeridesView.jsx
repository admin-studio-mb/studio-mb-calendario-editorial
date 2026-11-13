// ============================================================================
//  src/components/EfemeridesView.jsx
// ----------------------------------------------------------------------------
//  Gestión de efemérides (solo Administrator): alta, edición y borrado.
//  Se repiten cada año (día + mes).
// ============================================================================

import { useMemo, useState } from 'react';
import { AMBITOS, AMBITOS_VALIDOS, nombreMes } from '../lib/efemerides.js';

const VACIO = { id: null, dia: '1', mes: '1', nombre: '', ambito: 'propia', notas: '' };

export default function EfemeridesView({ initialItems = [] }) {
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const porMes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => ({
      mes,
      items: items
        .filter((e) => Number(e.mes) === mes)
        .sort((a, b) => Number(a.dia) - Number(b.dia) || String(a.nombre).localeCompare(String(b.nombre))),
    }));
  }, [items]);

  function editar(item) {
    setForm({
      id: item.id,
      dia: String(item.dia),
      mes: String(item.mes),
      nombre: item.nombre,
      ambito: item.ambito ?? 'propia',
      notas: item.notas ?? '',
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk('');
    const payload = {
      dia: Number(form.dia),
      mes: Number(form.mes),
      nombre: form.nombre,
      ambito: form.ambito,
      notas: form.notas || null,
    };
    try {
      const res = await fetch(form.id ? `/api/efemerides/${form.id}` : '/api/efemerides', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setItems((arr) => (form.id
        ? arr.map((x) => (x.id === form.id ? data : x))
        : [...arr, data]));
      setForm(VACIO);
      setOk(form.id ? '✓ Efeméride actualizada' : '✓ Efeméride añadida');
      setTimeout(() => setOk(''), 2500);
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function borrar(item) {
    if (!confirm(`¿Borrar "${item.nombre}"?`)) return;
    setError('');
    try {
      const res = await fetch(`/api/efemerides/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      setItems((arr) => arr.filter((x) => x.id !== item.id));
    } catch (err) {
      setError(err.message ?? 'No se pudo borrar.');
    }
  }

  const inputBase = 'w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition';
  const labelBase = 'block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1';

  return (
    <div className="space-y-5 max-w-3xl">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>}
      {ok && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{ok}</div>}

      <form onSubmit={guardar} className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-900">
            {form.id ? 'Editar efeméride' : 'Añadir efeméride'}
          </h2>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(VACIO)}
              className="text-xs font-medium text-ink-500 hover:text-ink-800"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelBase} htmlFor="dia">Día</label>
            <input
              id="dia"
              type="number"
              min="1"
              max="31"
              value={form.dia}
              onChange={(e) => setForm((f) => ({ ...f, dia: e.target.value }))}
              className={inputBase}
            />
          </div>
          <div>
            <label className={labelBase} htmlFor="mes">Mes</label>
            <select
              id="mes"
              value={form.mes}
              onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))}
              className={inputBase}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{nombreMes(m)}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelBase} htmlFor="ambito">Ámbito</label>
            <select
              id="ambito"
              value={form.ambito}
              onChange={(e) => setForm((f) => ({ ...f, ambito: e.target.value }))}
              className={inputBase}
            >
              {AMBITOS_VALIDOS.map((a) => (
                <option key={a} value={a}>{AMBITOS[a].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelBase} htmlFor="nombre-ef">Nombre</label>
          <input
            id="nombre-ef"
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Sant Jordi"
            className={inputBase}
          />
        </div>

        <div>
          <label className={labelBase} htmlFor="notas-ef">Notas (opcional)</label>
          <textarea
            id="notas-ef"
            rows={2}
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            placeholder="Idea de campaña, hashtags, etc."
            className={inputBase}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !form.nombre.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Añadir'}
          </button>
        </div>
      </form>

      {porMes.map(({ mes, items: lista }) => (
        lista.length > 0 && (
          <section key={mes} className="card overflow-hidden">
            <header className="px-5 py-3 border-b border-ink-100 bg-ink-50/60">
              <h3 className="text-sm font-semibold text-ink-900 capitalize">{nombreMes(mes)}</h3>
            </header>
            <ul className="divide-y divide-ink-100">
              {lista.map((e) => (
                <li key={e.id} className="px-5 py-2.5 flex items-center gap-3">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${(AMBITOS[e.ambito] ?? AMBITOS.propia).dot}`} />
                  <span className="text-sm font-bold text-ink-900 tabular-nums w-8 shrink-0">{String(e.dia).padStart(2, '0')}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-800 truncate">{e.nombre}</span>
                    {e.notas && <span className="block text-[11px] text-ink-400 truncate">{e.notas}</span>}
                  </span>
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-ink-400">
                    {(AMBITOS[e.ambito] ?? AMBITOS.propia).label}
                  </span>
                  <button type="button" onClick={() => editar(e)} className="text-xs font-medium text-ink-500 hover:text-brand-600">Editar</button>
                  <button type="button" onClick={() => borrar(e)} className="text-xs font-medium text-ink-400 hover:text-red-600">Borrar</button>
                </li>
              ))}
            </ul>
          </section>
        )
      ))}
    </div>
  );
}
