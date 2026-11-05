// ============================================================================
//  src/components/EditPostModal.jsx
// ----------------------------------------------------------------------------
//  Modal de edición de una publicación. Se abre cuando Calendar emite el
//  evento `studio-mb:edit-post` con `detail: post`. Reusa el `PostForm`
//  con `initial=post` y `onSubmitted` para cerrarse al guardar.
//
//  También soporta eliminación (DELETE /api/publicaciones/:id).
// ============================================================================

import { useState, useEffect } from 'react';
import PostForm from './PostForm.jsx';
import CommentThread from './CommentThread.jsx';
import { removePublicacion, updatePublicacion, selectedPostIdStore } from '../stores/publicaciones.js';

export default function EditPostModal({ clientes = [], currentUser = null, apiBase = '' }) {
  const [post, setPost] = useState(null);
  const [quickSaving, setQuickSaving] = useState(false);

  useEffect(() => {
    function onEdit(ev) {
      const p = ev.detail ?? null;
      setPost(p);
      // Mantener selectedPostId sincronizado para que CommentThread sepa qué
      // publicación está abierta.
      selectedPostIdStore.set(p?.id ?? null);
    }
    window.addEventListener('studio-mb:edit-post', onEdit);
    return () => window.removeEventListener('studio-mb:edit-post', onEdit);
  }, []);

  function close() {
    setPost(null);
    // No limpiamos selectedPostId: al cerrar, queremos que CommentThread siga
    // mostrando el último post abierto (útil para mantener contexto).
  }

  async function quickChangeEstado(nuevoEstado) {
    if (!post?.id || post.estado === nuevoEstado) return;
    setQuickSaving(true);
    const prev = post.estado;
    setPost((p) => (p ? { ...p, estado: nuevoEstado } : p));
    updatePublicacion({ id: post.id, estado: nuevoEstado, _pending: true });
    try {
      const res = await fetch(`/api/publicaciones/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error(`Error (${res.status})`);
      const saved = await res.json().catch(() => null);
      if (saved && saved.id) {
        updatePublicacion({ ...saved, _pending: false });
        setPost(saved);
      } else {
        updatePublicacion({ id: post.id, estado: nuevoEstado, _pending: false });
      }
    } catch (err) {
      setPost((p) => (p ? { ...p, estado: prev } : p));
      updatePublicacion({ id: post.id, estado: prev, _pending: false });
      alert(err.message ?? 'Error cambiando estado.');
    } finally {
      setQuickSaving(false);
    }
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky con título, acciones rápidas de flujo y eliminar */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-ink-100 bg-white gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink-900">Detalle y revisión de publicación</h3>
              <p className="text-xs text-ink-500 mt-0.5">Revisa el contenido, aprueba fases o deja comentarios en el hilo.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botones rápidos del flujo editorial */}
            {post.estado === 'borrador' && (
              <button
                type="button"
                disabled={quickSaving}
                onClick={() => quickChangeEstado('revision')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition disabled:opacity-50"
              >
                Enviar a revisión de texto →
              </button>
            )}
            {post.estado === 'revision' && (
              <button
                type="button"
                disabled={quickSaving}
                onClick={() => quickChangeEstado('en_diseno')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition disabled:opacity-50"
              >
                ✓ Confirmar texto → Pasar a diseño
              </button>
            )}
            {post.estado === 'en_diseno' && (
              <button
                type="button"
                disabled={quickSaving}
                onClick={() => quickChangeEstado('revision_diseno')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200 transition disabled:opacity-50"
              >
                Enviar diseño a revisión →
              </button>
            )}
            {(post.estado === 'revision_diseno' || post.estado === 'revision' || post.estado === 'en_diseno') && (
              <button
                type="button"
                disabled={quickSaving}
                onClick={() => quickChangeEstado('aprobado')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
              >
                ✓ Aprobar publicación final
              </button>
            )}
            {post.estado === 'aprobado' && (
              <button
                type="button"
                disabled={quickSaving}
                onClick={() => quickChangeEstado('publicado')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition disabled:opacity-50"
              >
                ✓ Marcar como publicado
              </button>
            )}

            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition"
              title="Eliminar publicación"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
              Eliminar
            </button>
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

        {/* Contenido en 2 columnas: Formulario a la izquierda, Comentarios a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-ink-100">
          <div className="lg:col-span-3">
            <PostForm
              key={`${post.id}-${post.estado}`}
              clientes={clientes}
              initial={post}
              apiBase={apiBase}
              onCancel={close}
              onSubmitted={close}
            />
          </div>
          <div className="lg:col-span-2 p-4 bg-ink-50/30">
            <CommentThread
              currentUser={currentUser}
              apiBase={apiBase}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
