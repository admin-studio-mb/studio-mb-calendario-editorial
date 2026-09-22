import { useState, useEffect, useMemo } from 'react';
import { addPublicacion, updatePublicacion, removePublicacion } from '../stores/publicaciones.js';
import DateField from './DateField.jsx';
import TimePicker from './TimePicker.jsx';

const FORMATOS = ['post', 'reel', 'carrusel', 'story'];
const ESTADOS = ['borrador', 'revision', 'aprobado'];

/** Title Case con soporte de acentos: 'post' → 'Post', 'revision' → 'Revisión'. */
const LABEL_OVERRIDES = {
  post: 'Post',
  reel: 'Reel',
  carrusel: 'Carrusel',
  story: 'Story',
  borrador: 'Borrador',
  revision: 'Revisión',
  aprobado: 'Aprobado',
};

// Componente reutilizable DEFINIDO FUERA del componente principal.
// Si lo definiera dentro, en cada re-render de PostForm React trataría
// cada Field como un componente nuevo (distinta referencia), lo que hace
// que desmonte y vuelva a montar el DOM interno, perdiendo el foco del
// input en cada keystroke.
//
// Usa <div> en lugar de <label> porque el <label> que envuelve un input
// re-asocia su target en cada render y eso interfiere con el foco.
function Field({ label, hint, children }) {
  return (
    <div className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400 mt-1">{hint}</span>}
    </div>
  );
}

