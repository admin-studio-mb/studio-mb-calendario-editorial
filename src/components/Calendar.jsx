import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameDay, isSameMonth,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { publicacionesStore, hydratePublicaciones, updatePublicacion } from '../stores/publicaciones.js';

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

/**
 * Calendar — vista mensual de publicaciones.
 *
 * - Lee del store global reactivo (optimistic update).
 * - Hover sobre una pill muestra tooltip con detalle.
 * - Drag & drop de pills a otra celda cambia la fecha_publicacion.
 *
 * Props:
 *   - initialPublicaciones: array inicial hidratado por el SSR.
 *   - clientes: array de clientes para el filtro y el tooltip.
 *   - onSelectPost: (post) => void
 *   - onCreatePost: (date: Date) => void
 */
export default function Calendar({ initialPublicaciones = [], clientes = [], onSelectPost, onCreatePost, apiBase = '' }) {
  useEffect(() => {
    if (initialPublicaciones.length && publicacionesStore.get().length === 0) {
      hydratePublicaciones(initialPublicaciones);
    }
  }, [initialPublicaciones]);

  const publicaciones = useStore(publicacionesStore);
  const [cursor, setCursor] = useState(new Date());
  const [clienteFiltro, setClienteFiltro] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // Estado del tooltip (null = oculto).
  const [tooltip, setTooltip] = useState(null); // { post, x, y, anchorRect }
  // Estado del drag & drop.
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'yyyy-MM-dd' | null

  // Cerramos el tooltip al hacer scroll o resize.
  useEffect(() => {
    if (!tooltip) return;
    function close() { setTooltip(null); }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tooltip]);

  const publicacionesFiltradas = useMemo(
    () => (clienteFiltro
      ? publicaciones.filter((p) => p.cliente_id === clienteFiltro)
      : publicaciones),
    [publicaciones, clienteFiltro],
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const p of publicacionesFiltradas) {
      if (!p.fecha_publicacion) continue;
      const key = format(parseISO(p.fecha_publicacion), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [publicacionesFiltradas]);

  const clienteNombre = useMemo(() => {
    const map = new Map();
    for (const c of clientes) map.set(c.id, c.nombre);
    return map;
  }, [clientes]);

  // Drag handlers
  function onDragStart(e, post) {
    setDraggingId(post.id);
    e.dataTransfer.effectAllowed = 'move';
    // Guardamos el id como dato (compatible con cualquier drop target).
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

  async function onDayDrop(e, day) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const post = publicaciones.find((p) => p.id === id);
    if (!post) return;

    // Conservamos la hora original, sólo cambiamos el día.
    const oldFecha = post.fecha_publicacion ? parseISO(post.fecha_publicacion) : new Date();
    const nuevaFecha = new Date(day);
    nuevaFecha.setHours(oldFecha.getHours(), oldFecha.getMinutes(), 0, 0);
    const iso = nuevaFecha.toISOString();

    // Si no cambia, no hacemos nada.
    if (post.fecha_publicacion === iso) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }

    // Optimistic update.
    const prevFecha = post.fecha_publicacion;
    updatePublicacion({ id: post.id, fecha_publicacion: iso, _pending: true });
    setDraggingId(null);
    setDropTarget(null);

    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/api/publicaciones/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha_publicacion: iso }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Mover falló (${res.status}): ${text || res.statusText}`);
        }
        const saved = await res.json().catch(() => null);
        if (saved && saved.id) {
          updatePublicacion(saved);
        }
      } catch (err) {
        // Rollback.
        updatePublicacion({ id: post.id, fecha_publicacion: prevFecha, _pending: false });
        alert(err.message ?? 'Error moviendo la publicación.');
      }
    }
  }

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <section className="card overflow-hidden">
      {/* Cabecera mes */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-ink-900 capitalize">
            {format(cursor, 'LLLL', { locale: es })}
          </h2>
          <span className="text-sm text-ink-400">{format(cursor, 'yyyy')}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {clientes.length > 0 && (
            <div className="relative">
              <select
                value={clienteFiltro ?? ''}
                onChange={(e) => setClienteFiltro(e.target.value || null)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium bg-ink-50 hover:bg-ink-100 border border-ink-100 text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-100 cursor-pointer transition"
                aria-label="Filtrar por cliente"
              >
                <option value="">Todos los clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          )}

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
              onClick={() => setCursor((c) => subMonths(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Mes anterior"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Mes siguiente"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Días semana */}
      <div className="grid grid-cols-7 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center">{d}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const posts = byDay.get(key) ?? [];
          const muted = !isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const isDropTarget = dropTarget === key && draggingId;

          return (
            <div
              key={key}
              onDragOver={(e) => !muted && onDayDragOver(e, key)}
              onDragLeave={() => onDayDragLeave(key)}
              onDrop={(e) => !muted && onDayDrop(e, day)}
              className={[
                'min-h-[110px] p-2 rounded-lg border align-top transition relative group',
                muted
                  ? 'bg-ink-50/60 border-transparent text-ink-300'
                  : 'bg-white border-ink-100 hover:border-brand-200 hover:shadow-sm',
                isToday ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : '',
                isDropTarget ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white bg-emerald-50/50' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={[
                  'text-xs font-semibold',
                  isToday ? 'text-brand-700' : muted ? 'text-ink-300' : 'text-ink-700',
                ].join(' ')}>
                  {format(day, 'd')}
                </span>
                {onCreatePost && !muted && (
                  <button
                    type="button"
                    onClick={() => onCreatePost(day)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition text-base leading-none"
                    aria-label={`Crear publicación el ${format(day, 'dd/MM')}`}
                  >+</button>
                )}
              </div>

              <div className="space-y-1">
                {posts.map((p) => {
                  const isSelected = p.id === selectedPostId;
                  const isDragging = draggingId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      draggable={!p._pending}
                      onDragStart={(e) => onDragStart(e, p)}
                      onDragEnd={onDragEnd}
                      onClick={() => {
                        setSelectedPostId(p.id);
                        if (onSelectPost) {
                          onSelectPost(p);
                        } else if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('studio-mb:edit-post', { detail: p }));
                        }
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ post: p, anchorRect: rect });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      className={[
                        'w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded-md truncate font-medium transition cursor-grab active:cursor-grabbing',
                        p._pending
                          ? 'bg-ink-200 text-ink-500 animate-pulse'
                          : estadoColor(p.estado),
                        isSelected ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : '',
                        isDragging ? 'opacity-40' : '',
                      ].join(' ')}
                      title={p._pending ? 'Guardando…' : `${p.tipo_contenido ?? ''} · ${p.formato ?? ''}`}
                    >
                      {p.tipo_contenido ?? p.formato ?? 'Publicación'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip flotante */}
      {tooltip && tooltip.post && (
        <PostTooltip
          post={tooltip.post}
          anchorRect={tooltip.anchorRect}
          clienteNombre={clienteNombre.get(tooltip.post.cliente_id) ?? ''}
        />
      )}
    </section>
  );
}

function PostTooltip({ post, anchorRect, clienteNombre }) {
  // Posición: encima de la pill; si no cabe, debajo.
  const tooltipW = 280;
  const margin = 8;
  const top = anchorRect.top - margin;
  // Calculamos si cabe arriba (asumimos altura máx ~180px).
  const placeBelow = top < 180;
  const y = placeBelow ? anchorRect.bottom + margin : anchorRect.top - margin;
  // Centrado horizontal respecto a la pill, clamped al viewport.
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
      className="rounded-xl bg-white border border-ink-200 shadow-pop p-3 pointer-events-none animate-in fade-in"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-ink-900 leading-tight">
          {post.tipo_contenido ?? 'Publicación'}
        </p>
        <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${estadoBadge(post.estado)}`}>
          {titleCase(post.estado)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-ink-500">
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
        <p className="mt-2 text-xs text-ink-700 leading-relaxed whitespace-pre-line line-clamp-3">
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

function estadoColor(estado) {
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
