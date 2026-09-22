import { useMemo, useState } from 'react';
import {
  format, parseISO, isSameDay, addDays, subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import PostPill from './PostPill.jsx';

/**
 * DayView — un único día con los posts como cards completas.
 *
 * Cada card muestra: tipo, formato badge, cliente, hora, copywriting,
 * hashtags, estado.
 *
 * Props:
 *   - publicaciones, clientes, selectedPostId, setSelectedPostId, onPatchFecha
 *   - cursor: Date — el día a mostrar
 *   - setCursor: (Date) => void — para mover al día anterior / siguiente
 */
export default function DayView({
  publicaciones = [],
  clientes = [],
  selectedPostId = null,
  setSelectedPostId = () => {},
  onPatchFecha = () => {},
  cursor = new Date(),
  setCursor = () => {},
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(false);

  const posts = useMemo(
    () => publicaciones
      .filter((p) => p.fecha_publicacion && isSameDay(parseISO(p.fecha_publicacion), cursor))
      .sort((a, b) => parseISO(a.fecha_publicacion) - parseISO(b.fecha_publicacion)),
    [publicaciones, cursor],
  );

  const clienteNombre = useMemo(() => {
    const map = new Map();
    for (const c of clientes) map.set(c.id, c.nombre);
    return map;
  }, [clientes]);

  function onDragStart(e, post) {
    setDraggingId(post.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', post.id);
  }
  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(false);
  }
  function onContainerDragOver(e) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dropTarget) setDropTarget(true);
  }
  function onContainerDragLeave(e) {
    if (e.target === e.currentTarget) setDropTarget(false);
  }
  async function onContainerDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const post = publicaciones.find((p) => p.id === id);
    if (!post) return;
    const oldFecha = parseISO(post.fecha_publicacion);
    const nuevaFecha = new Date(cursor);
    nuevaFecha.setHours(oldFecha.getHours(), oldFecha.getMinutes(), 0, 0);
    const iso = nuevaFecha.toISOString();
    if (post.fecha_publicacion === iso) {
      setDraggingId(null);
      setDropTarget(false);
      return;
    }
    onPatchFecha(post.id, () => iso, post.fecha_publicacion, () => iso);
    setDraggingId(null);
    setDropTarget(false);
  }

  const isToday = isSameDay(cursor, new Date());

  return (
    <section
      className="card overflow-hidden select-none"
      onDragOver={onContainerDragOver}
      onDragLeave={onContainerDragLeave}
      onDrop={onContainerDrop}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-lg font-bold text-ink-900 capitalize truncate">
            {format(cursor, "EEEE d 'de' MMMM", { locale: es })}
          </h2>
          <span className={`shrink-0 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${isToday ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500'}`}>
            {format(cursor, 'yyyy')}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 rounded-md transition"
          >
            Hoy
          </button>
          <div className="flex items-center bg-ink-50 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setCursor((c) => subDays(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Día anterior"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => addDays(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Día siguiente"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className={[
        'p-4 md:p-5 min-h-[200px] transition',
        dropTarget ? 'bg-emerald-50/40' : '',
      ].join(' ')}>
        {posts.length === 0 ? (
          <div className="text-center text-sm text-ink-400 py-12">
            No hay publicaciones este día.
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => {
              const hora = p.fecha_publicacion ? format(parseISO(p.fecha_publicacion), 'HH:mm') : '';
              const isSelected = p.id === selectedPostId;
              const isDragging = draggingId === p.id;
              return (
                <article
                  key={p.id}
                  draggable={!p._pending}
                  onDragStart={(e) => onDragStart(e, p)}
                  onDragEnd={onDragEnd}
                  onClick={() => {
                    setSelectedPostId(p.id);
                    window.dispatchEvent(new CustomEvent('studio-mb:edit-post', { detail: p }));
                  }}
                  className={[
                    'group rounded-xl border bg-white dark:bg-ink-100 cursor-grab active:cursor-grabbing transition p-4',
                    p._pending
                      ? 'opacity-70'
                      : 'border-ink-100 hover:border-brand-200 hover:shadow-card',
                    isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : '',
                    isDragging ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <header className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={[
                      'shrink-0 w-2.5 h-2.5 rounded-full',
                      p.estado === 'borrador' ? 'bg-amber-400' :
                      p.estado === 'revision' ? 'bg-blue-400' :
                      p.estado === 'aprobado' ? 'bg-emerald-500' :
                      'bg-ink-300',
                    ].join(' ')} />
                    <h3 className="text-sm font-semibold text-ink-900 truncate flex-1 min-w-0">
                      {p.tipo_contenido ?? 'Publicación'}
                    </h3>
                    {p.formato && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider font-medium text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded">
                        {titleCaseFmt(p.formato)}
                      </span>
                    )}
                    {hora && (
                      <span className="shrink-0 text-xs font-medium text-ink-600 tabular-nums">
                        {hora}
                      </span>
                    )}
                  </header>

                  {p.copywriting && (
                    <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line line-clamp-3 mb-2">
                      {p.copywriting}
                    </p>
                  )}

                  <footer className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <span className="text-ink-500 truncate">
                      {clienteNombre.get(p.cliente_id) ?? 'Sin cliente'}
                    </span>
                    <span className={[
                      'shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
                      p.estado === 'borrador' ? 'bg-amber-100 text-amber-800' :
                      p.estado === 'revision' ? 'bg-blue-100 text-blue-800' :
                      p.estado === 'aprobado' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-ink-100 text-ink-700',
                    ].join(' ')}>
                      {titleCaseEstado(p.estado)}
                    </span>
                  </footer>

                  {p.hashtags?.length > 0 && (
                    <p className="mt-2 text-[11px] text-brand-600 leading-relaxed truncate">
                      {p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function titleCaseFmt(s) {
  const m = { post: 'Post', reel: 'Reel', carrusel: 'Carrusel', story: 'Story' };
  return m[s] ?? s;
}
function titleCaseEstado(s) {
  const m = { borrador: 'Borrador', revision: 'Revisión', aprobado: 'Aprobado' };
  return m[s] ?? s;
}
