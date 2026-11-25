// ============================================================================
//  src/components/DesignCarousel.jsx
// ----------------------------------------------------------------------------
//  Visor del diseño final. Con una imagen se comporta como una foto; con
//  varias, es un carrusel horizontal con snap (dedo/rueda) y puntos.
// ============================================================================

import { useEffect, useRef, useState } from 'react';

function resolverImagen(valor) {
  const id = typeof valor === 'object' ? valor?.id : valor;
  const s = String(id ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  return `/api/assets/${s}`;
}

export default function DesignCarousel({
  images = [],
  alt = 'Diseño final',
  className = '',
  aspect = 'aspect-[3/4]',
}) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const fuentes = images.map(resolverImagen).filter(Boolean);

  // Si cambian las imágenes (otra publicación), volvemos a la primera.
  useEffect(() => {
    setIdx(0);
    if (ref.current) ref.current.scrollLeft = 0;
  }, [images.join('|')]);

  if (fuentes.length === 0) return null;

  function irA(i) {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  function alDesplazar() {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (fuentes.length === 1) {
    return (
      <img
        src={fuentes[0]}
        alt={alt}
        className={`w-full ${aspect} object-cover bg-ink-100 ${className}`}
      />
    );
  }

  return (
    <div className={`relative bg-ink-100 ${className}`}>
      <div
        ref={ref}
        onScroll={alDesplazar}
        className={`flex overflow-x-auto snap-x snap-mandatory scrollbar-none ${aspect}`}
        aria-label={`${alt}: carrusel de ${fuentes.length} imágenes`}
      >
        {fuentes.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={`${alt} ${i + 1} de ${fuentes.length}`}
            className="w-full h-full shrink-0 basis-full snap-center object-cover bg-ink-100"
            draggable="false"
          />
        ))}
      </div>

      {/* Flechas (siempre visibles, como Instagram) */}
      <button
        type="button"
        onClick={() => irA(Math.max(0, idx - 1))}
        disabled={idx === 0}
        aria-label="Imagen anterior"
        className="flex absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 disabled:opacity-0 transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button
        type="button"
        onClick={() => irA(Math.min(fuentes.length - 1, idx + 1))}
        disabled={idx === fuentes.length - 1}
        aria-label="Imagen siguiente"
        className="flex absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 disabled:opacity-0 transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {/* Puntos */}
      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
        {fuentes.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => irA(i)}
            aria-label={`Ir a la imagen ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
            }`}
          />
        ))}
      </div>

      {/* Contador */}
      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-semibold tabular-nums">
        {idx + 1}/{fuentes.length}
      </span>
    </div>
  );
}
