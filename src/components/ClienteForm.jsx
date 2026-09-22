// ============================================================================
//  src/components/ClienteForm.jsx
// ----------------------------------------------------------------------------
//  Modal para crear/editar un cliente. Subida de logo vía /api/files.
//  Tipos de contenido como chips editables (chips = string[]).
// ============================================================================

import { useState, useRef } from 'react';

export default function ClienteForm({
  initial = {},
  apiBase = '',
  directusBaseUrl = '',
  onCancel,
  onSubmitted,
}) {
  const isEdit = Boolean(initial.id);
  const [nombre, setNombre] = useState(initial.nombre ?? '');
  const [tipos, setTipos] = useState(initial.tipos_contenido_disponibles ?? []);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [logoId, setLogoId] = useState(initial.logo ?? null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Cuando seleccionan archivo, previsualiza.
  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function addTipo() {
    const t = nuevoTipo.trim();
    if (!t) return;
    if (tipos.includes(t)) {
      setNuevoTipo('');
      return;
    }
    setTipos([...tipos, t]);
    setNuevoTipo('');
  }

  function removeTipo(t) {
    setTipos(tipos.filter((x) => x !== t));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    if (tipos.length === 0) return setError('Añade al menos un tipo de contenido.');

    setSubmitting(true);

    try {
      let uploadedLogoId = logoId;
      if (logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile);
        const upRes = await fetch(`${apiBase}/api/files`, { method: 'POST', body: fd });
        if (!upRes.ok) throw new Error(`Subida de logo falló (${upRes.status})`);
        const upJson = await upRes.json();
        uploadedLogoId = upJson?.id ?? null;
      }

      const payload = {
        nombre: nombre.trim(),
        tipos_contenido_disponibles: tipos,
        logo: uploadedLogoId || null,
      };

      const url = isEdit
        ? `${apiBase}/api/clientes/${initial.id}`
        : `${apiBase}/api/clientes`;
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Guardar falló (${res.status}): ${text || res.statusText}`);
      }
      const saved = await res.json().catch(() => null);
      onSubmitted?.(saved);
    } catch (err) {
      setError(err.message ?? 'Error guardando.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase = 'w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>{error}</span>
        </div>
      )}

      {/* Logo */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">Logo</span>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg bg-ink-100 border border-ink-200 overflow-hidden flex items-center justify-center">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="w-full h-full object-cover" />
            ) : logoId ? (
              <img src={`${apiBase.replace(/\/$/, '')}/api/assets/${logoId}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-8 h-8 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            )}
          </div>
          <div className="flex-1 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 rounded-lg border border-ink-200 text-sm font-medium text-ink-700 hover:bg-ink-50 transition"
            >
              {logoId || logoPreview ? 'Cambiar' : 'Subir logo'}
            </button>
            {(logoId || logoPreview) && (
              <button
                type="button"
                onClick={() => {
                  setLogoId(null);
                  setLogoPreview(null);
                  setLogoFile(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
              >
                Quitar
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        </div>
      </div>

      {/* Nombre */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5" htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del cliente"
          className={inputBase}
          required
        />
      </div>

      {/* Tipos de contenido */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">Tipos de contenido</span>
        <div className="flex flex-wrap gap-2 mb-2">
          {tipos.length === 0 && (
            <span className="text-xs text-ink-400">Aún no hay tipos definidos.</span>
          )}
          {tipos.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-100">
              {t}
              <button
                type="button"
                onClick={() => removeTipo(t)}
                className="text-brand-500 hover:text-brand-700"
                aria-label={`Quitar ${t}`}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoTipo}
            onChange={(e) => setNuevoTipo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTipo();
              }
            }}
            placeholder="Ej: Promo, Noticia, Behind the scenes…"
            className={inputBase}
          />
          <button
            type="button"
            onClick={addTipo}
            className="shrink-0 px-3 py-2 rounded-lg bg-ink-100 text-sm font-medium text-ink-700 hover:bg-ink-200 transition"
          >
            Añadir
          </button>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-ink-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-100 transition"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-medium shadow-sm hover:shadow-md hover:from-brand-700 hover:to-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear cliente')}
        </button>
      </div>
    </form>
  );
}
