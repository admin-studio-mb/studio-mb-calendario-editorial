import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const ESTADO_LABEL = {
  borrador: 'Borrador',
  revision: 'Revisión',
  aprobado: 'Aprobado',
};
const FORMATO_LABEL = {
  post: 'Post',
  reel: 'Reel',
  carrusel: 'Carrusel',
  story: 'Story',
};

function titleCase(s) {
  if (!s) return '';
  return ESTADO_LABEL[s] || FORMATO_LABEL[s] || s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function estadoColor(estado) {
  switch (estado) {
    case 'borrador':   return 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-100';
    case 'revision':   return 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-100';
    case 'aprobado':   return 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-100';
    default:           return 'bg-ink-100 text-ink-700 hover:bg-ink-200 border border-ink-200';
  }
}

function estadoBadge(estado) {
  switch (estado) {
    case 'borrador':   return 'bg-amber-100 text-amber-800';
    case 'revision':   return 'bg-blue-100 text-blue-800';
    case 'aprobado':   return 'bg-emerald-100 text-emerald-800';
    default:           return 'bg-ink-100 text-ink-700';
  }
}

/**
 * PostPill — pill compartida por Mes / Semana / Lista.
 *
 * Props:
 *   - post: publicación
 *   - onClick: () => void
 *   - onDragStart: (e) => void
 *   - onDragEnd: () => void
 *   - isDragging: boolean
 *   - isSelected: boolean
 *   - clienteNombre: string (para el tooltip)
 *   - size: 'sm' | 'md' (md = un poco más grande, default)
 */
export default function PostPill({
  post,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging = false,
  isSelected = false,
  clienteNombre = '',
  size = 'md',
}) {
  const [tooltipRect, setTooltipRect] = useState(null);
  const buttonRef = useRef(null);

  // Cierra tooltip al hacer scroll o resize.
  useEffect(() => {
    if (!tooltipRect) return;
    function close() { setTooltipRect(null); }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tooltipRect]);

  const sizeClass = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-[11px] px-1.5 py-1';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        draggable={!post._pending}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        onMouseEnter={() => {
          if (buttonRef.current) {
            setTooltipRect(buttonRef.current.getBoundingClientRect());
          }
        }}
        onMouseLeave={() => setTooltipRect(null)}
        className={[
          'w-full text-left leading-tight rounded-md truncate font-medium transition',
          sizeClass,
          'cursor-grab active:cursor-grabbing',
          post._pending
            ? 'bg-ink-200 text-ink-500 animate-pulse'
            : estadoColor(post.estado),
          isSelected ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : '',
          isDragging ? 'opacity-40' : '',
        ].join(' ')}
        title={post._pending ? 'Guardando…' : `${post.tipo_contenido ?? ''} · ${post.formato ?? ''}`}
      >
        {post.tipo_contenido ?? post.formato ?? 'Publicación'}
      </button>

      {tooltipRect && createPortal(
        <PostTooltip post={post} anchorRect={tooltipRect} clienteNombre={clienteNombre} />,
        document.body
      )}
    </>
  );
}

function PostTooltip({ post, anchorRect, clienteNombre }) {
  const tooltipW = 280;
  const margin = 8;
  const top = anchorRect.top - margin;
  const placeBelow = top < 180;
  const y = placeBelow ? anchorRect.bottom + margin : anchorRect.top - margin;
  let x = anchorRect.left + anchorRect.width / 2 - tooltipW / 2;
  x = Math.max(8, Math.min(window.innerWidth - tooltipW - 8, x));

  const fecha = post.fecha_publicacion
    ? format(parseISO(post.fecha_publicacion), "d 'de' MMMM, HH:mm", { locale: es })
    : 'Sin fecha';

  const snippet = post.copywriting
    ? (post.copywriting.length > 110 ? post.copywriting.slice(0, 107) + '…' : post.copywriting)
    : null;

  return (
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
        <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${estadoBadge(post.estado)}`}>
          {titleCase(post.estado)}
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
      {post.hashtags?.length > 0 && (
        <p className="mt-2 text-[11px] text-brand-600 leading-relaxed">
          {post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
        </p>
      )}
    </div>
  );
}
