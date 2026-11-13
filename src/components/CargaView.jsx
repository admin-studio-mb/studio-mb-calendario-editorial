// ============================================================================
//  src/components/CargaView.jsx
// ----------------------------------------------------------------------------
//  Carga de trabajo del mes: posts por responsable y por cliente.
//  Solo equipo (la página redirige al Cliente).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { publicacionesStore, hydratePublicaciones } from '../stores/publicaciones.js';
import {
  ESTADOS_CARGA, resumenPorCliente, resumenPorResponsable,
} from '../lib/carga.js';
import { ESTADO_LABEL } from '../lib/flujo.js';

const COLOR_ESTADO = {
  borrador: 'bg-amber-400',
  revision: 'bg-blue-400',
  en_diseno: 'bg-purple-400',
  revision_diseno: 'bg-pink-400',
  aprobado: 'bg-emerald-500',
  publicado: 'bg-teal-500',
};

export default function CargaView({
  initialPublicaciones = [],
  clientes = [],
  equipo = [],
}) {
  const store = useStore(publicacionesStore);
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  useEffect(() => {
    if (initialPublicaciones.length && publicacionesStore.get().length === 0) {
      hydratePublicaciones(initialPublicaciones);
    }
  }, [initialPublicaciones]);

  const posts = store.length ? store : initialPublicaciones;

  const porPersona = useMemo(
    () => resumenPorResponsable(posts, equipo, cursor),
    [posts, equipo, cursor],
  );
  const porCliente = useMemo(
    () => resumenPorCliente(posts, clientes, cursor),
    [posts, clientes, cursor],
  );

  const mesLabel = format(cursor, 'LLLL yyyy', { locale: es });

  function mover(delta) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100 gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold text-ink-900 capitalize">{mesLabel}</h2>
            <span className="text-xs text-ink-400">
              {porPersona.total} {porPersona.total === 1 ? 'publicación' : 'publicaciones'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 rounded-md transition"
            >
              Este mes
            </button>
            <div className="flex items-center bg-ink-50 rounded-lg p-0.5">
              <button type="button" onClick={() => mover(-1)} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600" aria-label="Mes anterior">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button type="button" onClick={() => mover(1)} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition text-ink-600" aria-label="Mes siguiente">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        </header>

        <div className="p-5">
          {porPersona.total === 0 ? (
            <p className="text-sm text-ink-400 py-8 text-center">No hay publicaciones en este mes.</p>
          ) : (
            <div className="space-y-4">
              {porPersona.filas.map((fila) => (
                <div key={fila.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-sm font-medium truncate ${fila.id === '__sin_asignar__' ? 'text-amber-700' : 'text-ink-800'}`}>
                      {fila.nombre}
                    </span>
                    <span className="text-sm font-bold text-ink-900 tabular-nums shrink-0">{fila.total}</span>
                  </div>
                  <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-ink-100">
                    {ESTADOS_CARGA.map((estado) => {
                      const n = fila.porEstado[estado] ?? 0;
                      if (!n) return null;
                      return (
                        <div
                          key={estado}
                          className={COLOR_ESTADO[estado]}
                          style={{ width: `${(n / fila.total) * 100}%` }}
                          title={`${ESTADO_LABEL[estado] ?? estado}: ${n}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-[11px] text-ink-500">
                {ESTADOS_CARGA.map((estado) => (
                  <span key={estado} className="inline-flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm ${COLOR_ESTADO[estado]}`} />
                    {ESTADO_LABEL[estado] ?? estado}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-4 border-b border-ink-100">
          <h2 className="text-sm font-semibold text-ink-900">Por cliente</h2>
          <p className="text-xs text-ink-500 mt-0.5">Volumen del mes y publicaciones sin responsable.</p>
        </header>
        {porCliente.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-400 text-center">Sin datos este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-[11px] uppercase tracking-wider text-ink-400">
              <tr>
                <th className="text-left font-semibold px-5 py-2">Cliente</th>
                <th className="text-right font-semibold px-3 py-2">Posts</th>
                <th className="text-right font-semibold px-5 py-2">Sin responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {porCliente.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-2.5 text-ink-800">{f.nombre}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-ink-900 tabular-nums">{f.total}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {f.sinResponsable > 0 ? (
                      <span className="text-amber-700 font-medium">{f.sinResponsable}</span>
                    ) : (
                      <span className="text-ink-300">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
