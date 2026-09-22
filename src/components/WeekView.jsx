import { useMemo, useState } from 'react';
import {
  startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  format, isSameDay, parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import PostPill from './PostPill.jsx';

/**
 * WeekView — 7 columnas (lun-dom) con los posts de cada día debajo.
 *
 * Props:
 *   - publicaciones, clientes, selectedPostId, setSelectedPostId, onPatchFecha
 *   - cursor: Date — la semana se centra en torno a este día
 *   - setCursor: (Date) => void — al pulsar las flechas, se mueve ±7 días
 */
export default function WeekView({
  publicaciones = [],
  clientes = [],
  selectedPostId = null,
  setSelectedPostId = () => {},
  onPatchFecha = () => {},
  cursor = new Date(),
  setCursor = () => {},
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'yyyy-MM-dd' | null

  const days = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const p of publicaciones) {
      if (!p.fecha_publicacion) continue;
      const key = format(parseISO(p.fecha_publicacion), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [publicaciones]);

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
  async function onDayDrop(e, day) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const post = publicaciones.find((p) => p.id === id);
    if (!post) return;
    const oldFecha = post.fecha_publicacion ? parseISO(post.fecha_publicacion) : new Date();
    const nuevaFecha = new Date(day);
    nuevaFecha.setHours(oldFecha.getHours(), oldFecha.getMinutes(), 0, 0);
    const iso = nuevaFecha.toISOString();
    if (post.fecha_publicacion === iso) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    onPatchFecha(post.id, prevFecha => iso, prevFecha, /*rollback*/ () => iso);
    setDraggingId(null);
    setDropTarget(null);
  }

  const weekRange = `${format(days[0], 'd MMM', { locale: es })} – ${format(days[6], 'd MMM', { locale: es })}`;

  return (
    <section className="card overflow-hidden">
      {/* Cabecera */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-ink-900 capitalize">
            {format(cursor, 'LLLL', { locale: es })}
          </h2>
          <span className="text-sm text-ink-400">{format(cursor, 'yyyy')}</span>
          <span className="text-xs text-ink-400 ml-2">Semana {weekRange}</span>
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
              onClick={() => setCursor((c) => subWeeks(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Semana anterior"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => addWeeks(c, 1))}
              className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600"
              aria-label="Semana siguiente"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Grid 7 columnas */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const posts = byDay.get(key) ?? [];
          const isToday = isSameDay(day, new Date());
          const isDropTarget = dropTarget === key && draggingId;

          return (
            <div
              key={key}
              onDragOver={(e) => onDayDragOver(e, key)}
              onDragLeave={() => onDayDragLeave(key)}
              onDrop={(e) => onDayDrop(e, day)}
              className={[
                'min-h-[280px] p-2 rounded-lg border align-top transition relative',
                'bg-white border-ink-100 hover:border-brand-200 hover:shadow-sm',
                isToday ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : '',
                isDropTarget ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white bg-emerald-50/50' : '',
              ].join(' ')}
            >
              {/* Cabecera del día */}
              <div className="flex items-baseline justify-between mb-2">
                <span className={[
                  'text-sm font-semibold capitalize',
                  isToday ? 'text-brand-700' : 'text-ink-700',
                ].join(' ')}>
                  {format(day, 'EEE', { locale: es })}
                </span>
                <span className={[
                  'text-lg font-bold tabular-nums',
                  isToday ? 'text-brand-700' : 'text-ink-900',
                ].join(' ')}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* Posts */}
              <div className="space-y-1">
                {posts.map((p) => (
                  <PostPill
                    key={p.id}
                    post={p}
                    onClick={() => {
                      setSelectedPostId(p.id);
                      window.dispatchEvent(new CustomEvent('studio-mb:edit-post', { detail: p }));
                    }}
                    onDragStart={(e) => onDragStart(e, p)}
                    onDragEnd={onDragEnd}
                    isDragging={draggingId === p.id}
                    isSelected={p.id === selectedPostId}
                    clienteNombre={clienteNombre.get(p.cliente_id) ?? ''}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
