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
import { removePublicacion } from '../stores/publicaciones.js';

export default function EditPostModal({ clientes = [], apiBase = '' }) {
  const [post, setPost] = useState(null);

  useEffect(() => {
    function onEdit(ev) {
      setPost(ev.detail ?? null);
    }
    window.addEventListener('studio-mb:edit-post', onEdit);
    return () => window.removeEventListener('studio-mb:edit-post', onEdit);
  }, []);

  function close() {
    setPost(null);
  }

  async function handleDelete() {
    if (!post?.id) return;
    if (!confirm(`¿Eliminar la publicación "${post.tipo_contenido || post.formato || ''}"? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`${apiBase}/api/publicaciones/${post.id}`, {
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
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky con título y acciones */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-ink-100 bg-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink-900">Editar publicación</h3>
              <p className="text-xs text-ink-500 mt-0.5">Modifica los campos y guarda los cambios.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
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

        {/* Form con la publicación precargada */}
        <PostForm
          clientes={clientes}
          initial={post}
          apiBase={apiBase}
          onCancel={close}
          onSubmitted={close}
        />
      </div>
    </div>
  );
}
