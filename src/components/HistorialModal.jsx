// ============================================================================
//  src/components/HistorialModal.jsx
// ----------------------------------------------------------------------------
//  Modal con el historial completo de una publicación: un evento por cambio,
//  agrupado por día, con quién lo hizo y, en las ediciones, qué campo cambió
//  y su valor de antes y de después.
//
//  Se abre desde el botón «Historial» del modal de la publicación (el listado
//  inline desapareció: ocupaba sitio y no dejaba leer los cambios).
// ============================================================================

import { useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { TIPO_ACTIVIDAD_LABEL, parseDetalle, etiquetasDeResumen, valorLegible } from '../lib/actividad-diff.js';
import { ESTADO_LABEL } from '../lib/flujo.js';

function etiquetaEstado(estado) {
  return ESTADO_LABEL[estado] ?? estado ?? '—';
}

function nombreDe(usuario) {
  if (!usuario) return 'Sistema';
  const nombre = [usuario.first_name, usuario.last_name].filter(Boolean).join(' ').trim();
  return nombre || usuario.email || 'Sistema';
}

function diaDe(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  if (isToday(d)) return `Hoy · ${format(d, 'd MMM', { locale: es })}`;
  if (isYesterday(d)) return `Ayer · ${format(d, 'd MMM', { locale: es })}`;
  return format(d, 'd MMM yyyy', { locale: es });
}

function horaDe(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'HH:mm', { locale: es });
}

/** Tono del chip según el tipo de evento. */
const TONO = {
  creado: 'text-emerald-700 border-emerald-200',
  duplicado: 'text-sky-700 border-sky-200',
  edicion: 'text-ink-500 border-ink-200',
  estado: 'text-violet-700 border-violet-200',
  sistema: 'text-amber-800 border-amber-200',
};

function agrupar(items) {
  const grupos = [];
  for (const item of items) {
    const dia = diaDe(item.fecha_creacion);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.items.push(item);
    else grupos.push({ dia, items: [item] });
  }
  return grupos;
}

export default function HistorialModal({ items = [], onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lista = Array.isArray(items) ? items : [];
  const grupos = agrupar(lista);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Historial de la publicación"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-100">
          <div className="flex items-start gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink-900">Historial</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                {lista.length === 0
                  ? 'Todavía no hay cambios registrados.'
                  : `${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'} · el más reciente primero`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-50"
            aria-label="Cerrar historial"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          {lista.length === 0 ? (
            <p className="text-sm text-ink-500">
              Cuando alguien cree, edite o cambie el estado de esta publicación, aparecerá aquí.
            </p>
          ) : (
            <div className="space-y-6">
              {grupos.map((grupo) => (
                <section key={grupo.dia}>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                    {grupo.dia}
                  </h4>
                  <ol className="space-y-3 border-l border-ink-100 pl-4">
                    {grupo.items.map((h) => (
                      <Evento key={h.id} evento={h} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-ink-100 text-[11px] text-ink-400">
          Se guardan los últimos 50 cambios de cada publicación.
        </footer>
      </div>
    </div>
  );
}

function Evento({ evento }) {
  const { resumen, cambios } = parseDetalle(evento.detalle);
  const tipo = evento.tipo || 'sistema';
  const etiquetasViejas = cambios.length === 0 ? etiquetasDeResumen(resumen) : [];
  const texto = resumen || TIPO_ACTIVIDAD_LABEL[tipo] || 'Cambio';
  // el resumen solo aporta si no hay líneas de cambio ni lista de campos:
  // «Editado: …» repetiría lo que ya dicen las filas
  const textoUtil = texto && texto !== (TIPO_ACTIVIDAD_LABEL[tipo] ?? '');
  const mostrarTexto = (tipo !== 'estado' || !evento.estado_nuevo)
    && cambios.length === 0 && etiquetasViejas.length === 0 && textoUtil;

  return (
    <li className="relative">
      <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-ink-200 ring-4 ring-white" aria-hidden="true" />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-ink-500 tabular-nums">{horaDe(evento.fecha_creacion)}</span>
        <span className="text-[11px] text-ink-400">·</span>
        <span className="text-[11px] font-medium text-ink-700">{nombreDe(evento.usuario)}</span>
        <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full border bg-white text-[10px] font-semibold uppercase tracking-wide ${TONO[tipo] ?? TONO.sistema}`}>
          {TIPO_ACTIVIDAD_LABEL[tipo] ?? tipo}
        </span>
      </div>

      {mostrarTexto && (
        <p className="mt-1 text-xs text-ink-700 leading-relaxed">{texto}</p>
      )}

      {tipo === 'estado' && evento.estado_nuevo && (
        <ul className="mt-1.5 space-y-1">
          <li className="text-[11px] leading-relaxed text-ink-500 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-semibold text-ink-700">Estado</span>
            <span className="line-through decoration-ink-300 text-ink-400">{etiquetaEstado(evento.estado_anterior)}</span>
            <svg className="w-3 h-3 text-ink-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span className="text-ink-800">{etiquetaEstado(evento.estado_nuevo)}</span>
          </li>
        </ul>
      )}

      {cambios.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {cambios.map((c, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-ink-500 flex flex-wrap items-baseline gap-x-1.5">
              {c.etiqueta && <span className="font-semibold text-ink-700">{c.etiqueta}</span>}
              <span className="line-through decoration-ink-300 text-ink-400">{valorLegible(c.antes)}</span>
              <svg className="w-3 h-3 text-ink-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <span className="text-ink-800">{valorLegible(c.despues)}</span>
            </li>
          ))}
        </ul>
      )}

      {etiquetasViejas.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-500">
          Campos: {etiquetasViejas.join(', ')}
        </p>
      )}

      {evento.motivo && (
        <p className="mt-1.5 rounded border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          “{evento.motivo}”
        </p>
      )}
    </li>
  );
}
