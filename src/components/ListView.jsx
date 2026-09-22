import { useMemo, useState } from 'react';
import {
  format, parseISO, isSameMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import PostPill from './PostPill.jsx';

/**
 * ListView — posts del mes del cursor, agrupados por día.
 *
 * Props:
 *   - publicaciones, clientes, selectedPostId, setSelectedPostId, onPatchFecha
 *   - cursor: Date — el mes a mostrar
 *   - setCursor: (Date) => void — para navegar entre meses
 */
export default function ListView({
  publicaciones = [],
  clientes = [],
  selectedPostId = null,
  setSelectedPostId = () => {},
  onPatchFecha = () => {},
  cursor = new Date(),
  setCursor = () => {},
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Filtramos por el mes del cursor.
  const sorted = useMemo(
    () => [...publicaciones]
      .filter((p) => p.fecha_publicacion && isSameMonth(parseISO(p.fecha_publicacion), cursor))
      .sort((a, b) => new Date(a.fecha_publicacion) - new Date(b.fecha_publicacion)),
    [publicaciones, cursor]
  );

  // Agrupamos por día.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of sorted) {
      const key = format(parseISO(p.fecha_publicacion), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries());
  }, [sorted]);

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
    setDropTarget(null);
  }
  function onDayDragOver(e, dayKey) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== dayKey) setDropTarget(dayKey);
  }
  function onDayDragLeave(dayKey) {
    if (dropTarget === dayKey) setDropTarget(null);
  }
  async function onDayDrop(e, isoDay) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const post = publicaciones.find((p) => p.id === id);
    if (!post) return;
    const oldFecha = parseISO(post.fecha_publicacion);
    const [hh, mm] = [oldFecha.getHours(), oldFecha.getMinutes()];
    const nuevaFecha = new Date(isoDay);
    nuevaFecha.setHours(hh, mm, 0, 0);
    const iso = nuevaFecha.toISOString();
    if (post.fecha_publicacion === iso) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    onPatchFecha(post.id, prevFecha => iso, prevFecha, () => iso);
    setDraggingId(null);
    setDropTarget(null);
  }

  const total = sorted.length;

  return (
    <section className="card overflow-hidden select-none">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-ink-900 capitalize">
            {format(cursor, 'LLLL', { locale: es })}
          </h2>
          <span className="text-sm text-ink-400">{format(cursor, 'yyyy')}</span>
          <span className="text-xs text-ink-400 ml-2">
            {total} {total === 1 ? 'publicación' : 'publicaciones'}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Mes anterior"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Mes siguiente"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      {total === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-ink-400">
          No hay publicaciones en el rango actual.
        </div>
      ) : (
        <div className="divide-y divide-ink-100">
          {grouped.map(([dayKey, posts]) => {
            const dayDate = parseISO(dayKey + 'T12:00:00');
            const isDropTarget = dropTarget === dayKey && draggingId;
            const isToday = format(dayDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            return (
              <div
                key={dayKey}
                onDragOver={(e) => onDayDragOver(e, dayKey)}
                onDragLeave={() => onDayDragLeave(dayKey)}
                onDrop={(e) => onDayDrop(e, dayDate.toISOString())}
                className={[
                  'px-5 py-3 transition',
                  isDropTarget ? 'bg-emerald-50/50' : 'hover:bg-ink-50/40',
                ].join(' ')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={[
                    'w-12 text-center shrink-0 rounded-lg py-1',
                    isToday ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700',
                  ].join(' ')}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                      {format(dayDate, 'EEE', { locale: es })}
                    </div>
                    <div className="text-lg font-bold tabular-nums leading-tight">
                      {format(dayDate, 'd')}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-900 capitalize">
                      {format(dayDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                    <p className="text-xs text-ink-500">
                      {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 pl-[60px]">
                  {posts.map((p) => (
                    <ListItem
                      key={p.id}
                      post={p}
                      clienteNombre={clienteNombre.get(p.cliente_id) ?? ''}
                      isSelected={p.id === selectedPostId}
                      isDragging={draggingId === p.id}
                      onClick={() => {
                        setSelectedPostId(p.id);
                        window.dispatchEvent(new CustomEvent('studio-mb:edit-post', { detail: p }));
                      }}
                      onDragStart={(e) => onDragStart(e, p)}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ListItem({ post, clienteNombre, isSelected, isDragging, onClick, onDragStart, onDragEnd }) {
  const [tooltipRect, setTooltipRect] = useState(null);
  const ref = useRef(null);
  // Lazy import trick: use the shared PostPill for tooltip.
  return (
    <div
      ref={ref}
      draggable={!post._pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseEnter={() => ref.current && setTooltipRect(ref.current.getBoundingClientRect())}
      onMouseLeave={() => setTooltipRect(null)}
      className={[
        'flex items-center gap-3 p-2.5 rounded-lg border bg-white cursor-grab active:cursor-grabbing transition',
        post._pending ? 'opacity-70' : 'border-ink-100 hover:border-brand-200 hover:shadow-sm',
        isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : '',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      {/* Estado badge */}
      <span className={[
        'shrink-0 w-2 h-8 rounded-full',
        post.estado === 'borrador' ? 'bg-amber-400' :
        post.estado === 'revision' ? 'bg-blue-400' :
        post.estado === 'aprobado' ? 'bg-emerald-500' :
        'bg-ink-300',
      ].join(' ')} />

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-ink-900 truncate">
            {post.tipo_contenido ?? 'Publicación'}
          </p>
          {post.formato && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-medium text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded">
              {titleCaseFmt(post.formato)}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-500 truncate">
          {clienteNombre && <span>{clienteNombre}</span>}
          {clienteNombre && post.fecha_publicacion && <span> · </span>}
          {post.fecha_publicacion && (
            <span>{format(parseISO(post.fecha_publicacion), 'HH:mm')}</span>
          )}
        </p>
      </div>

      {/* Estado texto */}
      <span className="shrink-0 text-[11px] uppercase tracking-wider font-semibold text-ink-500">
        {titleCaseEstado(post.estado)}
      </span>

      {/* Tooltip via portal usando un wrapper invisible */}
      {tooltipRect && <FloatingTooltip post={post} clienteNombre={clienteNombre} anchorRect={tooltipRect} />}
    </div>
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

// Mini-tooltip reutilizando la lógica del PostPill pero standalone.
// Para evitar duplicar todo el código, lo importamos dinámicamente.
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

function FloatingTooltip({ post, clienteNombre, anchorRect }) {
  const tooltipW = 280;
  const margin = 8;
  const top = anchorRect.top - margin;
  const placeBelow = top < 180;
  const y = placeBelow ? anchorRect.bottom + margin : anchorRect.top - margin;
  let x = anchorRect.left + anchorRect.width / 2 - tooltipW / 2;
  x = Math.max(8, Math.min(window.innerWidth - tooltipW - 8, x));

  useEffect(() => {
    function close() { /* no-op, parent handles via mouseLeave */ }
    return () => {};
  }, []);

  const fecha = post.fecha_publicacion
    ? format(parseISO(post.fecha_publicacion), "d 'de' MMMM, HH:mm", { locale: es })
    : 'Sin fecha';

  const snippet = post.copywriting
    ? (post.copywriting.length > 110 ? post.copywriting.slice(0, 107) + '…' : post.copywriting)
    : null;

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        width: tooltipW,
        transform: placeBelow ? 'translateY(0)' : 'translateY(-100%)',
        zIndex: 60,
      }}
      className="rounded-xl bg-white border border-ink-200 shadow-pop p-3 pointer-events-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-ink-900 leading-tight">
          {post.tipo_contenido ?? 'Publicación'}
        </p>
        <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-ink-100 text-ink-700">
          {titleCaseEstado(post.estado)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-ink-500 flex-wrap">
        {clienteNombre && (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {clienteNombre}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          {fecha}
        </span>
      </div>
      {snippet && (
        <p className="mt-2 text-xs text-ink-700 leading-relaxed whitespace-pre-line" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {snippet}
        </p>
      )}
    </div>,
    document.body
  );
}
