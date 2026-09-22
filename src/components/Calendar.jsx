import { useState, useMemo, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameDay, isSameMonth,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { publicacionesStore, cursorStore, hydratePublicaciones, updatePublicacion } from '../stores/publicaciones.js';
import WeekView from './WeekView.jsx';
import ListView from './ListView.jsx';
import PostPill from './PostPill.jsx';

/**
 * Calendar — vista Mes / Semana / Lista.
 *
 * Props:
 *   - initialPublicaciones: array inicial hidratado por el SSR.
 *   - clientes: array de clientes para el filtro y el tooltip.
 *   - apiBase: para llamadas a /api/publicaciones/:id (drag&drop).
 */
export default function Calendar({ initialPublicaciones = [], clientes = [], apiBase = '' }) {
  useEffect(() => {
    if (initialPublicaciones.length && publicacionesStore.get().length === 0) {
      hydratePublicaciones(initialPublicaciones);
    }
  }, [initialPublicaciones]);

  const publicaciones = useStore(publicacionesStore);
  const [view, setView] = useState('month'); // 'month' | 'week' | 'list'
  const cursor = useStore(cursorStore);
  const setCursor = (updater) => {
    const current = cursorStore.get();
    const next = typeof updater === 'function' ? updater(current) : updater;
    cursorStore.set(next);
  };
  const [clienteFiltro, setClienteFiltro] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Filtro por cliente (compartido entre vistas).
  const publicacionesFiltradas = useMemo(
    () => (clienteFiltro
      ? publicaciones.filter((p) => p.cliente_id === clienteFiltro)
      : publicaciones),
    [publicaciones, clienteFiltro],
  );

  // Días del mes (vista mes).
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

  // Handler de drop compartido para Mes.
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
        if (!res.ok) throw new Error(`Mover falló (${res.status})`);
        const saved = await res.json().catch(() => null);
        if (saved && saved.id) updatePublicacion({ ...saved, _pending: false });
      } catch (err) {
        updatePublicacion({ id: post.id, fecha_publicacion: prevFecha, _pending: false });
        alert(err.message ?? 'Error moviendo la publicación.');
      }
    }
  }

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

  // PATCH usado por WeekView y ListView. Devuelve una función que actualiza.
  const patchFecha = (postId, newDate, prevFecha, _rollback) => {
    updatePublicacion({ id: postId, fecha_publicacion: typeof newDate === 'function' ? newDate(prevFecha) : newDate, _pending: true });
    if (apiBase) {
      (async () => {
        try {
          const iso = typeof newDate === 'function' ? newDate(prevFecha) : newDate;
          const res = await fetch(`${apiBase}/api/publicaciones/${postId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha_publicacion: iso }),
          });
          if (!res.ok) throw new Error(`Mover falló (${res.status})`);
          const saved = await res.json().catch(() => null);
          if (saved && saved.id) updatePublicacion({ ...saved, _pending: false });
        } catch (err) {
          updatePublicacion({ id: postId, fecha_publicacion: prevFecha, _pending: false });
          alert(err.message ?? 'Error moviendo la publicación.');
        }
      })();
    }
  };

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <>
      {/* Cabecera con selector de vista + filtro de cliente + mes */}
      <section className="card overflow-hidden mb-4">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Toggle Mes/Semana/Lista */}
            <div className="inline-flex bg-ink-100 rounded-lg p-0.5">
              {[
                { id: 'month', label: 'Mes' },
                { id: 'week', label: 'Semana' },
                { id: 'list', label: 'Lista' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={[
                    'px-3 py-1.5 text-xs font-semibold rounded-md transition',
                    view === v.id
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-ink-500 hover:text-ink-700',
                  ].join(' ')}
                >
                  {v.label}
                </button>
              ))}
            </div>
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
          </div>
        </header>
      </section>

      {/* Vista activa */}
      {view === 'month' && (
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-ink-900 capitalize">
                {format(cursor, 'LLLL', { locale: es })}
              </h2>
              <span className="text-sm text-ink-400">{format(cursor, 'yyyy')}</span>
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

          <div className="grid grid-cols-7 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {weekDays.map((d) => (
              <div key={d} className="py-2 text-center">{d}</div>
            ))}
          </div>

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
                  </div>

                  <div className="space-y-1">
                    {posts.map((p) => (
                      <PostPill
                        key={p.id}
                        post={p}
                        isSelected={p.id === selectedPostId}
                        isDragging={draggingId === p.id}
                        clienteNombre={clienteNombre.get(p.cliente_id) ?? ''}
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
        </section>
      )}

      {view === 'week' && (
        <WeekView
          publicaciones={publicacionesFiltradas}
          clientes={clientes}
          selectedPostId={selectedPostId}
          setSelectedPostId={setSelectedPostId}
          onPatchFecha={patchFecha}
          cursor={cursor}
          setCursor={setCursor}
        />
      )}

      {view === 'list' && (
        <ListView
          publicaciones={publicacionesFiltradas}
          clientes={clientes}
          selectedPostId={selectedPostId}
          setSelectedPostId={setSelectedPostId}
          onPatchFecha={patchFecha}
          cursor={cursor}
          setCursor={setCursor}
        />
      )}
    </>
  );
}
