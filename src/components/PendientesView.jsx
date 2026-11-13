// ============================================================================
//  src/components/PendientesView.jsx
// ----------------------------------------------------------------------------
//  Vista "Pendientes": lista los posts que esperan una acción.
//    - revision        → el cliente (o quien sea) tiene que confirmar el texto.
//    - revision_diseno → el cliente tiene que aprobar el diseño.
//
//  Los botones salen de transicionesPermitidas() (misma fuente que el modal
//  y que el guard del servidor). Incluye "Confirmar todos" para los textos.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseFechaPublicacion } from '../lib/fecha.js';
import { transicionesPermitidas, ESTADO_LABEL } from '../lib/flujo.js';
import { redNombre } from '../lib/redes.js';
import RedIcon from './RedIcon.jsx';
import { publicacionesStore, hydratePublicaciones } from '../stores/publicaciones.js';

const TONO_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
  pink: 'bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-200',
  emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
  teal: 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200',
};

function fechaLabel(p) {
  const d = parseFechaPublicacion(p.fecha_publicacion);
  if (!d || Number.isNaN(d.getTime())) return 'Sin fecha';
  return format(d, "d 'de' MMMM · HH:mm", { locale: es });
}

function disenoIdOf(post) {
  const id = typeof post.diseno_final === 'object' ? post.diseno_final?.id : post.diseno_final;
  return id || null;
}

