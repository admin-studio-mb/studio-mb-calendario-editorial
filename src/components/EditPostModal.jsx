// ============================================================================
//  src/components/EditPostModal.jsx
// ----------------------------------------------------------------------------
//  Modal de detalle/revisión de una publicación. Se abre cuando Calendar
//  emite el evento `studio-mb:edit-post` con `detail: post`.
//
//  Según el rol del usuario:
//   - Equipo (Administrator y otros): PostForm completo + botones de flujo
//     (todas las transiciones) + eliminar.
//   - Cliente: vista de solo lectura + botones de confirmación permitidos
//     (confirmar texto / aprobar diseño / pedir cambios) + comentarios.
//     No edita, no crea, no borra, no publica.
//
//  Las transiciones vienen de src/lib/flujo.js, la misma fuente que valida
//  el endpoint PATCH en servidor.
// ============================================================================

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PostForm from './PostForm.jsx';
import CommentThread from './CommentThread.jsx';
import CopyButton from './CopyButton.jsx';
import { removePublicacion, updatePublicacion, addPublicacion, selectedPostIdStore } from '../stores/publicaciones.js';
import { transicionesPermitidas, esCliente, ESTADO_LABEL } from '../lib/flujo.js';
import { parseFechaPublicacion } from '../lib/fecha.js';
import { redNombre } from '../lib/redes.js';
import { hashtagsACadena } from '../lib/textos.js';
import { fechaDuplicado, payloadDuplicado, DIAS_DUPLICADO } from '../lib/duplicar.js';
import RedIcon from './RedIcon.jsx';

/** Clases Tailwind por tono de botón (los define TRANSICIONES en flujo.js). */
const TONO_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
  pink: 'bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-200',
  emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
  teal: 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200',
};

