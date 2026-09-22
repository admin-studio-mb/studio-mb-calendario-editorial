import { useState } from 'react';

/**
 * FeedMockup — renderiza un grid 3 columnas al estilo Instagram con las
 * publicaciones pasadas. La imagen mostrada es `diseno_final` o, si falta,
 * la primera de `imagenes_fondo`. El clic abre un modal con detalle.
 *
 * Props:
 *   - posts: Array<{
 *       id, formato, tipo_contenido, copywriting, hashtags,
 *       diseno_final?: { id }, imagenes_fondo?: string[]
 *     }>
 *   - baseUrl: string  → URL pública del CMS (para construir /assets/<id>).
 */
export default function FeedMockup({ posts = [], baseUrl = '' }) {
  const [open, setOpen] = useState(null);

  return (
    <>
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 text-white text-xs font-bold">
              IG
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Mockup de feed</h3>
              <p className="text-xs text-ink-500">{posts.length} publicaciones recientes</p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-medium">Vista previa</span>
        </header>

        <div className="p-3">
          <div className="grid grid-cols-3 gap-1">
            {posts.map((p) => {
              const cover = coverFor(p, baseUrl);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpen(p)}
                  className="relative aspect-square bg-ink-100 overflow-hidden group"
                  aria-label={`Abrir ${p.tipo_contenido ?? 'publicación'}`}
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink-400 text-xs">
                      Sin imagen
                    </div>
                  )}

                  {/* Hover overlay */}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="text-white text-xs font-semibold flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        {p.copywriting ? '·' : ''}
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

            {posts.length === 0 && (
              <p className="col-span-3 text-center text-sm text-ink-500 py-12">
                Aún no hay publicaciones para previsualizar.
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
            {coverFor(open, baseUrl) && (
              <img src={coverFor(open, baseUrl)} alt="" className="w-full aspect-square object-cover" />
            )}
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

/** Resuelve la URL de la miniatura: primero `diseno_final`, luego primera imagen de fondo. */
function coverFor(post, baseUrl) {
  if (post.diseno_final?.id) {
    return `${baseUrl}/assets/${post.diseno_final.id}`;
  }
  const first = post.imagenes_fondo?.[0];
  if (!first) return null;

  // Si es un objeto File-like { id }, construimos la URL de Directus.
  if (typeof first === 'object' && first.id) {
    return `${baseUrl}/assets/${first.id}`;
  }
  return String(first);
}
