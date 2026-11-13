import { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { selectedPostIdStore, publicacionesStore } from '../stores/publicaciones.js';
import { initials } from '../lib/initials.js';
import {
  MAX_ADJUNTOS, MAX_BYTES_ADJUNTO, MAX_BYTES_ENTRADA,
  TIPOS_ADJUNTO, urlAdjunto, urlAdjuntoOriginal, comprimirImagen,
} from '../lib/adjuntos.js';

/**
 * CommentThread — hilo de comentarios atado al post seleccionado.
 *
 * Lee `selectedPostIdStore` para saber qué post mostrar. Si no hay selección,
 * muestra un placeholder invitando a elegir uno.
 *
 * Props:
 *   - currentUser: { id, first_name, last_name, email }
 */
export default function CommentThread({ currentUser }) {
  const selectedPostId = useStore(selectedPostIdStore);
  const publicaciones = useStore(publicacionesStore);
  const post = publicaciones.find((p) => p.id === selectedPostId) ?? null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]); // [{ key, file, preview }]
  const [enviando, setEnviando] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Refrescar lista cuando cambia el post seleccionado.
  useEffect(() => {
    if (!post?.id) {
      setItems([]);
      return;
    }
    let cancel = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/comentarios?publicacion_id=${post.id}`);
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        if (!cancel) setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancel) setError(err.message ?? 'Error cargando comentarios.');
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [post?.id]);

  // Reset del formulario al cambiar de post.
  useEffect(() => {
    setTexto('');
    setEditingId(null);
    setEditText('');
    setError('');
    setAdjuntos((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.preview));
      return [];
    });
  }, [post?.id]);

  // ── Adjuntos ────────────────────────────────────────────────────────────
  async function addFiles(list) {
    const arr = Array.from(list ?? []);
    const nuevos = [];
    setError('');

    for (const f of arr) {
      if (!String(f.type ?? '').startsWith('image/')) {
        setError(`"${f.name}" no es una imagen.`);
        continue;
      }
      if (f.size > MAX_BYTES_ENTRADA) {
        setError(`"${f.name}" supera los 15 MB.`);
        continue;
      }
      if (adjuntos.length + nuevos.length >= MAX_ADJUNTOS) {
        setError(`Máximo ${MAX_ADJUNTOS} imágenes por comentario.`);
        break;
      }
      // Redimensiona/comprime antes de subir (salvo GIF y archivos pequeños).
      const optimizada = await comprimirImagen(f);
      if (optimizada.size > MAX_BYTES_ADJUNTO) {
        setError(`"${f.name}" sigue superando los 6 MB tras optimizarla.`);
        continue;
      }
      nuevos.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: optimizada,
        original: f,
        preview: URL.createObjectURL(optimizada),
      });
    }

    if (nuevos.length) setAdjuntos((a) => [...a, ...nuevos]);
  }

  function removeAdjunto(key) {
    setAdjuntos((arr) => {
      const target = arr.find((a) => a.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return arr.filter((a) => a.key !== key);
    });
  }

  /** Sube las imágenes pendientes a Directus y devuelve los adjuntos. */
  async function subirAdjuntos() {
    const subidos = [];
    for (const a of adjuntos) {
      const fd = new FormData();
      fd.append('file', a.file, a.file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`No se pudo subir "${a.file.name}" (${res.status}) ${text}`.trim());
      }
      const data = await res.json();
      subidos.push({
        id: data.id,
        filename: data.filename_download ?? a.file.name,
        type: a.file.type,
      });
    }
    return subidos;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const t = texto.trim();
    const hayAdjuntos = adjuntos.length > 0;
    if ((!t && !hayAdjuntos) || !post?.id) return;
    setEnviando(true);
    setError('');
    try {
      // 1) Subir imágenes (si hay) y preparar los adjuntos definitivos.
      const subidos = hayAdjuntos ? await subirAdjuntos() : [];

      // 2) Optimista, ya con los adjuntos subidos.
      const tmpId = `tmp-${Date.now()}`;
      const optimistic = {
        id: tmpId,
        texto: t || null,
        adjuntos: subidos,
        fecha_creacion: new Date().toISOString(),
        usuario_id: currentUser ?? null,
        _pending: true,
      };
      setItems((arr) => [...arr, optimistic]);
      setTexto('');
      setAdjuntos((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.preview));
        return [];
      });

      const res = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicacion_id: post.id, texto: t, adjuntos: subidos }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Comentar falló (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const created = await res.json().catch(() => null);
      setItems((arr) =>
        arr.map((c) =>
          c.id === tmpId
            ? {
                ...created,
                usuario_id:
                  typeof created?.usuario_id === 'object' && created?.usuario_id
                    ? created.usuario_id
                    : (currentUser ?? created?.usuario_id ?? null),
                _pending: false,
              }
            : c,
        ),
      );
    } catch (err) {
      setItems((arr) => arr.filter((c) => !c._pending));
      setTexto(t); // devolvemos el texto al input
      setError(err.message ?? 'Error enviando comentario.');
    } finally {
      setEnviando(false);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditText(c.texto ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function saveEdit(id) {
    const t = editText.trim();
    if (!t) return;
    const prev = items.find((c) => c.id === id);
    // Optimista
    setItems((arr) => arr.map((c) => c.id === id ? { ...c, texto: t } : c));
    setEditingId(null);
    setEditText('');
    try {
      const res = await fetch(`/api/comentarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: t }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Editar falló (${res.status}): ${text || res.statusText}`);
      }
      const saved = await res.json().catch(() => null);
      if (saved) {
        setItems((arr) =>
          arr.map((c) =>
            c.id === id
              ? {
                  ...saved,
                  usuario_id:
                    typeof saved?.usuario_id === 'object' && saved?.usuario_id
                      ? saved.usuario_id
                      : (c.usuario_id ?? currentUser ?? null),
                }
              : c,
          ),
        );
      }
    } catch (err) {
      // Rollback
      if (prev) setItems((arr) => arr.map((c) => c.id === id ? prev : c));
      setError(err.message ?? 'Error editando.');
    }
  }

  async function deleteComment(id) {
    if (!confirm('¿Eliminar este comentario? Esta acción no se puede deshacer.')) return;
    const prev = items;
    setItems((arr) => arr.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/comentarios/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => '');
        throw new Error(`Eliminar falló (${res.status}): ${text || res.statusText}`);
      }
    } catch (err) {
      setItems(prev);
      setError(err.message ?? 'Error eliminando.');
    }
  }

  // Helpers ----------------------------------------------------------------

  function isMine(c) {
    if (!currentUser?.id) return false;
    const ownerId = typeof c.usuario_id === 'object' ? c.usuario_id?.id : c.usuario_id;
    return ownerId === currentUser.id;
  }

  function autor(c) {
    if (!c.usuario_id) return { nombre: 'Anónimo', user: null };
    const user = typeof c.usuario_id === 'object' ? c.usuario_id : null;
    if (user) {
      const fn = (user.first_name ?? '').trim();
      const ln = (user.last_name ?? '').trim();
      const nombre = [fn, ln].filter(Boolean).join(' ') || user.email || 'Anónimo';
      return { nombre, user };
    }
    return { nombre: 'Anónimo', user: null };
  }

  // Render -----------------------------------------------------------------

  if (!post) {
    return (
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h4 className="text-base font-semibold text-ink-900">Comentarios</h4>
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </span>
        </header>
        <div className="px-5 py-10 text-center text-sm text-ink-400">
          Selecciona una publicación para ver sus comentarios.
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden select-none">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-ink-900 truncate">
            {post.tipo_contenido ?? 'Publicación'}
          </h4>
          <p className="text-xs text-ink-500 mt-0.5">
            {items.length} {items.length === 1 ? 'mensaje' : 'mensajes'}
            {loading && <span className="ml-1 italic">· cargando…</span>}
          </p>
        </div>
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
      </header>

      {error && (
        <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs p-2.5">
          {error}
        </div>
      )}

      <ul className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
        {items.map((c) => {
          const { nombre, user } = autor(c);
          const isEditing = editingId === c.id;
          return (
            <li key={c.id} className={[
              'px-5 py-3.5 flex gap-3 transition',
              c._pending ? 'opacity-60' : 'hover:bg-ink-50/50',
            ].join(' ')}>
              <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-[11px] font-semibold flex items-center justify-center">
                {initials(user)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink-800 truncate">
                    {nombre}
                    {isMine(c) && <span className="ml-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">tú</span>}
                  </span>
                  <time dateTime={c.fecha_creacion} className="text-[11px] text-ink-400 shrink-0">
                    {c.fecha_creacion && !c._pending
                      ? formatDistanceToNow(parseISO(c.fecha_creacion), { addSuffix: true, locale: es })
                      : c._pending ? 'enviando…' : ''}
                  </time>
                </div>

                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(c.id)}
                        disabled={!editText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-500 hover:bg-ink-100 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.texto && (
                      <p className="mt-0.5 text-sm text-ink-700 whitespace-pre-line leading-relaxed">
                        {c.texto}
                      </p>
                    )}
                    {Array.isArray(c.adjuntos) && c.adjuntos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.adjuntos.map((a) => (
                          <a
                            key={a.id}
                            href={urlAdjuntoOriginal(a.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={a.filename ?? 'Abrir imagen'}
                            className="block"
                          >
                            <img
                              src={urlAdjunto(a.id, 360, 360)}
                              alt={a.filename ?? 'Adjunto'}
                              loading="lazy"
                              className="h-20 w-20 rounded-lg border border-ink-200 object-cover bg-ink-100 hover:opacity-90 transition"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {isMine(c) && (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="text-ink-500 hover:text-brand-600 font-medium"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="text-ink-500 hover:text-red-600 font-medium"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
        {items.length === 0 && !loading && (
          <li className="px-5 py-10 text-center text-sm text-ink-400">
            Sé el primero en comentar.
          </li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="px-5 py-3 border-t border-ink-100 bg-ink-50/50">
        {adjuntos.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 pl-10">
            {adjuntos.map((a) => (
              <div key={a.key} className="relative">
                <img
                  src={a.preview}
                  alt={a.file.name}
                  className="h-16 w-16 rounded-lg object-cover border border-ink-200 bg-white"
                />
                <span className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-ink-900/70 text-white text-[9px] text-center py-0.5 tabular-nums">
                  {Math.max(1, Math.round(a.file.size / 1024))} KB
                  {a.original && a.original.size > a.file.size && (
                    <span className="text-emerald-300"> · -{Math.round((1 - a.file.size / a.original.size) * 100)}%</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeAdjunto(a.key)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink-900 text-white text-xs leading-none flex items-center justify-center hover:bg-red-600 transition"
                  title="Quitar imagen"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-[11px] font-semibold flex items-center justify-center">
            {initials(currentUser ?? null)}
          </div>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Comentar en "${post.tipo_contenido ?? 'esta publicación'}"…`}
            className="flex-1 px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={TIPOS_ADJUNTO}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={enviando || adjuntos.length >= MAX_ADJUNTOS}
            title={adjuntos.length >= MAX_ADJUNTOS ? `Máximo ${MAX_ADJUNTOS} imágenes` : 'Adjuntar imagen'}
            className="p-2 rounded-lg text-ink-500 hover:text-brand-600 hover:bg-white border border-transparent hover:border-ink-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="submit"
            disabled={enviando || (!texto.trim() && adjuntos.length === 0)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {enviando ? '…' : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                Enviar
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
