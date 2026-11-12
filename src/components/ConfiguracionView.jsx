// ============================================================================
//  src/components/ConfiguracionView.jsx
// ----------------------------------------------------------------------------
//  Preferencias de UI por usuario (se guardan en directus_users.preferencias
//  vía /api/preferencias). Aquí se irán añadiendo opciones.
// ============================================================================

import { useState } from 'react';

const OPCIONES = [
  {
    key: 'panelNueva',
    titulo: 'Mostrar el panel «Nueva publicación»',
    descripcion:
      'Si lo desactivas, el calendario ocupa todo el ancho y el formulario se abre con el botón «Añadir publicación» de la barra de filtros.',
  },
];

export default function ConfiguracionView({ initialPrefs = {} }) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function cambiar(key, valor) {
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: valor }));
    setSaving(key);
    setError('');
    try {
      const res = await fetch('/api/preferencias', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: valor }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      setOk('✓ Preferencia guardada');
      setTimeout(() => setOk(''), 2200);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: prev }));
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{ok}</div>
      )}

      {OPCIONES.map((op) => {
        const activo = prefs[op.key] !== false;
        return (
          <div key={op.key} className="card p-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">{op.titulo}</p>
              <p className="text-xs text-ink-500 mt-1 leading-relaxed">{op.descripcion}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={activo}
              disabled={saving === op.key}
              onClick={() => cambiar(op.key, !activo)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-brand-600' : 'bg-ink-300'}`}
              title={activo ? 'Desactivar' : 'Activar'}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        );
      })}

      <p className="text-[11px] text-ink-400">
        Estas preferencias se guardan en tu cuenta y solo te afectan a ti.
      </p>
    </div>
  );
}
