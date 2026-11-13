// ============================================================================
//  src/components/AprobacionPublica.jsx
// ----------------------------------------------------------------------------
//  Vista pública de aprobación (sin login). Se carga con el token de la URL y
//  permite confirmar el texto, aprobar el diseño o pedir cambios con motivo.
// ============================================================================

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseFechaPublicacion } from '../lib/fecha.js';
import { redNombre } from '../lib/redes.js';
import RedIcon from './RedIcon.jsx';
import CopyButton from './CopyButton.jsx';
import { hashtagsACadena } from '../lib/textos.js';

const ESTADO_LABEL = {
  borrador: 'Borrador',
  revision: 'Pendiente de confirmar texto',
  en_diseno: 'En diseño',
  revision_diseno: 'Pendiente de aprobar diseño',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
};

export default function AprobacionPublica({ token }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [motivoPanel, setMotivoPanel] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState('');

  async function cargar() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/publico/aprobacion/${token}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setPost(data);
    } catch (err) {
      setError(err.message ?? 'No se pudo cargar la publicación.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, [token]);

  async function enviar(accion, motivoTexto = null) {
    setEnviando(true);
    setError('');
    setMotivoError('');
    try {
      const body = { accion };
      if (motivoTexto !== null) body.motivo = motivoTexto;
      const res = await fetch(`/api/publico/aprobacion/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setOkMsg(
        accion === 'cambios'
          ? '✓ Cambios enviados. El equipo revisará tus comentarios.'
          : accion === 'aprobar'
            ? '✓ Publicación aprobada. ¡Gracias!'
            : '✓ Texto confirmado. Pasamos al diseño.',
      );
      setMotivoPanel(false);
      setMotivo('');
      setPost((p) => (p ? { ...p, estado: data.estado } : p));
    } catch (err) {
      if (motivoTexto !== null) setMotivoError(err.message ?? 'No se pudo enviar.');
      else setError(err.message ?? 'No se pudo enviar la respuesta.');
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-10 text-center text-sm text-ink-400">Cargando publicación…</div>
    );
  }

  if (error && !post) {
    return (
      <div className="card p-10 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="text-base font-semibold text-ink-900">No se puede abrir este enlace</p>
        <p className="text-sm text-ink-500">{error}</p>
        <p className="text-xs text-ink-400">Pide al equipo de Studio mb un enlace nuevo.</p>
      </div>
    );
  }

  if (!post) return null;

  const fecha = parseFechaPublicacion(post.fecha);
  const fechaLabel = fecha && !Number.isNaN(fecha.getTime())
    ? format(fecha, "EEEE d 'de' MMMM 'de' yyyy · HH:mm", { locale: es })
    : 'Sin fecha';

  const pendienteTexto = post.estado === 'revision';
  const pendienteDiseno = post.estado === 'revision_diseno';
  const puedeActuar = pendienteTexto || pendienteDiseno;

  return (
    <div className="space-y-4">
      {okMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-4">
          {okMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm p-4">{error}</div>
      )}

      <article className="card overflow-hidden">
        <header className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-400">Publicación</p>
            <h1 className="text-lg font-bold text-ink-900 truncate">
              {post.tipo || 'Publicación'}{post.cliente ? ` · ${post.cliente}` : ''}
            </h1>
          </div>
          <span className="inline-flex px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
            {ESTADO_LABEL[post.estado] ?? post.estado}
          </span>
        </header>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
            <svg className="w-5 h-5 text-brand-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">Fecha de publicación</p>
              <p className="text-lg font-extrabold text-ink-900 capitalize tabular-nums">{fechaLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-ink-600">
            {post.red && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ink-50 border border-ink-100">
                <RedIcon red={post.red} className="w-3.5 h-3.5" conTitulo={false} />
                {redNombre(post.red)}
              </span>
            )}
            {post.formato && (
              <span className="px-2 py-1 rounded-lg bg-ink-100 text-ink-600">{post.formato}</span>
            )}
          </div>

          {post.motivo && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
              <b>Cambios pedidos:</b> {post.motivo}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
                Descripción del post (copy)
              </p>
              <CopyButton text={post.copy ?? ''} label="Copiar" />
            </div>
            <p className="text-sm text-ink-800 whitespace-pre-line leading-relaxed">
              {post.copy || '—'}
            </p>
          </div>

          {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Hashtags</p>
                <CopyButton text={hashtagsACadena(post.hashtags)} label="Copiar" />
              </div>
              <p className="text-sm text-brand-600 leading-relaxed">
                {hashtagsACadena(post.hashtags)}
              </p>
            </div>
          )}

          {Array.isArray(post.slides) && post.slides.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
                Textos de los slides
              </p>
              <p className="text-[11px] text-ink-400 mb-2">El texto de cada slide aparece dentro de la imagen.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {post.slides.map((s, idx) => (
                  <div key={idx} className="rounded-lg border border-ink-100 overflow-hidden bg-white">
                    {s.imagen ? (
                      <a href={s.imagen} target="_blank" rel="noopener noreferrer">
                        <img
                          src={s.imagen}
                          alt={`Slide ${idx + 1}`}
                          className="w-full aspect-[3/4] object-cover bg-ink-100"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </a>
                    ) : (
                      <div className="w-full aspect-[3/4] bg-ink-50 flex items-center justify-center text-[11px] text-ink-400">
                        Sin foto
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Slide {idx + 1}</p>
                      {s.texto && <p className="text-xs text-ink-700 whitespace-pre-line mt-0.5">{s.texto}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {post.diseno && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Diseño final</p>
              <a href={post.diseno} target="_blank" rel="noopener noreferrer" className="inline-block">
                <img
                  src={post.diseno}
                  alt="Diseño final"
                  className="w-full max-w-sm aspect-[3/4] object-cover rounded-xl border border-ink-200 bg-ink-100"
                />
              </a>
            </div>
          )}
        </div>

        {puedeActuar && (
          <footer className="px-5 py-4 border-t border-ink-100 bg-ink-50/60 space-y-3">
            {motivoPanel ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <label htmlFor="motivo" className="block text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                  ¿Qué hay que cambiar?
                </label>
                <textarea
                  id="motivo"
                  rows={3}
                  maxLength={500}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: el logo está muy pequeño y el texto del slide 2 no se lee bien."
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                />
                {motivoError && <p className="text-xs text-red-600">{motivoError}</p>}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-amber-700">{motivo.trim().length}/500</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setMotivoPanel(false); setMotivo(''); setMotivoError(''); }}
                      disabled={enviando}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-white transition disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => enviar('cambios', motivo.trim())}
                      disabled={enviando || motivo.trim().length === 0}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50"
                    >
                      {enviando ? 'Enviando…' : 'Pedir cambios'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => { setMotivo(''); setMotivoError(''); setMotivoPanel(true); }}
                  disabled={enviando}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-50"
                >
                  Pedir cambios
                </button>
                {pendienteTexto && (
                  <button
                    type="button"
                    onClick={() => enviar('confirmar')}
                    disabled={enviando}
                    className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-50"
                  >
                    {enviando ? 'Enviando…' : '✓ Confirmar texto'}
                  </button>
                )}
                {pendienteDiseno && (
                  <button
                    type="button"
                    onClick={() => enviar('aprobar')}
                    disabled={enviando}
                    className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {enviando ? 'Enviando…' : '✓ Aprobar publicación'}
                  </button>
                )}
              </div>
            )}
          </footer>
        )}
      </article>

      <p className="text-[11px] text-ink-400 text-center">
        Enlace privado de Studio mb · no lo compartas fuera de tu equipo.
      </p>
    </div>
  );
}
