// ============================================================================
//  src/components/AprobacionLote.jsx
// ----------------------------------------------------------------------------
//  Página pública con varios pendientes (los tokens vienen en ?tokens=...).
//  Cada tarjeta permite confirmar/aprobar o pedir cambios con comentario,
//  exactamente igual que el enlace individual. No requiere login.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseFechaPublicacion } from '../lib/fecha.js';
import { escalaMarca } from '../lib/marca.js';
import { redNombre } from '../lib/redes.js';
import { hashtagsACadena } from '../lib/textos.js';
import DesignCarousel from './DesignCarousel.jsx';

const ESTADO_LABEL = {
  revision: 'Pendiente de confirmar texto',
  revision_diseno: 'Pendiente de aprobar diseño',
  revision_conjunta: 'Pendiente de aprobar texto y diseño',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
};

const ESTADO_BADGE = {
  revision: 'bg-blue-50 text-blue-700',
  revision_diseno: 'bg-pink-50 text-pink-700',
  revision_conjunta: 'bg-indigo-50 text-indigo-700',
  aprobado: 'bg-emerald-50 text-emerald-700',
  publicado: 'bg-teal-50 text-teal-700',
};

function tokensDe(raw) {
  return [...new Set(String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => /^[0-9a-f]{32}$/i.test(t)))];
}

function fechaLabel(valor) {
  const d = parseFechaPublicacion(valor);
  return d && !Number.isNaN(d.getTime())
    ? format(d, "EEEE d 'de' MMMM 'de' yyyy · HH:mm", { locale: es })
    : 'Sin fecha';
}

