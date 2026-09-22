// ============================================================================
//  src/components/ClientesView.jsx
// ----------------------------------------------------------------------------
//  Vista de gestión de clientes: tabla + modal de crear/editar + eliminar.
//  Reusa `ClienteForm` para el modal.
// ============================================================================

import { useState } from 'react';
import ClienteForm from './ClienteForm.jsx';

export default function ClientesView({ initialClientes = [], apiBase = '', directusBaseUrl = '' }) {
  const [clientes, setClientes] = useState(initialClientes);
  const [editTarget, setEditTarget] = useState(null); // null = cerrado, 'new' = crear, objeto = editar
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  function handleSubmitted(saved) {
    if (!saved || !saved.id) {
      setEditTarget(null);
      return;
    }
    const enriched = { ...saved, total_publicaciones: clientes.find((c) => c.id === saved.id)?.total_publicaciones ?? 0 };
    setClientes((arr) => {
      const idx = arr.findIndex((c) => c.id === saved.id);
      if (idx === -1) return [...arr, enriched];
      const copy = [...arr];
      copy[idx] = { ...copy[idx], ...enriched };
      return copy;
    });
    setEditTarget(null);
  }

  async function handleDelete(c) {
    if (!confirm(`¿Eliminar el cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(c.id);
    setDeleteError('');
    try {
      const res = await fetch(`${apiBase}/api/clientes/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Eliminar falló (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch { /* noop */ }
        throw new Error(msg);
      }
      setClientes((arr) => arr.filter((x) => x.id !== c.id));
    } catch (err) {
      setDeleteError(err.message ?? 'Error eliminando.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Header con KPIs + acción */}
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div class="card p-4 md:p-5">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 font-medium">Total</p>
          <p class="mt-2 text-2xl md:text-3xl font-bold text-ink-900">{clientes.length}</p>
          <p class="text-xs text-ink-500 mt-1">clientes</p>
        </div>
        <div class="card p-4 md:p-5">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 font-medium">Tipos únicos</p>
          <p class="mt-2 text-2xl md:text-3xl font-bold text-brand-600">
            {new Set(clientes.flatMap((c) => c.tipos_contenido_disponibles ?? [])).size}
          </p>
          <p class="text-xs text-ink-500 mt-1">en catálogo</p>
        </div>
        <div class="card p-4 md:p-5 col-span-2 md:col-span-1 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-wider text-ink-400 font-medium">Acción</p>
            <p class="mt-2 text-sm text-ink-600">Crea un cliente nuevo</p>
          </div>
          <button
            type="button"
            onClick={() => setEditTarget('new')}
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-medium shadow-sm hover:shadow-md transition"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      {deleteError && (
        <div class="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3 mb-4">
          {deleteError}
        </div>
      )}

      {/* Tabla */}
      <div class="card overflow-hidden">
        {clientes.length === 0 ? (
          <div class="p-12 text-center">
            <svg class="w-12 h-12 mx-auto text-ink-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <p class="text-sm text-ink-500 mb-4">Aún no hay clientes. Crea el primero para empezar.</p>
            <button
              type="button"
              onClick={() => setEditTarget('new')}
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Crear cliente
            </button>
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-ink-50/50 text-ink-500 text-xs uppercase tracking-wider">
                <tr>
                  <th class="px-5 py-3 text-left font-semibold">Cliente</th>
                  <th class="px-5 py-3 text-left font-semibold">Tipos</th>
                  <th class="px-5 py-3 text-right font-semibold">Publicaciones</th>
                  <th class="px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                {clientes.map((c) => (
                  <tr key={c.id} class="hover:bg-ink-50/40 transition">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-ink-100 border border-ink-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {c.logo ? (
                            <img src={`${apiBase.replace(/\/$/, '')}/api/assets/${c.logo}`} alt="" class="w-full h-full object-cover" />
                          ) : (
                            <span class="text-sm font-bold text-ink-400">
                              {c.nombre?.charAt(0).toUpperCase() ?? '?'}
                            </span>
                          )}
                        </div>
                        <div class="min-w-0">
                          <p class="font-medium text-ink-900 truncate">{c.nombre}</p>
                          <p class="text-xs text-ink-400 font-mono truncate">{c.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-3">
                      <div class="flex flex-wrap gap-1 max-w-md">
                        {(c.tipos_contenido_disponibles ?? []).map((t) => (
                          <span key={t} class="inline-block px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-100">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td class="px-5 py-3 text-right">
                      <span class="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 text-sm font-semibold">
                        {c.total_publicaciones ?? 0}
                      </span>
                    </td>
                    <td class="px-5 py-3 text-right">
                      <div class="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditTarget(c)}
                          class="p-1.5 rounded-md text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition"
                          title="Editar"
                        >
                          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          disabled={deletingId === c.id}
                          class="p-1.5 rounded-md text-ink-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                          title="Eliminar"
                        >
                          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <header class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-ink-100 bg-white">
              <div>
                <h3 class="text-base font-semibold text-ink-900">
                  {editTarget === 'new' ? 'Nuevo cliente' : 'Editar cliente'}
                </h3>
                <p class="text-xs text-ink-500 mt-0.5">
                  {editTarget === 'new' ? 'Crea un cliente nuevo y define sus tipos de contenido.' : `Modifica los datos de "${editTarget.nombre}".`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                class="p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            <div class="p-5">
              <ClienteForm
                initial={editTarget === 'new' ? {} : editTarget}
                apiBase={apiBase}
                directusBaseUrl={directusBaseUrl}
                onCancel={() => setEditTarget(null)}
                onSubmitted={handleSubmitted}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
