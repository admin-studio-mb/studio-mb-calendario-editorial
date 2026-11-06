import { useState, useEffect, useMemo } from 'react';
import { addPublicacion, updatePublicacion, removePublicacion } from '../stores/publicaciones.js';
import DateField from './DateField.jsx';
import TimePicker from './TimePicker.jsx';
import { toISOlocal, parseFechaPublicacion } from '../lib/fecha.js';

const FORMATOS = ['post', 'reel', 'carrusel', 'story'];
const ESTADOS = ['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado'];

/** Title Case con soporte de acentos: 'post' → 'Post', 'revision' → 'Revisión'. */
const LABEL_OVERRIDES = {
  post: 'Post',
  reel: 'Reel',
  carrusel: 'Carrusel',
  story: 'Story',
  borrador: 'Borrador',
  revision: 'Revisión texto',
  en_diseno: 'En diseño',
  revision_diseno: 'Revisión diseño',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
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

// ── Slides (repeater) ────────────────────────────────────────────────────────
// Cada slide: { key, texto, imagen }
//   - `imagen`: URL de la foto (Unsplash, Drive, cualquier imagen http).
//     Legacy: también admite uuid de directus_files (se sirve por /api/assets/<id>).
// El campo JSON `imagenes_fondo` de Directus guarda [{ texto, imagen }].

let slideKeySeq = 0;
function newSlideKey() {
  slideKeySeq += 1;
  return `slide-${Date.now()}-${slideKeySeq}`;
}

function emptySlide() {
  return { key: newSlideKey(), texto: '', imagen: '' };
}

/**
 * Convierte un enlace pegado por el usuario en una URL que <img> puede
 * cargar directamente:
 *   - Drive "file/d/<ID>/view" u "open?id=<ID>" → lh3.googleusercontent.com
 *     (CDN directo de Google; el enlace normal de Drive no renderiza en <img>).
 *   - Unsplash "unsplash.com/photos/<slug>" → endpoint de descarga (redirect).
 *   - Cualquier otra URL → tal cual.
 */
function normalizarImagenUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(s);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  m = /drive\.google\.com\/open\?id=([\w-]+)/.exec(s);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  if (/unsplash\.com\/photos\/[\w-]+/i.test(s) && !/images\.unsplash\.com/i.test(s)) {
    m = /unsplash\.com\/photos\/([\w-]+)/.exec(s);
    if (m) return `https://unsplash.com/photos/${m[1]}/download`;
  }
  return s;
}

/**
 * Convierte los datos persistidos (legacy o nuevos) a slides del repeater.
 *   - imagenes_fondo nuevo:  [{ texto, imagen }]  → igual.
 *   - imagenes_fondo legacy: ['url', 'uuid']      → slides sin texto.
 *   - textos_slides legacy:  textarea multilínea  → un slide por línea.
 */
function normalizeSlides(initial) {
  const raw = Array.isArray(initial.imagenes_fondo) ? initial.imagenes_fondo : [];
  const slides = raw.map((item) => {
    if (item && typeof item === 'object') {
      return { key: newSlideKey(), texto: item.texto ?? '', imagen: item.imagen ?? '' };
    }
    return { key: newSlideKey(), texto: '', imagen: item ?? '' };
  });
  if (slides.length === 0 && initial.textos_slides) {
    String(initial.textos_slides)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((linea) => slides.push({ key: newSlideKey(), texto: linea, imagen: '' }));
  }
  if (slides.length === 0) slides.push(emptySlide());
  return slides;
}

