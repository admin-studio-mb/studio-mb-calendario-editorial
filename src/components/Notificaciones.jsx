// ============================================================================
//  src/components/Notificaciones.jsx
// ----------------------------------------------------------------------------
//  Campanita de notificaciones (isla React en el Layout).
//   - Poll cada 30 s y al recuperar el foco.
//   - Badge con nº de no leídas.
//   - Al hacer clic en una notificación: la marca leída y navega a su URL.
//   - Botón "Marcar todas como leídas".
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

function hace(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export default function Notificaciones() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  async function cargar() {
    try {
      const res = await fetch('/api/notificaciones', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* silencio: la campanita no debe romper la página */
    }
  }

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 30000);
    const onFocus = () => cargar();
    window.addEventListener('focus', onFocus);
    const onVisible = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Cerrar al hacer clic fuera o Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target)
        && btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function marcarLeida(n) {
    setItems((arr) => arr.filter((x) => x.id !== n.id));
    try {
      await fetch('/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      });
    } catch { /* noop */ }
    if (n.url) window.location.href = n.url;
  }

  async function marcarTodas() {
    setLoading(true);
    setItems([]);
    try {
      await fetch('/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* noop */ }
    setLoading(false);
  }

  const unread = items.length;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) cargar(); }}
        className="relative p-2 rounded-md text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition shrink-0"
        aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`}
        title="Notificaciones"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 left-4 z-50 w-80 max-h-[60vh] overflow-y-auto bg-white rounded-xl border border-ink-100 shadow-pop"
        >
          <header className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-ink-100">
            <p className="text-sm font-semibold text-ink-900">Notificaciones</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                disabled={loading}
                className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
                Marcar todas
              </button>
            )}
          </header>

          {unread === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-400">
              No tienes notificaciones pendientes.
            </p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => marcarLeida(n)}
                    className="w-full text-left px-4 py-3 hover:bg-brand-50/40 transition"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.tipo === 'comentario' ? 'bg-blue-500' : 'bg-brand-500'}`}></span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-900 truncate">{n.titulo}</p>
                        {n.cuerpo && (
                          <p className="text-[11px] text-ink-500 mt-0.5 line-clamp-2 whitespace-pre-line">{n.cuerpo}</p>
                        )}
                        <p className="text-[10px] text-ink-400 mt-1">{hace(n.fecha_creacion)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