export default function EditPostModal({ clientes = [], currentUser = null }) {
  const [post, setPost] = useState(null);
  const [quickSaving, setQuickSaving] = useState(false);

  // Duplicar: panel con fecha y POST como borrador.
  const [duplicando, setDuplicando] = useState(false);
  const [dupFecha, setDupFecha] = useState('');
  const [dupSaving, setDupSaving] = useState(false);
  const [dupError, setDupError] = useState('');

  // Rechazo: el cliente debe explicar por qué pide cambios.
  const [motivoPanel, setMotivoPanel] = useState(false);
  const [motivoTo, setMotivoTo] = useState('en_diseno');
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState('');

  // Historial de actividad de la publicación abierta.
  const [historial, setHistorial] = useState([]);

  const cliente = esCliente(currentUser);

  useEffect(() => {
    function onEdit(ev) {
      const p = ev.detail ?? null;
      setPost(p);
      setDuplicando(false);
      setMotivoPanel(false);
      setMotivoError('');
      // Mantener selectedPostId sincronizado para que CommentThread sepa qué
      // publicación está abierta.
      selectedPostIdStore.set(p?.id ?? null);
    }
    window.addEventListener('studio-mb:edit-post', onEdit);
    return () => window.removeEventListener('studio-mb:edit-post', onEdit);
  }, []);

  // Cargar historial al abrir una publicación.
  useEffect(() => {
    if (!post?.id) {
      setHistorial([]);
      return undefined;
    }
    let cancelado = false;
    cargarHistorial(post.id).then((lista) => {
      if (!cancelado) setHistorial(lista);
    });
    return () => { cancelado = true; };
  }, [post?.id]);

  async function cargarHistorial(publicacionId) {
    try {
      const res = await fetch(`/api/actividad?publicacion_id=${encodeURIComponent(publicacionId)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function close() {
    setPost(null);
    setDuplicando(false);
    setDupError('');
    // No limpiamos selectedPostId: al cerrar, queremos que CommentThread siga
    // mostrando el último post abierto (útil para mantener contexto).
  }

  /** Abre el panel de duplicado con la fecha propuesta (+7 días). */
  function abrirDuplicar() {
    const f = fechaDuplicado(post, DIAS_DUPLICADO);
    // datetime-local usa "YYYY-MM-DDTHH:mm"
    setDupFecha((f ?? '').slice(0, 16));
    setDupError('');
    setDuplicando(true);
  }

  /** Crea el duplicado como borrador (copy, hashtags y slides). */
  async function crearDuplicado() {
    if (!post?.id || dupSaving) return;
    const payload = payloadDuplicado(post, dupFecha);
    if (!payload) return;
    if (!payload.fecha_publicacion) {
      setDupError('Indica una fecha válida.');
      return;
    }

    setDupSaving(true);
    setDupError('');
    try {
      const res = await fetch('/api/publicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const saved = await res.json();
      addPublicacion(saved);
      setDuplicando(false);
      close();
    } catch (err) {
      setDupError(err.message ?? 'No se pudo duplicar.');
    } finally {
      setDupSaving(false);
    }
  }

  async function quickChangeEstado(nuevoEstado, motivoTexto = null) {
    if (!post?.id || post.estado === nuevoEstado) return;
    setQuickSaving(true);
    const prev = post.estado;
    setPost((p) => (p ? { ...p, estado: nuevoEstado } : p));
    updatePublicacion({ id: post.id, estado: nuevoEstado, _pending: true });
    try {
      const body = { estado: nuevoEstado };
      if (motivoTexto !== null) body.motivo_rechazo = motivoTexto;
      const res = await fetch(`/api/publicaciones/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const saved = await res.json().catch(() => null);
      if (saved && saved.id) {
        updatePublicacion({ ...saved, _pending: false });
        setPost(saved);
      } else {
        updatePublicacion({ id: post.id, estado: nuevoEstado, _pending: false });
      }
      setMotivoPanel(false);
      setMotivo('');
      setMotivoError('');
      cargarHistorial(post.id).then(setHistorial);
    } catch (err) {
      setPost((p) => (p ? { ...p, estado: prev } : p));
      updatePublicacion({ id: post.id, estado: prev, _pending: false });
      if (motivoTexto !== null) {
        setMotivoError(err.message ?? 'Error pidiendo cambios.');
      } else {
        alert(err.message ?? 'Error cambiando estado.');
      }
    } finally {
      setQuickSaving(false);
    }
  }

  /** Click en una acción del flujo: intercepta los rechazos del cliente. */
  function onAccion(accion) {
    const esRechazo = (post?.estado === 'revision_diseno' && accion.to === 'en_diseno')
      || (post?.estado === 'revision' && accion.to === 'borrador');
    if (cliente && esRechazo) {
      setMotivoTo(accion.to);
      setMotivo('');
      setMotivoError('');
      setMotivoPanel(true);
      setDuplicando(false);
      return;
    }
    quickChangeEstado(accion.to);
  }

  async function handleDelete() {
    if (!post?.id) return;
    if (!confirm(`¿Eliminar la publicación "${post.tipo_contenido || post.formato || ''}"? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`/api/publicaciones/${post.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => '');
        throw new Error(`Eliminar falló (${res.status}): ${text || res.statusText}`);
      }
      removePublicacion(post.id);
      close();
    } catch (err) {
      alert(err.message ?? 'Error eliminando.');
    }
  }

  if (!post) return null;

  const acciones = transicionesPermitidas(post.estado, currentUser);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky con título, acciones de flujo y eliminar */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-ink-100 bg-white gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink-900">
                {cliente ? 'Revisión de publicación' : 'Detalle y revisión de publicación'}
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">
                {cliente
                  ? 'Revisa el contenido y deja tus comentarios en el hilo.'
                  : 'Revisa el contenido, aprueba fases o deja comentarios en el hilo.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botones de flujo permitidos para el rol (fuente: lib/flujo.js) */}
            {acciones.map((accion) => (
              <button
                key={accion.to}
                type="button"
                disabled={quickSaving}
                onClick={() => onAccion(accion)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${TONO_CLASSES[accion.tono] ?? 'bg-ink-50 text-ink-700 hover:bg-ink-100 border-ink-200'}`}
              >
                {accion.label}
              </button>
            ))}

            {!cliente && (
              <button
                type="button"
                onClick={abrirDuplicar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-ink-100 transition"
                title="Duplicar esta publicación en otra fecha"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Duplicar
              </button>
            )}

            {!cliente && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition"
                title="Eliminar publicación"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
              title="Cerrar"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </header>

        {/* Panel de duplicado: fecha + confirmación */}
        {duplicando && (
          <div className="px-5 py-4 bg-brand-50/60 border-b border-brand-100 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="dup-fecha" className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Fecha del duplicado
              </label>
              <input
                id="dup-fecha"
                type="datetime-local"
                value={dupFecha}
                onChange={(e) => setDupFecha(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <p className="text-xs text-ink-600 flex-1 min-w-[220px] leading-relaxed">
              Se creará un <b>borrador</b> con el mismo copy, hashtags y slides.
              El diseño final no se copia.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={crearDuplicado}
                disabled={dupSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-50"
              >
                {dupSaving ? 'Creando…' : 'Crear borrador'}
              </button>
              <button
                type="button"
                onClick={() => setDuplicando(false)}
                disabled={dupSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-white transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
            {dupError && (
              <p className="w-full text-xs text-red-600">{dupError}</p>
            )}
          </div>
        )}

        {/* Panel de rechazo: el cliente explica qué hay que cambiar */}
        {motivoPanel && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
            <label htmlFor="motivo-rechazo" className="block text-[11px] font-semibold uppercase tracking-wider text-amber-800 mb-1">
              ¿Qué hay que cambiar?
            </label>
            <textarea
              id="motivo-rechazo"
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: el logo está muy pequeño y el texto del slide 2 no se lee bien."
              className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[11px] text-amber-700">
                {motivo.trim().length}/500 · se avisará al equipo con este motivo
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMotivoPanel(false); setMotivoError(''); }}
                  disabled={quickSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-white transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => quickChangeEstado(motivoTo, motivo.trim())}
                  disabled={quickSaving || motivo.trim().length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50"
                >
                  {quickSaving ? 'Enviando…' : 'Pedir cambios'}
                </button>
              </div>
            </div>
            {motivoError && <p className="mt-1 text-xs text-red-600">{motivoError}</p>}
          </div>
        )}

        {/* Motivo vigente del último rechazo */}
        {post.motivo_rechazo && (
          <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-100 text-sm text-amber-900">
            <span className="font-semibold">Cambios pedidos:</span> {post.motivo_rechazo}
          </div>
        )}

        {/* Contenido en 2 columnas: detalle/formulario a la izquierda, comentarios a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-ink-100">
          <div className="lg:col-span-3">
            {cliente ? (
              <PostReadOnly post={post} clientes={clientes} />
            ) : (
              <PostForm
                key={`${post.id}-${post.estado}`}
                clientes={clientes}
                initial={post}
                onCancel={close}
                onSubmitted={close}
              />
            )}
          </div>
          <div className="lg:col-span-2 p-4 bg-ink-50/30">
            <Historial items={historial} />
            <CommentThread
              currentUser={currentUser}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Resuelve la URL de una imagen de slide (URL directa o uuid legacy de Directus). */
function slideImg(imagen) {
  const s = String(imagen ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `/api/assets/${s}`;
}

/** Resuelve el id de la foto final (diseno_final) o null. */
function disenoIdOf(post) {
  const id = typeof post.diseno_final === 'object'
    ? post.diseno_final?.id
    : post.diseno_final;
  return id || null;
}

/**
 * Vista de solo lectura para el rol Cliente: todo el contenido del post sin
 * posibilidad de editarlo.
 */
function PostReadOnly({ post, clientes = [] }) {
  const clienteNombre = clientes.find((c) => c.id === post.cliente_id)?.nombre ?? '—';
  const fecha = parseFechaPublicacion(post.fecha_publicacion);
  const fechaLabel = fecha && !Number.isNaN(fecha.getTime())
    ? format(fecha, "d MMM yyyy '·' HH:mm", { locale: es })
    : 'Sin fecha';

  const slides = Array.isArray(post.imagenes_fondo) ? post.imagenes_fondo : [];
  const disenoId = disenoIdOf(post);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          {ESTADO_LABEL[post.estado] ?? post.estado}
        </span>
        {post.formato && (
          <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 text-xs">
            {post.formato}
          </span>
        )}
        {post.red && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink-50 border border-ink-100 text-ink-700 text-xs">
            <RedIcon red={post.red} className="w-3 h-3" conTitulo={false} />
            {redNombre(post.red)}
          </span>
        )}
        {post.tipo_contenido && (
          <span className="text-xs text-ink-500">{post.tipo_contenido}</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-ink-700">
        <svg className="w-4 h-4 text-ink-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span className="font-medium">{clienteNombre}</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
        <svg className="w-5 h-5 text-brand-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">Fecha de publicación</p>
          <p className="text-lg font-extrabold text-ink-900 tabular-nums">{fechaLabel}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            Descripción del post (copy)
          </p>
          <CopyButton text={post.copywriting ?? ''} label="Copiar" />
        </div>
        <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">
          {post.copywriting || '—'}
        </p>
      </div>

      {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Hashtags</p>
            <CopyButton text={hashtagsACadena(post.hashtags)} label="Copiar" />
          </div>
          <p className="text-sm text-brand-600 leading-relaxed">
            {post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </p>
        </div>
      )}

      {slides.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
            Textos de los slides
          </p>
          <p className="text-[11px] text-ink-400 mb-2">El texto de cada slide aparece dentro de la imagen.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {slides.map((s, idx) => {
              const esObjeto = s && typeof s === 'object';
              const texto = esObjeto ? (s.texto ?? '') : '';
              const img = esObjeto ? slideImg(s.imagen) : slideImg(s);
              return (
                <div key={idx} className="rounded-lg border border-ink-100 overflow-hidden bg-white">
                  {img ? (
                    <img
                      src={img}
                      alt={`Slide ${idx + 1}`}
                      className="w-full aspect-[3/4] object-cover bg-ink-100"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-ink-50 flex items-center justify-center text-[11px] text-ink-400">
                      Sin foto
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Slide {idx + 1}</p>
                    {texto && <p className="text-xs text-ink-700 whitespace-pre-line mt-0.5">{texto}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {disenoId && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Diseño final</p>
          <a
            href={`/api/assets/${disenoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={`/api/assets/${disenoId}`}
              alt="Diseño final"
              className="w-32 aspect-[3/4] object-cover rounded-lg border border-ink-200 bg-ink-100"
            />
          </a>
        </div>
      )}

      <p className="text-xs text-ink-400 pt-1">
        ¿Quieres cambios? Deja un comentario en el hilo de la derecha.
      </p>
    </div>
  );
}

const TIPO_LABEL = {
  creado: 'Creada',
  duplicado: 'Duplicada',
  edicion: 'Edición',
  estado: 'Cambio de estado',
  sistema: 'Sistema',
};

function nombreDe(usuario) {
  if (!usuario) return 'Sistema';
  const nombre = [usuario.first_name, usuario.last_name].filter(Boolean).join(' ').trim();
  return nombre || usuario.email || 'Sistema';
}

function fechaEvento(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, "d MMM · HH:mm", { locale: es });
}

/**
 * Historial de la publicación: altas, cambios de estado y ediciones.
 * Se muestra encima del hilo de comentarios (3 eventos, ampliable).
 */
function Historial({ items = [] }) {
  const [todo, setTodo] = useState(false);
  if (!Array.isArray(items) || items.length === 0) return null;

  const visibles = todo ? items : items.slice(0, 3);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          Historial
        </h4>
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => setTodo((v) => !v)}
            className="text-[11px] font-medium text-brand-600 hover:underline"
          >
            {todo ? 'Ver menos' : `Ver todo (${items.length})`}
          </button>
        )}
      </div>
      <ul className="space-y-2.5">
        {visibles.map((h) => (
          <li key={h.id} className="text-xs leading-relaxed">
            <span className="text-ink-400">{fechaEvento(h.fecha_creacion)}</span>
            <span className="text-ink-300"> · </span>
            <span className="font-medium text-ink-700">{nombreDe(h.usuario)}</span>
            <span className="block text-ink-500">
              {h.detalle ?? TIPO_LABEL[h.tipo] ?? 'Evento'}
            </span>
            {h.motivo && (
              <span className="mt-1 block rounded border border-amber-100 bg-amber-50 px-2 py-1 text-amber-800">
                “{h.motivo}”
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
