import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameDay, isSameMonth,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Calendar — vista mensual de publicaciones.
 *
 * Props:
 *   - publicaciones: Array<{
 *       id, fecha_publicacion (ISO), tipo_contenido, formato, estado,
 *       diseno_final?: { id }, imagenes_fondo?: string[]|{id}[],
 *       cliente?: { nombre }
 *     }>
 *   - onSelectPost: (post) => void     → click sobre una tarjeta.
 *   - onCreatePost: (date: Date) => void → click en un día vacío.
 */
export default function Calendar({ publicaciones = [], onSelectPost, onCreatePost }) {
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Cabecera mes */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="p-2 rounded-md hover:bg-slate-100"
          aria-label="Mes anterior"
        >‹</button>
        <h2 className="text-base font-semibold capitalize">
          {format(cursor, 'LLLL yyyy', { locale: es })}
        </h2>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="p-2 rounded-md hover:bg-slate-100"
          aria-label="Mes siguiente"
        >›</button>
      </div>

      {/* Días semana */}
      <div className="grid grid-cols-7 text-xs font-medium text-slate-500 border-b border-slate-200">
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center">{d}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const posts = byDay.get(key) ?? [];
          const muted = !isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={key}
              className={[
                'min-h-[110px] p-1.5 border-b border-r border-slate-100 align-top',
                muted ? 'bg-slate-50 text-slate-400' : 'bg-white',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={[
                    'text-xs font-medium',
                    isToday ? 'bg-brand-500 text-white rounded-full w-6 h-6 inline-flex items-center justify-center' : '',
                  ].join(' ')}
                >
                  {format(day, 'd')}
                </span>
                {onCreatePost && (
                  <button
                    type="button"
                    onClick={() => onCreatePost(day)}
                    className="text-xs text-slate-400 hover:text-brand-600"
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
                      'w-full text-left text-[11px] leading-snug px-1.5 py-1 rounded truncate',
                      estadoColor(p.estado),
                    ].join(' ')}
                    title={`${p.tipo_contenido ?? ''} · ${p.formato ?? ''} · ${p.estado ?? ''}`}
                  >
                    {p.tipo_contenido ?? p.formato ?? 'Publicación'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function estadoColor(estado) {
  switch (estado) {
    case 'Borrador':   return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
    case 'Revisión':   return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case 'Aprobado':   return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    default:           return 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  }
}
