// ============================================================================
//  src/components/ConfiguracionView.jsx
// ----------------------------------------------------------------------------
//  Preferencias de UI por usuario (se guardan en directus_users.preferencias
//  vía /api/preferencias). Aquí se irán añadiendo opciones.
// ============================================================================

import { useState } from 'react';
import { NOTIF_EMAIL_OPCIONES, NOTIF_TIPOS_OPCIONES } from '../lib/prefs.js';

export default function ConfiguracionView({
  initialPrefs = {},
  puedeCrear = true,
  initialAvatar = null,
  nombreUsuario = '',
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const iniciales = (nombreUsuario || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const tipos = Array.isArray(prefs.notifTipos) ? prefs.notifTipos : [];

  function toggleTipo(valor) {
    const set = new Set(tipos);
    if (set.has(valor)) set.delete(valor);
    else set.add(valor);
    cambiar('notifTipos', [...set]);
  }

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

  async function guardarAvatar(valor) {
    setSubiendoAvatar(true);
    setError('');
    setOk('');
    try {
      const res = await fetch('/api/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: valor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setAvatar(data.avatar ?? null);
      setOk(valor ? '✓ Foto actualizada' : '✓ Foto quitada');
      // El sidebar se pinta en el servidor: recargamos para verla allí.
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la foto.');
    } finally {
      setSubiendoAvatar(false);
    }
  }

  async function subirAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La foto debe ser una imagen (JPG, PNG, WebP o GIF).');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('La imagen no puede superar 6 MB.');
      return;
    }

    setSubiendoAvatar(true);
    setError('');
    setOk('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/files', { method: 'POST', body: fd });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson.error ?? `Subida falló (${up.status})`);
      if (!upJson?.id) throw new Error('La subida no devolvió ningún archivo.');
      await guardarAvatar(upJson.id);
    } catch (err) {
      setError(err.message ?? 'No se pudo subir la foto.');
      setSubiendoAvatar(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{ok}</div>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Perfil</h2>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-lg font-semibold flex items-center justify-center shrink-0 overflow-hidden">
            {avatar ? (
              <img
                src={`/api/assets/${avatar}?width=128&height=128&fit=cover`}
                alt="Tu foto de perfil"
                className="w-full h-full object-cover"
              />
            ) : (
              iniciales
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-900">Foto de perfil</p>
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">
              Tu cara, un logo o lo que quieras. Se verá en el menú lateral y junto a tus comentarios.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  subiendoAvatar
                    ? 'bg-ink-100 text-ink-400 cursor-not-allowed'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                {subiendoAvatar ? 'Subiendo…' : avatar ? 'Cambiar foto' : 'Subir foto'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={subirAvatar}
                  disabled={subiendoAvatar}
                  className="hidden"
                />
              </label>
              {avatar && (
                <button
                  type="button"
                  onClick={() => guardarAvatar(null)}
                  disabled={subiendoAvatar}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                >
                  Quitar foto
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {puedeCrear && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Interfaz</h2>
          <div className="card p-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">Mostrar el panel «Nueva publicación»</p>
              <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                Si lo desactivas, el calendario ocupa todo el ancho y el formulario se abre con el botón
                «Añadir publicación» de la barra de filtros.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.panelNueva !== false}
              disabled={saving === 'panelNueva'}
              onClick={() => cambiar('panelNueva', prefs.panelNueva === false)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${prefs.panelNueva !== false ? 'bg-brand-600' : 'bg-ink-300'}`}
              title={prefs.panelNueva !== false ? 'Desactivar' : 'Activar'}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs.panelNueva !== false ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Notificaciones</h2>
        <div className="card p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-ink-900">Avisos por email</p>
            <p className="text-xs text-ink-500 mt-1">
              La campanita siempre se rellena con lo que elijas abajo; aquí decides qué llega al correo.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {NOTIF_EMAIL_OPCIONES.map((o) => {
                const activo = prefs.notifEmail === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={saving === 'notifEmail'}
                    onClick={() => cambiar('notifEmail', o.value)}
                    className={[
                      'px-3 py-2 rounded-lg border text-sm font-medium text-center transition disabled:opacity-50',
                      activo
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white text-ink-700 border-ink-200 hover:border-brand-300',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {prefs.notifEmail === 'diario' && (
              <p className="text-[11px] text-ink-400 mt-2">
                El resumen diario se envía a las 9:00 con los avisos pendientes de ese día.
              </p>
            )}
          </div>

          <div className="border-t border-ink-100 pt-4">
            <p className="text-sm font-semibold text-ink-900">Avisarme de</p>
            <div className="mt-2 space-y-2">
              {NOTIF_TIPOS_OPCIONES.map((o) => {
                const activo = tipos.includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activo}
                      disabled={saving === 'notifTipos'}
                      onChange={() => toggleTipo(o.value)}
                      className="w-4 h-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/40"
                    />
                    <span className="text-sm text-ink-700">{o.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-400 mt-2">Se aplica tanto a la campanita como al email.</p>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-ink-400">
        Estas preferencias se guardan en tu cuenta y solo te afectan a ti.
      </p>
    </div>
  );
}