function slideImg(imagen) {
  const s = String(imagen ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `/api/assets/${s}`;
}

export default function PendientesView({ initialPosts = [], clientes = [], currentUser = null }) {
  const [posts, setPosts] = useState(initialPosts);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  // Pedir cambios exige motivo: guardamos el post al que se lo estamos pidiendo.
  const [motivoPara, setMotivoPara] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [motivoErr, setMotivoErr] = useState('');

  // Si el usuario confirma/aprueba desde el modal (que actualiza el store),
  // quitamos de la lista los posts que ya no están pendientes. Para eso el
  // store debe tener los posts de esta página.
  useEffect(() => {
    if (publicacionesStore.get().length === 0 && initialPosts.length > 0) {
      hydratePublicaciones(initialPosts);
    }
    const unsub = publicacionesStore.subscribe((list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      setPosts((prev) => prev.filter((p) => {
        const cur = list.find((x) => x.id === p.id);
        return !cur || cur.estado === 'revision' || cur.estado === 'revision_diseno';
      }));
    });
    return unsub;
  }, []);

  const clienteNombre = useMemo(() => {
    const m = new Map();
    for (const c of clientes) m.set(c.id, c.nombre);
    return m;
  }, [clientes]);

  const porTexto = posts.filter((p) => p.estado === 'revision');
  const porDiseno = posts.filter((p) => p.estado === 'revision_diseno');

  async function cambiarEstado(post, nuevo, motivoTexto = null) {
    setBusy(post.id);
    setError('');
    try {
      const body = { estado: nuevo };
      if (motivoTexto !== null) body.motivo_rechazo = motivoTexto;
      const res = await fetch(`/api/publicaciones/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      setPosts((arr) => arr.filter((p) => p.id !== post.id));
      setMotivoPara(null);
      setMotivo('');
      setMotivoErr('');
      setAviso(`✓ ${post.tipo_contenido || 'Publicación'} del ${fechaLabel(post)} actualizada.`);
      setTimeout(() => setAviso(''), 3000);
    } catch (err) {
      if (motivoTexto !== null) {
        setMotivoErr(err.message ?? 'No se pudo pedir cambios.');
      } else {
        setError(err.message ?? 'No se pudo actualizar.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function confirmarTodos() {
    if (porTexto.length === 0) return;
    if (!confirm(`¿Confirmar las ${porTexto.length} publicaciones de texto pendientes?`)) return;
    for (const post of [...porTexto]) {
      // Reutilizamos cambiarEstado pero sin borrar aviso entre items.
      setBusy(post.id);
      try {
        const res = await fetch(`/api/publicaciones/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'en_diseno' }),
        });
        if (res.ok) {
          setPosts((arr) => arr.filter((p) => p.id !== post.id));
        } else {
          const text = await res.text().catch(() => '');
          let msg = `Error (${res.status})`;
          try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
          setError(`${post.tipo_contenido || 'Publicación'}: ${msg}`);
        }
      } catch (err) {
        setError(`${post.tipo_contenido || 'Publicación'}: ${err.message ?? 'error'}`);
      }
    }
    setBusy(null);
    setAviso('✓ Confirmadas todas las que se pudieron.');
    setTimeout(() => setAviso(''), 3000);
  }

  function Acciones({ post }) {
    const acciones = transicionesPermitidas(post.estado, currentUser);
    if (acciones.length === 0) {
      return <span className="text-xs text-ink-400">Sin acciones para tu rol</span>;
    }
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {acciones.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={busy === post.id}
            onClick={() => {
              // "Pedir cambios" (revision_diseno → en_diseno) exige motivo.
              if (post.estado === 'revision_diseno' && a.to === 'en_diseno') {
                setMotivo('');
                setMotivoErr('');
                setMotivoPara(post);
                return;
              }
              cambiarEstado(post, a.to);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${TONO_CLASSES[a.tono] ?? 'bg-ink-50 text-ink-700 hover:bg-ink-100 border-ink-200'}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    );
  }

  function Tarjeta({ post }) {
    const disenoId = disenoIdOf(post);
    const slides = Array.isArray(post.imagenes_fondo) ? post.imagenes_fondo : [];
    return (
      <article className="card overflow-hidden">
        <div className="p-4 space-y-4">
          {/* Cabecera */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
              {ESTADO_LABEL[post.estado] ?? post.estado}
            </span>
            <span className="text-xs text-ink-500">{fechaLabel(post)}</span>
            <span className="text-xs text-ink-400">·</span>
            <span className="text-xs text-ink-500">{clienteNombre.get(post.cliente_id) ?? '—'}</span>
            {post.red && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-600">
                <RedIcon red={post.red} className="w-3.5 h-3.5" conTitulo={false} />
                {redNombre(post.red)}
              </span>
            )}
            {post.formato && (
              <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 text-[11px]">{post.formato}</span>
            )}
            {post.tipo_contenido && (
              <span className="text-xs text-ink-500">{post.tipo_contenido}</span>
            )}
          </div>

          {/* Descripción del post (copywriting) */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">
              Descripción del post (copy)
            </p>
            <p className="text-sm text-ink-800 whitespace-pre-line leading-relaxed">
              {post.copywriting || <span className="text-ink-400">Sin descripción</span>}
            </p>
            {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
              <p className="text-[11px] text-brand-600 mt-1.5">
                {post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
              </p>
            )}
          </div>

          {/* Textos de los slides */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
              Textos de los slides · {slides.length}
              <span className="normal-case tracking-normal font-normal text-ink-400">
                {' '}— el texto que va dentro de cada imagen
              </span>
            </p>
            {slides.length === 0 ? (
              <p className="text-xs text-ink-400">Este post no tiene slides.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {slides.map((s, idx) => {
                  const esObjeto = s && typeof s === 'object';
                  const texto = esObjeto ? (s.texto ?? '') : '';
                  const img = esObjeto ? slideImg(s.imagen) : slideImg(s);
                  return (
                    <div key={idx} className="shrink-0 w-28">
                      {img ? (
                        <img
                          src={img}
                          alt={`Slide ${idx + 1}`}
                          className="w-28 aspect-[3/4] object-cover rounded-md border border-ink-200 bg-ink-100"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-28 aspect-[3/4] rounded-md border border-dashed border-ink-300 bg-ink-50 flex items-center justify-center text-[10px] text-ink-400">
                          Sin foto
                        </div>
                      )}
                      <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mt-1">
                        Slide {idx + 1}
                      </p>
                      {texto ? (
                        <p className="text-[11px] text-ink-700 whitespace-pre-line leading-snug">{texto}</p>
                      ) : (
                        <p className="text-[11px] text-ink-300">Sin texto</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Diseño final (si lo hay) */}
          {disenoId && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Diseño final</p>
              <img
                src={`/api/assets/${disenoId}`}
                alt="Diseño final"
                className="w-28 aspect-[3/4] object-cover rounded-md border border-ink-200 bg-ink-100"
              />
            </div>
          )}

          {/* Panel para pedir cambios con motivo */}
          {motivoPara?.id === post.id && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <label htmlFor={`motivo-${post.id}`} className="block text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                ¿Qué hay que cambiar?
              </label>
              <textarea
                id={`motivo-${post.id}`}
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: el logo está muy pequeño y el texto del slide 2 no se lee bien."
                className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              />
              {motivoErr && <p className="text-xs text-red-600">{motivoErr}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-amber-700">{motivo.trim().length}/500</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setMotivoPara(null); setMotivo(''); setMotivoErr(''); }}
                    disabled={busy === post.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 hover:bg-white transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstado(post, 'en_diseno', motivo.trim())}
                    disabled={busy === post.id || motivo.trim().length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    {busy === post.id ? 'Enviando…' : 'Pedir cambios'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('studio-mb:edit-post', { detail: post }))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-ink-700 hover:bg-ink-50 border border-ink-200 transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Ver completo
            </button>
            <Acciones post={post} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>
      )}
      {aviso && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{aviso}</div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Por confirmar texto · {porTexto.length}
          </h2>
          {porTexto.length > 1 && transicionesPermitidas('revision', currentUser).length > 0 && (
            <button
              type="button"
              onClick={confirmarTodos}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition disabled:opacity-50"
            >
              ✓ Confirmar todos ({porTexto.length})
            </button>
          )}
        </div>
        {porTexto.length === 0 ? (
          <p className="text-sm text-ink-400 py-6">Nada pendiente de confirmar.</p>
        ) : (
          <div className="space-y-3">
            {porTexto.map((p) => <Tarjeta key={p.id} post={p} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500 mb-3">
          Por aprobar diseño · {porDiseno.length}
        </h2>
        {porDiseno.length === 0 ? (
          <p className="text-sm text-ink-400 py-6">Nada pendiente de aprobar.</p>
        ) : (
          <div className="space-y-3">
            {porDiseno.map((p) => <Tarjeta key={p.id} post={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
