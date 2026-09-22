import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { format, parseISO, isSameMonth, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { publicacionesStore, cursorStore } from '../stores/publicaciones.js';

/**
 * Kpis — 4 tarjetas resumen que reaccionan al cursor del calendario.
 *
 * - Total: número de publicaciones de todos los tiempos.
 * - Este mes: posts cuya fecha_publicacion cae en el mes del cursor.
 * - En revisión: posts en estado "revision" del mes del cursor.
 * - Aprobadas: posts en estado "aprobado" del mes del cursor.
 */
export default function Kpis() {
  const publicaciones = useStore(publicacionesStore);
  const cursor = useStore(cursorStore);

  const stats = useMemo(() => {
    const total = publicaciones.length;
    let enMes = 0;
    let enRevision = 0;
    let aprobadas = 0;
    for (const p of publicaciones) {
      if (!p.fecha_publicacion) continue;
      const fecha = parseISO(p.fecha_publicacion);
      if (!isSameMonth(fecha, cursor)) continue;
      enMes++;
      if (p.estado === 'revision') enRevision++;
      else if (p.estado === 'aprobado') aprobadas++;
    }
    return { total, enMes, enRevision, aprobadas };
  }, [publicaciones, cursor]);

  const cursorLabel = format(cursor, "LLLL 'de' yyyy", { locale: es });

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
      <div className="card p-4 md:p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-400 font-medium">Total</p>
        <p className="mt-2 text-2xl md:text-3xl font-bold text-ink-900 tabular-nums">{stats.total}</p>
        <p className="text-xs text-ink-500 mt-1">publicaciones</p>
      </div>

      <div className="card p-4 md:p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-400 font-medium capitalize">
          En {format(cursor, 'LLLL', { locale: es })}
        </p>
        <p className="mt-2 text-2xl md:text-3xl font-bold text-brand-600 tabular-nums">{stats.enMes}</p>
        <p className="text-xs text-ink-500 mt-1">publicaciones programadas</p>
      </div>

      <div className="card p-4 md:p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-400 font-medium capitalize">
          En revisión · {format(cursor, 'LLL', { locale: es })}
        </p>
        <p className="mt-2 text-2xl md:text-3xl font-bold text-amber-600 tabular-nums">{stats.enRevision}</p>
        <p className="text-xs text-ink-500 mt-1">esperando feedback</p>
      </div>

      <div className="card p-4 md:p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-400 font-medium capitalize">
          Aprobadas · {format(cursor, 'LLL', { locale: es })}
        </p>
        <p className="mt-2 text-2xl md:text-3xl font-bold text-emerald-600 tabular-nums">{stats.aprobadas}</p>
        <p className="text-xs text-ink-500 mt-1">listas para publicar</p>
      </div>
    </section>
  );
}
