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

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseFechaPublicacion } from '../lib/fecha.js';
import { transicionesPermitidas, ESTADO_LABEL } from '../lib/flujo.js';

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

  const clienteNombre = useMemo(() => {
    const m = new Map();
    for (const c of clientes) m.set(c.id, c.nombre);
    return m;
  }, [clientes]);

  const porTexto = posts.filter((p) => p.estado === 'revision');
  const porDiseno = posts.filter((p) => p.estado === 'revision_diseno');

  async function cambiarEstado(post, nuevo) {
    setBusy(post.id);
    setError('');
    try {
      const res = await fetch(`/api/publicaciones/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      setPosts((arr) => arr.filter((p) => p.id !== post.id));
      setAviso(`✓ ${post.tipo_contenido || 'Publicación'} del ${fechaLabel(post)} actualizada.`);
      setTimeout(() => setAviso(''), 3000);
    } catch (err) {
      setError(err.message ?? 'No se pudo actualizar.');
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
            onClick={() => cambiarEstado(post, a.to)}
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
        <div className="flex flex-col sm:flex-row gap-0">
          <div className="sm:w-28 shrink-0 bg-ink-100">
            {disenoId ? (
              <img
                src={`/api/assets/${disenoId}`}
                alt="Diseño final"
                className="w-full h-full sm:h-full aspect-[3/4] sm:aspect-auto object-cover"
              />
            ) : slides.length > 0 && slideImg(slides[0]?.imagen) ? (
              <img
                src={slideImg(slides[0].imagen)}
                alt="Slide 1"
                className="w-full h-full aspect-[3/4] sm:aspect-auto object-cover"
              />
            ) : (
              <div className="w-full aspect-[3/4] sm:h-full flex items-center justify-center text-ink-400 text-[11px] p-2 text-center">
                Sin diseño aún
              </div>
            )}
          </div>

          <div className="flex-1 p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
                {ESTADO_LABEL[post.estado] ?? post.estado}
              </span>
              <span className="text-xs text-ink-500">{fechaLabel(post)}</span>
              <span className="text-xs text-ink-400">·</span>
              <span className="text-xs text-ink-500">{clienteNombre.get(post.cliente_id) ?? '—'}</span>
              {post.formato && (
                <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 text-[11px]">{post.formato}</span>
              )}
            </div>

            <p className="text-sm text-ink-800 whitespace-pre-line line-clamp-3">
              {post.copywriting || <span className="text-ink-400">Sin copywriting</span>}
            </p>

            {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
              <p className="text-[11px] text-brand-600 line-clamp-1">
                {post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
              </p>
            )}

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
