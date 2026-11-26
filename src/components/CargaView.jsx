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
  ESTADOS_CARGA, ESTADOS_ESPERA_CLIENTE, diasEnEstado, esEsperaCliente,
  resumenPorCliente, resumenPorResponsable,
} from '../lib/carga.js';
import { ESTADO_LABEL } from '../lib/flujo.js';
import { parseFechaPublicacion } from '../lib/fecha.js';

const COLOR_ESTADO = {
  borrador: 'bg-amber-400',
  revision: 'bg-blue-400',
  en_diseno: 'bg-purple-400',
  revision_diseno: 'bg-pink-400',
  revision_conjunta: 'bg-indigo-400',
  aprobado: 'bg-emerald-500',
  publicado: 'bg-teal-500',
};

const CHIP_ESPERA = {
  revision: 'bg-blue-50 text-blue-700 border-blue-100',
  revision_diseno: 'bg-pink-50 text-pink-700 border-pink-100',
  revision_conjunta: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

function textoDias(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias === 0) return 'hoy';
  if (dias === 1) return '1 día';
  return `${dias} días`;
}

function nombreResponsable(post, equipo) {
  if (!post?.responsable_id) return 'Sin asignar';
  const u = equipo.find((x) => x.id === post.responsable_id);
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'Sin asignar';
}


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
  // La antigüedad se calcula contra el momento de render; Carga no necesita
  // una precisión de segundos, solo saber cuántos días lleva parado.
  const ahora = useMemo(() => new Date(), [cursor]);

  const porPersona = useMemo(
    () => resumenPorResponsable(posts, equipo, cursor, ahora),
    [posts, equipo, cursor, ahora],
  );
  const porCliente = useMemo(
    () => resumenPorCliente(posts, clientes, cursor, ahora),
    [posts, clientes, cursor, ahora],
  );
  const esperando = useMemo(
    () => porPersona.posts
      .filter((p) => esEsperaCliente(p.estado))
      .sort((a, b) => {
        const da = diasEnEstado(a, ahora);
        const db = diasEnEstado(b, ahora);
        return (db ?? -1) - (da ?? -1);
      }),
    [porPersona.posts, ahora],
  );
  const clientePorId = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nombre])),
    [clientes],
  );
  const clientesOrdenados = useMemo(
    () => [...porCliente].sort((a, b) => b.esperandoCliente - a.esperandoCliente || b.total - a.total),
    [porCliente],
  );
  const masAntiguoEspera = esperando.length ? diasEnEstado(esperando[0], ahora) : null;

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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-5 py-4 border-b border-ink-100 bg-ink-50/40">
          <div className="rounded-lg bg-white border border-ink-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Posts del mes</p>
            <p className="text-xl font-bold text-ink-900 tabular-nums">{porPersona.total}</p>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Esperando cliente</p>
            <p className={`text-xl font-bold tabular-nums ${porPersona.esperandoCliente > 0 ? 'text-blue-700' : 'text-ink-900'}`}>{porPersona.esperandoCliente}</p>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Parado más tiempo</p>
            <p className="text-xl font-bold text-ink-900 tabular-nums">{textoDias(porPersona.diasEsperando)}</p>
          </div>
          <div className="rounded-lg bg-white border border-ink-100 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Sin responsable</p>
            <p className={`text-xl font-bold tabular-nums ${porPersona.sinAsignar > 0 ? 'text-amber-700' : 'text-ink-900'}`}>{porPersona.sinAsignar}</p>
          </div>
        </div>

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
                  {fila.esperandoCliente > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-700">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {fila.esperandoCliente} esperando cliente
                      </span>
                      {fila.diasEsperando !== null && (
                        <span className="text-ink-400">· {textoDias(fila.diasEsperando)} parado</span>
                      )}
                    </div>
                  )}
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
          <p className="text-xs text-ink-500 mt-0.5">Volumen, esperas y publicaciones sin responsable.</p>
        </header>
        {porCliente.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-400 text-center">Sin datos este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-ink-50 text-[11px] uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-2">Cliente</th>
                  <th className="text-right font-semibold px-3 py-2">Posts</th>
                  <th className="text-right font-semibold px-3 py-2">En cliente</th>
                  <th className="text-left font-semibold px-3 py-2">Fase en cliente</th>
                  <th className="text-right font-semibold px-3 py-2">Más antiguo</th>
                  <th className="text-right font-semibold px-5 py-2">Sin responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {clientesOrdenados.map((f) => (
                  <tr key={f.id} className={f.esperandoCliente > 0 ? 'bg-blue-50/20' : undefined}>
                    <td className="px-5 py-2.5 text-ink-800">{f.nombre}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink-900 tabular-nums">{f.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {f.esperandoCliente > 0 ? (
                        <span className="text-blue-700 font-semibold">{f.esperandoCliente}</span>
                      ) : (
                        <span className="text-ink-300">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {ESTADOS_ESPERA_CLIENTE.filter((estado) => f.porEstado[estado] > 0).map((estado) => (
                          <span key={estado} className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full border ${CHIP_ESPERA[estado]}`}>
                            {ESTADO_LABEL[estado] ?? estado} · {f.porEstado[estado]}
                          </span>
                        ))}
                        {f.esperandoCliente === 0 && <span className="text-xs text-ink-300">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{textoDias(f.diasEsperando)}</td>
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
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-100 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Ahora mismo: esperando al cliente</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Lo que está parado porque la pelota está en el tejado del cliente, de más antiguo a más reciente.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold">
            {esperando.length} {esperando.length === 1 ? 'publicación' : 'publicaciones'}
            {masAntiguoEspera !== null && <span className="font-normal text-blue-600">· {textoDias(masAntiguoEspera)} la más antigua</span>}
          </span>
        </header>

        {esperando.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-400 text-center">Nadie está esperando al cliente ahora mismo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-ink-50 text-[11px] uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="text-left font-semibold px-5 py-2">Publicación</th>
                  <th className="text-left font-semibold px-3 py-2">Cliente</th>
                  <th className="text-left font-semibold px-3 py-2">Fase</th>
                  <th className="text-left font-semibold px-3 py-2">Responsable</th>
                  <th className="text-right font-semibold px-5 py-2">Parado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {esperando.map((p) => {
                  const fecha = parseFechaPublicacion(p.fecha_publicacion);
                  const dias = diasEnEstado(p, ahora);
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-2.5">
                        <span className="block text-ink-800">{p.tipo_contenido || p.formato || 'Publicación'}</span>
                        {fecha && (
                          <span className="block text-[11px] text-ink-400">
                            {format(fecha, 'd MMM', { locale: es })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{clientePorId.get(p.cliente_id) ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full border ${CHIP_ESPERA[p.estado] ?? 'bg-ink-50 text-ink-600 border-ink-100'}`}>
                          {ESTADO_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{nombreResponsable(p, equipo)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        <span className={(dias ?? 0) >= 3 ? 'text-amber-700 font-semibold' : 'text-ink-600'}>
                          {textoDias(dias)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