function titleCase(s) {
  if (!s) return '';
  if (LABEL_OVERRIDES[s]) return LABEL_OVERRIDES[s];
  // Para valores libres (Promo, Noticia, Behind the scenes...) capitalizamos
  // la primera letra de cada palabra respetando el resto.
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/**
 * PostForm — formulario controlado para crear/editar una publicación.
 *
 * Props:
 *   - clientes: Array<{ id, nombre, tipos_contenido_disponibles: string[] }>
 *   - initial:  objeto publicación (o {} para creación).
 *   - onSubmit: (payload) => Promise<void> | void
 *   - onCancel: () => void
 *   - uploadFile(file): Promise<{ id }>  → helper opcional para subir el diseño.
 *
 * Notas de comportamiento:
 *   - `tipo_contenido` se carga dinámicamente a partir del cliente elegido.
 *   - `imagenes_fondo` se modela como JSON con array de URLs o IDs.
 *   - `diseno_final` se sube como File a Directus (campo Files).
 */
export default function PostForm({
  clientes = [],
  initial = {},
  onSubmit,
  onCancel,
  onSubmitted,
  uploadFile,
  apiBase = '',
}) {
  const [clienteId, setClienteId] = useState(initial.cliente_id ?? clientes[0]?.id ?? '');
  const [tipo, setTipo] = useState(initial.tipo_contenido ?? '');
  const [formato, setFormato] = useState(initial.formato ?? 'post');
  const [copywriting, setCopywriting] = useState(initial.copywriting ?? '');
  const [hashtags, setHashtags] = useState((initial.hashtags ?? []).join(', '));
  const [textosSlides, setTextosSlides] = useState(initial.textos_slides ?? '');
  const [imagenes, setImagenes] = useState((initial.imagenes_fondo ?? []).join('\n'));
  // Fecha (Date) y hora ('HH:mm') gestionados por separado.
  const initialDate = initial.fecha_publicacion ? new Date(initial.fecha_publicacion) : null;
  const [fecha, setFecha] = useState(initialDate);
  const [hora, setHora] = useState(
    initialDate
      ? `${String(initialDate.getHours()).padStart(2, '0')}:${String(initialDate.getMinutes()).padStart(2, '0')}`
      : '',
  );
  const [estado, setEstado] = useState(initial.estado ?? 'borrador');
  const [disenoFile, setDisenoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const cliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  );

  const tiposDisponibles = useMemo(
    () => (Array.isArray(cliente?.tipos_contenido_disponibles) ? cliente.tipos_contenido_disponibles : []),
    [cliente],
  );

  // Si cambia el cliente y el tipo anterior no está disponible, lo cambiamos
  // al primero de la lista. Si la lista está vacía, limpiamos.
  useEffect(() => {
    if (!cliente) return;
    if (!tiposDisponibles.length) {
      if (tipo !== '') setTipo('');
      return;
    }
    if (!tiposDisponibles.includes(tipo)) {
      // Default al primero disponible (UX: no quieres quedarte con el dropdown vacío).
      setTipo(tiposDisponibles[0]);
    }
  }, [tiposDisponibles, tipo, cliente]);

  // Escuchamos "studio-mb:new-post" para pre-rellenar la fecha cuando el
  // usuario hace click en un día del calendario. El detalle es { date: Date }.
  useEffect(() => {
    function onNew(ev) {
      const date = ev.detail?.date;
      if (!(date instanceof Date) || isNaN(date.getTime())) return;
      // Sólo pre-rellenamos fecha/hora; no tocamos cliente, tipo, etc.
      // (eso lo decide el usuario en el form).
      setFecha(date);
      setHora('09:00');
      // Scroll al form para que se vea.
      const card = document.querySelector('form.card');
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    window.addEventListener('studio-mb:new-post', onNew);
    return () => window.removeEventListener('studio-mb:new-post', onNew);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!clienteId) return setError('Selecciona un cliente.');
    if (!fecha) return setError('Indica una fecha de publicación.');
    if (!hora) return setError('Indica una hora de publicación.');

    const isEdit = Boolean(initial.id);

    let disenoFinalId = initial.diseno_final?.id ?? null;
    if (disenoFile && uploadFile) {
      try {
        const uploaded = await uploadFile(disenoFile);
        disenoFinalId = uploaded?.id ?? disenoFinalId;
      } catch (err) {
        return setError(`Subida fallida: ${err.message}`);
      }
    }

    const payload = {
      cliente_id: clienteId,
      tipo_contenido: tipo,
      formato,
      copywriting,
      hashtags: hashtags.split(',').map((t) => t.trim()).filter(Boolean),
      textos_slides: textosSlides,
      imagenes_fondo: imagenes.split('\n').map((s) => s.trim()).filter(Boolean),
      fecha_publicacion: (() => {
        if (!fecha) return null;
        const [h, m] = hora.split(':').map(Number);
        const d = new Date(fecha);
        d.setHours(h || 0, m || 0, 0, 0);
        return d.toISOString();
      })(),
      estado,
      diseno_final: disenoFinalId,
    };

    try {
      setSubmitting(true);
      // Si el front nos ha pasado un `apiBase`, creamos/actualizamos la
      // publicación directamente vía el endpoint SSR.
      if (apiBase) {
        // 1) Optimistic: añadimos/actualizamos en el store con un placeholder.
        const tempId = isEdit ? `tmp-${initial.id}` : `tmp-${Date.now()}`;
        const optimistic = {
          id: tempId,
          ...(isEdit ? initial : {}),
          ...payload,
          _pending: true,
        };
        if (isEdit) {
          updatePublicacion(optimistic);
        } else {
          addPublicacion(optimistic);
        }
        setInfo(isEdit ? 'Actualizando publicación…' : 'Guardando publicación…');

        try {
          // 2) Subida del diseño si hay archivo nuevo.
          if (disenoFile) {
            const fd = new FormData();
            fd.append('file', disenoFile);
            const upRes = await fetch(`${apiBase}/api/files`, { method: 'POST', body: fd });
            if (!upRes.ok) throw new Error(`Upload falló (${upRes.status})`);
            const upJson = await upRes.json();
            payload.diseno_final = upJson?.id ?? null;
          }

          // 3) POST (crear) o PATCH (editar) según modo.
          const url = isEdit
            ? `${apiBase}/api/publicaciones/${initial.id}`
            : `${apiBase}/api/publicaciones`;
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

          // 4) Reemplazamos el placeholder por la versión real del server.
          if (isEdit) {
            removePublicacion(tempId);
            if (saved && saved.id) {
              updatePublicacion(saved);
            }
          } else {
            removePublicacion(tempId);
            if (saved && saved.id) {
              addPublicacion(saved);
            }
          }
          setInfo(isEdit ? '✓ Publicación actualizada' : '✓ Publicación guardada');
          setTimeout(() => setInfo(''), 2500);

          // En modo edición avisamos al padre (cerrará el modal).
          if (isEdit && onSubmitted) {
            onSubmitted(saved);
          }

          if (!isEdit) {
            // Limpiamos el form solo en modo creación.
            setClienteId(clientes[0]?.id ?? '');
            setTipo('');
            setCopywriting('');
            setHashtags('');
            setTextosSlides('');
            setImagenes('');
            setFecha(null);
            setHora('');
            setDisenoFile(null);
          } else {
            setDisenoFile(null);
          }
          return;
        } catch (err) {
          // 5) Rollback: quitamos el placeholder y avisamos al usuario.
          removePublicacion(tempId);
          setError(err.message ?? 'Error guardando.');
          setInfo('');
          return;
        }
      }

      await onSubmit?.(payload);
    } catch (err) {
      setError(err.message ?? 'Error guardando.');
    } finally {
      setSubmitting(false);
    }
  }

  // Field está definido FUERA del componente (línea ~28) para no recrearlo
  // en cada render (eso hacía perder el foco al escribir).
  //
  // inputBase también va fuera para evitar recreación en cada render.

  const inputBase = 'w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition disabled:bg-ink-50 disabled:text-ink-400';

  return (
    <form onSubmit={handleSubmit} className="card overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <h3 className="text-base font-semibold text-ink-900">
            {initial.id ? 'Editar publicación' : 'Nueva publicación'}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">Se publica al pulsar Guardar.</p>
        </div>
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        </span>
      </header>

      <div className="p-5 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>{error}</span>
          </div>
        )}

        {info && !error && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            <span>{info}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Cliente">
            <select id="cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={inputBase}>
              <option value="" disabled>— Selecciona —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de contenido">
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={!cliente || !tiposDisponibles.length} className={inputBase}>
              {!tiposDisponibles.length && <option value="">—</option>}
              {tiposDisponibles.map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </select>
          </Field>

          <Field label="Formato">
            <select id="formato" value={formato} onChange={(e) => setFormato(e.target.value)} className={inputBase}>
              {FORMATOS.map((f) => <option key={f} value={f}>{titleCase(f)}</option>)}
            </select>
          </Field>

          <Field label="Estado">
            <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={inputBase}>
              {ESTADOS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </Field>

          <Field label="Fecha de publicación">
            <DateField
              value={fecha}
              onChange={setFecha}
              placeholder="Selecciona día"
            />
          </Field>

          <Field label="Hora de publicación">
            <TimePicker value={hora} onChange={setHora} minuteStep={5} />
          </Field>
        </div>

        <Field label="Copywriting">
          <textarea
            id="copy"
            rows={3}
            value={copywriting}
            onChange={(e) => setCopywriting(e.target.value)}
            className={inputBase}
            placeholder="Texto principal del post…"
          />
        </Field>

        <Field label="Hashtags" hint="Separados por comas. Ej: #branding, #estudio">
          <input
            id="hash"
            type="text"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#branding, #estudio"
            className={inputBase}
          />
        </Field>

        <Field label="Textos por slide">
          <textarea
            id="slides"
            rows={2}
            value={textosSlides}
            onChange={(e) => setTextosSlides(e.target.value)}
            placeholder="Slide 1: …&#10;Slide 2: …"
            className={inputBase}
          />
        </Field>

        <Field label="Imágenes de fondo" hint="Una URL por línea. Se puede migrar a Files M2M en Directus.">
          <textarea
            id="imgs"
            rows={2}
            value={imagenes}
            onChange={(e) => setImagenes(e.target.value)}
            placeholder="https://…&#10;https://…"
            className={inputBase}
          />
        </Field>

        <Field label="Diseño final">
          <input
            id="diseno"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setDisenoFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-white hover:file:bg-brand-700 file:cursor-pointer"
          />
          {initial.diseno_final?.id && (
            <p className="text-xs text-ink-500 mt-1">Archivo actual: {initial.diseno_final.id}</p>
          )}
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-100 transition">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-medium shadow-sm hover:shadow-md hover:from-brand-700 hover:to-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              Guardando…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8 M7 3v5h8"/></svg>
              Guardar
            </>
          )}
        </button>
      </div>
    </form>
  );
}