/** URL de vista previa de un slide (URL normalizada o proxy autenticado legacy). */
function previewOf(slide) {
  const s = String(slide.imagen ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return normalizarImagenUrl(s);
  return `/api/assets/${s}`;
}

/**
 * PostForm — formulario controlado para crear/editar una publicación.
 *
 * Props:
 *   - clientes: Array<{ id, nombre, tipos_contenido_disponibles: string[] }>
 *   - initial:  objeto publicación (o {} para creación).
 *   - onCancel: () => void
 *   - onSubmitted: (saved) => void  → se avisa tras guardar correctamente.
 *
 * Notas de comportamiento:
 *   - `tipo_contenido` se carga dinámicamente a partir del cliente elegido.
 *   - Los slides (texto + foto por slide) se guardan en `imagenes_fondo`
 *     como JSON [{ texto, imagen }]. `textos_slides` queda como campo legacy
 *     y se limpia (null) al guardar.
 *   - `diseno_final` (foto final del mes) SOLO se gestiona en edición: una
 *     publicación nueva debe pasar antes por revisión y diseño.
 */
export default function PostForm({
  clientes = [],
  initial = {},
  onCancel,
  onSubmitted,
}) {
  const [clienteId, setClienteId] = useState(initial.cliente_id ?? clientes[0]?.id ?? '');
  const [tipo, setTipo] = useState(initial.tipo_contenido ?? '');
  const [formato, setFormato] = useState(initial.formato ?? 'post');
  const [copywriting, setCopywriting] = useState(initial.copywriting ?? '');
  const [hashtags, setHashtags] = useState((initial.hashtags ?? []).join(', '));
  const [slides, setSlides] = useState(() => normalizeSlides(initial));
  // Fecha (Date) y hora ('HH:mm') gestionados por separado.
  const initialDate = parseFechaPublicacion(initial.fecha_publicacion);
  const [fecha, setFecha] = useState(initialDate);
  const [hora, setHora] = useState(
    initialDate
      ? `${String(initialDate.getHours()).padStart(2, '0')}:${String(initialDate.getMinutes()).padStart(2, '0')}`
      : '',
  );
  const [estado, setEstado] = useState(initial.estado ?? 'borrador');
  const [disenoFile, setDisenoFile] = useState(null);
  const [removeDiseno, setRemoveDiseno] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isEdit = Boolean(initial.id);

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

  // ── Handlers del repeater de slides ─────────────────────────────────────
  function addSlide() {
    setSlides((prev) => [...prev, emptySlide()]);
  }

  function removeSlide(slide) {
    setSlides((prev) => prev.filter((s) => s.key !== slide.key));
  }

  function setSlideTexto(key, texto) {
    setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, texto } : s)));
  }

  function setSlideImagen(key, imagen) {
    setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, imagen } : s)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!clienteId) return setError('Selecciona un cliente.');
    if (!fecha) return setError('Indica una fecha de publicación.');
    if (!hora) return setError('Indica una hora de publicación.');

    const existingDisenoId = typeof initial.diseno_final === 'object'
      ? (initial.diseno_final?.id ?? null)
      : (initial.diseno_final ?? null);

    const payload = {
      cliente_id: clienteId,
      tipo_contenido: tipo,
      formato,
      copywriting,
      hashtags: hashtags.split(',').map((t) => t.trim()).filter(Boolean),
      // Legacy: al guardar con el repeater, el textarea viejo queda limpio.
      textos_slides: null,
      fecha_publicacion: (() => {
        if (!fecha) return null;
        const [h, m] = hora.split(':').map(Number);
        const d = new Date(fecha);
        d.setHours(h || 0, m || 0, 0, 0);
        // Enviamos HORA DE PARED local (naive, sin Z). Si mandáramos
        // toISOString() (UTC), Directus guardaría la hora UTC y el calendario
        // mostraría una hora antes (2 en horario de verano).
        return toISOlocal(d);
      })(),
      estado,
      diseno_final: removeDiseno ? null : existingDisenoId,
    };

    try {
      setSubmitting(true);
      // 1) Normalizamos las URLs de las fotos (Drive/Unsplash → imagen directa).
      const slidesPersistidos = slides.map((s) => ({
        texto: (s.texto ?? '').trim(),
        imagen: normalizarImagenUrl(s.imagen) || null,
      }));
      payload.imagenes_fondo = slidesPersistidos.filter((s) => s.texto || s.imagen);

      // 2) Optimistic: añadimos/actualizamos en el store con un placeholder.
      const tempId = isEdit ? initial.id : `tmp-${Date.now()}`;
      const prevSnapshot = isEdit ? { ...initial } : null;
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
        // 3) Subida del diseño final si hay archivo nuevo (solo edición).
        if (disenoFile) {
          const fd = new FormData();
          fd.append('file', disenoFile);
          const upRes = await fetch('/api/files', { method: 'POST', body: fd });
          if (!upRes.ok) throw new Error(`Upload falló (${upRes.status})`);
          const upJson = await upRes.json();
          payload.diseno_final = upJson?.id ?? null;
        }

        // 4) POST (crear) o PATCH (editar) según modo.
        const url = isEdit
          ? `/api/publicaciones/${initial.id}`
          : '/api/publicaciones';
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

        // 5) Reemplazamos el placeholder por la versión real del server.
        if (isEdit) {
          if (saved && saved.id) {
            updatePublicacion({ ...saved, _pending: false });
          } else {
            updatePublicacion({ ...optimistic, _pending: false });
          }
        } else {
          removePublicacion(tempId);
          if (saved && saved.id) {
            addPublicacion({ ...saved, _pending: false });
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
          setSlides([emptySlide()]);
          setFecha(null);
          setHora('');
          setDisenoFile(null);
          setRemoveDiseno(false);
        } else {
          setDisenoFile(null);
          setRemoveDiseno(false);
        }
      } catch (err) {
        // 6) Rollback: restauramos el estado anterior o quitamos el placeholder.
        if (isEdit && prevSnapshot) {
          updatePublicacion({ ...prevSnapshot, _pending: false });
        } else {
          removePublicacion(tempId);
        }
        setError(err.message ?? 'Error guardando.');
        setInfo('');
      }
    } catch (err) {
      setError(err.message ?? 'Error guardando.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase = 'w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition disabled:bg-ink-50 disabled:text-ink-400';

  return (
    <form onSubmit={handleSubmit} className="card overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <h3 className="text-base font-semibold text-ink-900">
            {isEdit ? 'Editar publicación' : 'Nueva publicación'}
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

        {/* ── Repeater de slides ─────────────────────────────────────────── */}
        <Field label="Slides" hint="Cada slide tiene su texto y su foto. Pega la URL de la imagen: sirve el enlace para compartir de Google Drive, el de Unsplash o cualquier URL directa.">
          <div className="space-y-3">
            {slides.map((s, idx) => {
              const preview = previewOf(s);
              return (
                <div key={s.key} className="rounded-xl border border-ink-200 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                      Slide {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSlide(s)}
                      className="px-2 py-1 rounded text-xs font-medium text-ink-400 hover:text-red-600 hover:bg-red-50 transition"
                      aria-label={`Quitar slide ${idx + 1}`}
                    >
                      Quitar
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={s.texto}
                    onChange={(e) => setSlideTexto(s.key, e.target.value)}
                    placeholder={`Texto del slide ${idx + 1}…`}
                    className={inputBase}
                  />

                  <div className="mt-2 flex items-start gap-3">
                    <div className="shrink-0 relative w-16 aspect-[3/4]">
                      {preview ? (
                        <img
                          src={preview}
                          alt={`Foto slide ${idx + 1}`}
                          className="absolute inset-0 w-full h-full object-cover rounded-md border border-ink-200 bg-ink-100"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="absolute inset-0 rounded-md border border-dashed border-ink-300 bg-ink-50/50 flex flex-col items-center justify-center gap-0.5 text-ink-400">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          <span className="text-[9px] leading-none">Foto</span>
                        </div>
                      )}
                      {s.imagen && (
                        <button
                          type="button"
                          onClick={() => setSlideImagen(s.key, '')}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center shadow hover:bg-red-600 transition"
                          aria-label="Quitar foto"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        inputMode="url"
                        value={s.imagen}
                        onChange={(e) => setSlideImagen(s.key, e.target.value)}
                        placeholder="https://… (Unsplash, Drive, URL de la imagen)"
                        className={inputBase}
                      />
                      <p className="text-[11px] text-ink-400 mt-1">
                        Pega el enlace para compartir de Google Drive, la URL de Unsplash o cualquier imagen.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addSlide}
              className="w-full py-2 rounded-lg border border-dashed border-ink-300 text-sm font-medium text-ink-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/40 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Añadir slide
            </button>
          </div>
        </Field>

        {/* Diseño final: SOLO en edición (una publicación nueva debe pasar
            antes por revisión y diseño). */}
        {isEdit && (
          <Field label="Diseño final" hint="Foto definitiva que verá el cliente en el mockup del feed.">
            <input
              id="diseno"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                setDisenoFile(e.target.files?.[0] ?? null);
                setRemoveDiseno(false);
              }}
              className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-white hover:file:bg-brand-700 file:cursor-pointer"
            />
            {(() => {
              const currentId = typeof initial.diseno_final === 'object'
                ? initial.diseno_final?.id
                : initial.diseno_final;
              if (!currentId || removeDiseno || disenoFile) return null;
              return (
                <div className="mt-2 flex items-center gap-3 p-2 rounded-lg border border-ink-100 bg-ink-50/50">
                  <a
                    href={`/api/assets/${currentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-md overflow-hidden border border-ink-200 bg-white shrink-0 flex items-center justify-center"
                  >
                    <img
                      src={`/api/assets/${currentId}`}
                      alt="Diseño actual"
                      className="w-full h-full object-cover"
                    />
                  </a>
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/api/assets/${currentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand-600 hover:underline block truncate"
                    >
                      Ver diseño subido ↗
                    </a>
                    <p className="text-[11px] text-ink-400 font-mono truncate">{String(currentId).slice(0, 12)}…</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveDiseno(true)}
                    className="px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50 transition"
                  >
                    Quitar
                  </button>
                </div>
              );
            })()}
          </Field>
        )}
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
