import { useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { publicacionesStore, filtrosStore, cursorStore } from '../stores/publicaciones.js';
import { parseFechaPublicacion } from '../lib/fecha.js';

/**
 * FeedMockup — grid 3 columnas estilo Instagram con las publicaciones del
 * mes visible en el calendario (cursorStore). Solo entran posts que tengan
 * FOTO FINAL (`diseno_final`): es la vista "así quedará este mes" que ve
 * el cliente tras el diseño.
 *
 * Orden: la foto del último día del mes va arriba a la izquierda (la
 * primera), así que se ordena por fecha descendente. Las celdas van en
 * formato 3:4.
 *
 * Props:
 *   - posts: Array inicial opcional (hidratado por SSR).
 *
 *  Las imágenes se sirven por el proxy autenticado /api/assets/<id>, así que
 *  no hace falta ninguna URL de Directus en el navegador.
 */
export default function FeedMockup({ posts = [] }) {
  const storePosts = useStore(publicacionesStore);
  const filtros = useStore(filtrosStore);
  const cursor = useStore(cursorStore);
  const [open, setOpen] = useState(null);

  const displayPosts = useMemo(() => {
    const source = storePosts.length > 0 ? storePosts : posts;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const filtered = source.filter((p) => {
      // Solo posts con foto final.
      if (!disenoIdOf(p)) return false;
      // Solo del mes visible en el calendario.
      const d = parseFechaPublicacion(p.fecha_publicacion);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) return false;
      // Respetamos los filtros compartidos del calendario.
      if (filtros.clienteId && p.cliente_id !== filtros.clienteId) return false;
      if (filtros.estado && p.estado !== filtros.estado) return false;
      if (filtros.formato && p.formato !== filtros.formato) return false;
      if (filtros.red && p.red !== filtros.red) return false;
      return true;
    });
    // Último día del mes primero (arriba a la izquierda).
    return [...filtered]
      .sort((a, b) => (parseFechaPublicacion(b.fecha_publicacion)?.getTime() ?? 0)
        - (parseFechaPublicacion(a.fecha_publicacion)?.getTime() ?? 0));
  }, [storePosts, posts, filtros, cursor]);

  const mesLabel = cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <>
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 text-white text-xs font-bold">
              IG
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-900 capitalize">Mockup de feed · {mesLabel}</h3>
              <p className="text-xs text-ink-500">{displayPosts.length} posts con diseño</p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-medium">Vista previa</span>
        </header>

        <div className="p-3">
          <div className="grid grid-cols-3 gap-1">
            {displayPosts.map((p) => {
              const cover = `/api/assets/${disenoIdOf(p)}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpen(p)}
                  className="relative aspect-[3/4] bg-ink-100 overflow-hidden group"
                  aria-label={`Abrir ${p.tipo_contenido ?? 'publicación'}`}
                >
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                  />

                  {/* Hover overlay */}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="text-white text-xs font-semibold flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </span>
                    </span>
                  </span>

                  {p.formato === 'reel' && (
                    <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      Reel
                    </span>
                  )}
                  {p.formato === 'carrusel' && (
                    <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="14" height="14" rx="2"/><rect x="7" y="7" width="14" height="14" rx="2"/></svg>
                      Carrusel
                    </span>
                  )}
                </button>
              );
            })}

            {displayPosts.length === 0 && (
              <p className="col-span-3 text-center text-sm text-ink-500 py-12">
                Este mes aún no hay posts con foto final.
                <br />
                <span className="text-xs text-ink-400">Sube el diseño final desde «Editar publicación» y aparecerá aquí.</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Modal detalle */}
      {open && (
        <div
          className="fixed inset-0 bg-ink-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setOpen(null)}
        >
          <article
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`/api/assets/${disenoIdOf(open)}`}
              alt=""
              className="w-full aspect-[3/4] object-cover"
            />
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium uppercase tracking-wider">
                  {open.formato}
                </span>
                {open.tipo_contenido && (
                  <span className="text-ink-500">{open.tipo_contenido}</span>
                )}
              </div>
              <p className="text-sm whitespace-pre-line text-ink-700 leading-relaxed">{open.copywriting}</p>
              {open.hashtags?.length > 0 && (
                <p className="text-xs text-brand-600 leading-relaxed">
                  {open.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                </p>
              )}
            </div>
          </article>
        </div>
      )}
    </>
  );
}

/** Resuelve el id de la foto final (diseno_final) o null si no hay. */
function disenoIdOf(post) {
  const id = typeof post.diseno_final === 'object'
    ? post.diseno_final?.id
    : post.diseno_final;
  return id || null;
}
