// ============================================================================
//  src/components/ClienteForm.jsx
// ----------------------------------------------------------------------------
//  Modal para crear/editar un cliente. Subida de logo vía /api/files.
//  Tipos de contenido como chips editables (chips = string[]).
// ============================================================================

import { useState, useRef } from 'react';
import { REDES } from '../lib/redes.js';
import { MARCA_DEFECTO, normalizarHex } from '../lib/marca.js';
import RedIcon from './RedIcon.jsx';

/**
 * Estado inicial de redes:
 *  - Si el cliente ya tiene `redes` → tal cual.
 *  - Si es legacy (solo tipos_contenido_disponibles) → Instagram con esos
 *    tipos + LinkedIn/Facebook con los defaults.
 *  - Cliente nuevo → las tres redes con sus tipos por defecto.
 */
function redesIniciales(initial) {
  const raw = Array.isArray(initial.redes) ? initial.redes.filter((r) => r && r.red) : [];
  if (raw.length > 0) {
    return raw.map((r) => ({ red: r.red, tipos: Array.isArray(r.tipos) ? r.tipos : [] }));
  }
  const legacy = Array.isArray(initial.tipos_contenido_disponibles)
    ? initial.tipos_contenido_disponibles.filter(Boolean)
    : [];
  const all = REDES.map((r) => ({ red: r.id, tipos: [...r.tiposDefault] }));
  if (legacy.length > 0) {
    return all.map((r) => (r.red === 'instagram' ? { ...r, tipos: legacy } : r));
  }
  return all;
}

