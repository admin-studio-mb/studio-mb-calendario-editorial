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
      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {posts.map((p) => {
          const cover = coverFor(p, baseUrl);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(p)}
              className="relative aspect-square bg-slate-200 overflow-hidden rounded-sm group"
              aria-label={`Abrir ${p.tipo_contenido ?? 'publicación'}`}
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  Sin imagen
                </div>
              )}

              {p.formato === 'Reel' && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                  ▶ Reel
                </span>
              )}
              {p.formato === 'Carrusel' && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                  ⬚ Carrusel
                </span>
              )}
            </button>
          );
        })}

        {posts.length === 0 && (
          <p className="col-span-3 text-center text-sm text-slate-500 py-8">
            Aún no hay publicaciones para previsualizar.
          </p>
        )}
      </div>

      {/* Modal detalle */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {coverFor(open, baseUrl) && (
              <img src={coverFor(open, baseUrl)} alt="" className="w-full aspect-square object-cover" />
            )}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{open.formato}</span>
                <span>{open.tipo_contenido}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{open.copywriting}</p>
              {open.hashtags?.length > 0 && (
                <p className="text-xs text-brand-600">
                  {open.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                </p>
              )}
            </div>
          </div>
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