function Tarjeta({ item }) {
  const [estado, setEstado] = useState(item.estado);
  const [panel, setPanel] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [cambio, setCambio] = useState('texto');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const esConjunta = estado === 'revision_conjunta';
  const pendiente = ['revision', 'revision_diseno', 'revision_conjunta'].includes(estado);
  const etiquetaAprobar = estado === 'revision'
    ? '✓ Confirmar texto'
    : esConjunta ? '✓ Aprobar texto y diseño' : '✓ Aprobar diseño';

  const disenos = useMemo(() => {
    const lista = Array.isArray(item.disenos) ? item.disenos.filter(Boolean) : [];
    if (lista.length) return lista;
    return item.diseno ? [item.diseno] : [];
  }, [item.diseno, item.disenos]);

  async function enviar(accion, motivoTexto = null) {
    setBusy(true);
    setError('');
    try {
      const body = { accion };
      if (motivoTexto !== null) body.motivo = motivoTexto;
      if (esConjunta && accion === 'cambios') body.cambio = cambio;
      const res = await fetch(`/api/publico/aprobacion/${item.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setEstado(data.estado ?? estado);
      setPanel(false);
      setMotivo('');
      setAviso(
        accion === 'cambios'
          ? '✓ Comentario enviado al equipo.'
          : '✓ Publicación confirmada. ¡Gracias!',
      );
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card overflow-hidden">
      <header className="px-4 py-3 border-b border-ink-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Publicación</p>
          <h2 className="text-base font-bold text-ink-900 truncate">
            {item.tipo || 'Publicación'}
          </h2>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO_BADGE[estado] ?? 'bg-ink-100 text-ink-700'}`}>
          {ESTADO_LABEL[estado] ?? estado}
        </span>
      </header>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-xs text-ink-600">
          <span>{fechaLabel(item.fecha)}</span>
          {item.red && <span>· {redNombre(item.red)}</span>}
          {item.formato && <span>· {item.formato}</span>}
        </div>

        {item.motivo && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
            <b>Cambios pedidos:</b> {item.motivo}
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-1">Copy</p>
          <p className="text-sm text-ink-800 whitespace-pre-line leading-relaxed">{item.copy || '—'}</p>
          {Array.isArray(item.hashtags) && item.hashtags.length > 0 && (
            <p className="text-xs text-brand-600 mt-1.5">{hashtagsACadena(item.hashtags)}</p>
          )}
        </div>

        {disenos.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
              Diseño{disenos.length > 1 ? ` · ${disenos.length} slides` : ''}
            </p>
            <div className="max-w-[200px]">
              <DesignCarousel images={disenos} alt="Diseño final" className="rounded-lg border border-ink-200" />
            </div>
          </div>
        )}
      </div>

      {(aviso || error) && (
        <div className={`mx-4 mb-3 rounded-lg border p-3 text-xs ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {error || aviso}
        </div>
      )}

      {pendiente && (
        <footer className="px-4 py-3 border-t border-ink-100 bg-ink-50/50 space-y-2">
          {panel ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                ¿Qué quieres cambiar? Deja un comentario
              </label>
              {esConjunta && (
                <select
                  value={cambio}
                  onChange={(e) => setCambio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-ink-800"
                  aria-label="Qué hay que cambiar"
                >
                  <option value="texto">Solo el texto</option>
                  <option value="diseno">Solo el diseño</option>
                  <option value="ambos">Texto y diseño</option>
                </select>
              )}
              <textarea
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: el logo está muy pequeño y el texto del slide 2 no se lee bien."
                className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setPanel(false); setMotivo(''); }}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-white disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => enviar('cambios', motivo.trim())}
                  disabled={busy || motivo.trim().length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy ? 'Enviando…' : 'Pedir cambios'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setMotivo(''); setPanel(true); setError(''); }}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
              >
                Pedir cambios
              </button>
              <button
                type="button"
                onClick={() => enviar(estado === 'revision' ? 'confirmar' : 'aprobar')}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Enviando…' : etiquetaAprobar}
              </button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

export default function AprobacionLote({ tokens: rawTokens = '' }) {
  const tokens = useMemo(() => tokensDe(rawTokens), [rawTokens]);
  const [items, setItems] = useState([]);
  const [errores, setErrores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setLoading(true);
      const resultados = await Promise.all(tokens.map(async (token) => {
        try {
          const res = await fetch(`/api/publico/aprobacion/${token}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
          return { ...data, token };
        } catch (err) {
          return { token, error: err.message ?? 'No se pudo abrir.' };
        }
      }));
      if (cancelado) return;
      setItems(resultados.filter((x) => !x.error));
      setErrores(resultados.filter((x) => x.error));
      setLoading(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [tokens]);

  const marca = items[0]?.marca;

  useEffect(() => {
    if (!marca?.color) return;
    const escala = escalaMarca(marca.color);
    for (const [tono, hex] of Object.entries(escala)) {
      document.documentElement.style.setProperty(`--color-brand-${tono}`, hex);
    }
  }, [marca]);

  if (loading) return <div className="card p-10 text-center text-sm text-ink-400">Cargando pendientes…</div>;

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="text-base font-semibold text-ink-900">No se puede abrir este enlace</p>
        <p className="text-sm text-ink-500">{errores[0]?.error ?? 'No hay publicaciones pendientes en este enlace.'}</p>
        <p className="text-xs text-ink-400">Pide un enlace nuevo al equipo que gestiona tu calendario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 pb-1">
        {marca?.logo ? (
          <img src={marca.logo} alt={marca.nombre} className="w-10 h-10 rounded-lg bg-white border border-ink-100 object-contain p-1" />
        ) : (
          <span className="inline-flex w-10 h-10 items-center justify-center rounded-lg bg-brand-600 text-white font-bold">
            {(marca?.nombre ?? 'C').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900 leading-tight truncate">{marca?.nombre ?? 'Calendario editorial'}</p>
          <p className="text-[11px] uppercase tracking-wider text-ink-400 leading-tight">
            {items.length} {items.length === 1 ? 'publicación pendiente' : 'publicaciones pendientes'}
          </p>
        </div>
      </header>

      {errores.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
          {errores.length} enlace{errores.length === 1 ? '' : 's'} no se pudo abrir. El resto sigue disponible.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => <Tarjeta key={item.token} item={item} />)}
      </div>

      <p className="text-[11px] text-ink-400 text-center">
        Enlace privado · no lo compartas fuera de tu equipo.
      </p>
    </div>
  );
}