export default function ClienteForm({
  initial = {},
  onCancel,
  onSubmitted,
}) {
  const isEdit = Boolean(initial.id);
  const [nombre, setNombre] = useState(initial.nombre ?? '');
  const [redes, setRedes] = useState(() => redesIniciales(initial));
  const [nuevoTipo, setNuevoTipo] = useState({}); // { redId: 'texto en curso' }
  const [logoId, setLogoId] = useState(initial.logo ?? null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [colorMarca, setColorMarca] = useState(normalizarHex(initial.color_marca) ?? MARCA_DEFECTO);
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

  function toggleRed(redId, activa) {
    setRedes((prev) => {
      if (activa) {
        if (prev.some((r) => r.red === redId)) return prev;
        const def = REDES.find((r) => r.id === redId)?.tiposDefault ?? [];
        return [...prev, { red: redId, tipos: [...def] }];
      }
      return prev.filter((r) => r.red !== redId);
    });
  }

  function addTipoRed(redId) {
    const t = (nuevoTipo[redId] ?? '').trim();
    if (!t) return;
    setRedes((prev) => prev.map((r) => (
      r.red === redId && !r.tipos.includes(t) ? { ...r, tipos: [...r.tipos, t] } : r
    )));
    setNuevoTipo((prev) => ({ ...prev, [redId]: '' }));
  }

  function removeTipoRed(redId, t) {
    setRedes((prev) => prev.map((r) => (
      r.red === redId ? { ...r, tipos: r.tipos.filter((x) => x !== t) } : r
    )));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    const redesActivas = redes.filter((r) => r.tipos.length > 0);
    if (redesActivas.length === 0) {
      return setError('Activa al menos una red y asígnale tipos de post.');
    }
    // El campo legacy se mantiene sincronizado (unión de tipos) para no
    // romper validaciones antiguas ni clientes que aún no tienen `redes`.
    const tiposUnion = [...new Set(redesActivas.flatMap((r) => r.tipos))];

    setSubmitting(true);

    try {
      let uploadedLogoId = logoId;
      if (logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile);
        const upRes = await fetch('/api/files', { method: 'POST', body: fd });
        if (!upRes.ok) {
          const errJson = await upRes.json().catch(() => null);
          throw new Error(errJson?.error || `Subida de logo falló (${upRes.status})`);
        }
        const upJson = await upRes.json();
        uploadedLogoId = upJson?.id ?? null;
      }

      const payload = {
        nombre: nombre.trim(),
        tipos_contenido_disponibles: tiposUnion,
        redes: redesActivas.map((r) => ({ red: r.red, tipos: r.tipos })),
        logo: uploadedLogoId || null,
        color_marca: colorMarca,
      };

      const url = isEdit
        ? `/api/clientes/${initial.id}`
        : '/api/clientes';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Guardar falló (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) msg = parsed.detail?.errors?.[0]?.message ? `${parsed.error}: ${parsed.detail.errors[0].message}` : parsed.error;
        } catch {
          if (text) msg = `${msg}: ${text}`;
        }
        throw new Error(msg);
      }
      const saved = await res.json().catch(() => null);
      onSubmitted?.(saved);
    } catch (err) {
      const m = err?.message ?? '';
      if (/fetch failed|failed to fetch|load failed/i.test(m)) {
        setError('Error de conexión con el servidor (fetch failed). Comprueba que la sesión sigue activa o recarga la página.');
      } else {
        setError(m || 'Error guardando.');
      }
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
              <img src={`/api/assets/${logoId}`} alt="" className="w-full h-full object-cover" />
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

      {/* Color de marca */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">Color de marca</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={colorMarca}
            onChange={(e) => setColorMarca(e.target.value)}
            className="w-10 h-10 rounded-lg border border-ink-200 bg-white p-1 cursor-pointer"
            aria-label="Color de marca"
          />
          <input
            type="text"
            value={colorMarca}
            onChange={(e) => {
              const v = e.target.value;
              setColorMarca(v);
            }}
            onBlur={(e) => {
              const hex = normalizarHex(e.target.value);
              setColorMarca(hex ?? MARCA_DEFECTO);
            }}
            className="w-32 px-3 py-2 rounded-lg border border-ink-200 text-sm text-ink-800 font-mono focus:border-brand-500 focus:outline-none"
            aria-label="Color en hexadecimal"
          />
          <button
            type="button"
            onClick={() => setColorMarca(MARCA_DEFECTO)}
            className="text-xs font-medium text-ink-500 hover:text-ink-800"
          >
            Restablecer
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-400">
          Se usa en la cabecera, los botones y el PDF de este cliente.
        </p>
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

      {/* Redes sociales y tipos de post por red */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">Redes sociales</span>
        <p className="text-[11px] text-ink-400 mb-2">
          Activa las redes con las que trabajáis con este cliente y define los tipos de post de cada una.
        </p>
        <div className="space-y-3">
          {REDES.map((meta) => {
            const activa = redes.find((r) => r.red === meta.id);
            return (
              <div
                key={meta.id}
                className={`rounded-xl border p-3 transition ${activa ? 'border-ink-200 bg-white' : 'border-ink-100 bg-ink-50/40'}`}
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(activa)}
                    onChange={(e) => toggleRed(meta.id, e.target.checked)}
                    className="accent-brand-600"
                  />
                  <RedIcon red={meta.id} className="w-4 h-4" conTitulo={false} />
                  <span className="text-sm font-medium text-ink-800">{meta.nombre}</span>
                </label>

                {activa && (
                  <div className="mt-2 pl-6">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {activa.tipos.length === 0 && (
                        <span className="text-[11px] text-ink-400">Sin tipos definidos.</span>
                      )}
                      {activa.tipos.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-100"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => removeTipoRed(meta.id, t)}
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
                        value={nuevoTipo[meta.id] ?? ''}
                        onChange={(e) => setNuevoTipo((prev) => ({ ...prev, [meta.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTipoRed(meta.id);
                          }
                        }}
                        placeholder={`Ej: ${meta.tiposDefault.join(', ')}`}
                        className={inputBase}
                      />
                      <button
                        type="button"
                        onClick={() => addTipoRed(meta.id)}
                        className="shrink-0 px-3 py-2 rounded-lg bg-ink-100 text-sm font-medium text-ink-700 hover:bg-ink-200 transition"
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
