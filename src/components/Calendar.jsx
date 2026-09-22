import { useState, useMemo, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameDay, isSameMonth,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { publicacionesStore, hydratePublicaciones } from '../stores/publicaciones.js';

/**
 * Calendar — vista mensual de publicaciones.
 *
 * Lee del store global reactivo, así que cualquier `addPublicacion()` desde
 * PostForm lo actualiza al instante, sin recargar la página.
 *
 * Props:
 *   - initialPublicaciones: array inicial hidratado por el SSR. Se mete en
 *     el store en el primer render para que el cliente y el server coincidan.
 *   - onSelectPost: (post) => void     → click sobre una tarjeta.
 *   - onCreatePost: (date: Date) => void → click en un día vacío.
 */
export default function Calendar({ initialPublicaciones = [], onSelectPost, onCreatePost }) {
  // Hidratamos el store en el cliente una sola vez con lo que vino del SSR.
  // Se hace en useEffect para que el primer render coincida con el HTML del
  // servidor (vacío) y luego se actualice con la lista real.
  useEffect(() => {
    if (initialPublicaciones.length && publicacionesStore.get().length === 0) {
      hydratePublicaciones(initialPublicaciones);
    }
  }, [initialPublicaciones]);

  const publicaciones = useStore(publicacionesStore);
  const [cursor, setCursor] = useState(new Date());

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
    for (const p of publicaciones) {
      if (!p.fecha_publicacion) continue;
      const key = format(parseISO(p.fecha_publicacion), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [publicaciones]);

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <section className="card overflow-hidden">
      {/* Cabecera mes */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-ink-900 capitalize">
            {format(cursor, 'LLLL', { locale: es })}
          </h2>
          <span className="text-sm text-ink-400">{format(cursor, 'yyyy')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 rounded-md transition"
          >
            Hoy
          </button>
          <div className="flex items-center bg-ink-50 rounded-lg p-0.5 ml-2">
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

          return (
            <div
              key={key}
              className={[
                'min-h-[110px] p-2 rounded-lg border align-top transition relative group',
                muted
                  ? 'bg-ink-50/60 border-transparent text-ink-300'
                  : 'bg-white border-ink-100 hover:border-brand-200 hover:shadow-sm',
                isToday ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white' : '',
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
                {posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPost?.(p)}
                    className={[
                      'w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded-md truncate font-medium transition',
                      p._pending ? 'bg-ink-200 text-ink-500 animate-pulse' : estadoColor(p.estado),
                    ].join(' ')}
                    title={p._pending ? 'Guardando…' : `${p.tipo_contenido ?? ''} · ${p.formato ?? ''} · ${p.estado ?? ''}`}
                  >
                    {p.tipo_contenido ?? p.formato ?? 'Publicación'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
