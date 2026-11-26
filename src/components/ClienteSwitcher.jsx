// ============================================================================
//  src/components/ClienteSwitcher.jsx
// ----------------------------------------------------------------------------
//  Selector de "cliente activo" para el equipo. Vive encima de Calendario en
//  el sidebar. Al elegir, guarda una cookie y recarga: el SSR filtra el
//  calendario y pendientes para ese cliente.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { fijarClienteActivo } from '../lib/alcance.js';

function Logo({ cliente, size = 'w-6 h-6' }) {
  if (cliente?.logo) {
    return (
      <img
        src={`/api/assets/${cliente.logo}?width=48&height=48&fit=contain`}
        alt=""
        className={`${size} shrink-0 rounded object-contain bg-white border border-ink-100`}
      />
    );
  }
  return (
    <span className={`${size} shrink-0 rounded bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center`} aria-hidden="true">
      {(cliente?.nombre ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function ClienteSwitcher({ clientes = [], activo = null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const actual = clientes.find((c) => c.id === activo) ?? null;

  useEffect(() => {
    function fuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function escape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  function elegir(id) {
    setOpen(false);
    fijarClienteActivo(id);
    window.location.reload();
  }

  return (
    <div className="relative cliente-switcher" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={actual ? `Viendo: ${actual.nombre}` : 'Viendo todas las cuentas'}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-ink-100 bg-ink-50/70 hover:bg-ink-100 transition text-left"
      >
        {actual ? <Logo cliente={actual} /> : (
          <span className="w-6 h-6 shrink-0 rounded bg-ink-200 text-ink-600 text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
            *
          </span>
        )}
        <span className="sidebar-text flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-wider text-ink-400 leading-tight">Cuenta activa</span>
          <span className="block text-sm font-medium text-ink-900 truncate leading-tight">
            {actual ? actual.nombre : 'Todas las cuentas'}
          </span>
        </span>
        <svg className="sidebar-text w-3.5 h-3.5 shrink-0 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Cuenta activa"
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl bg-white border border-ink-100 shadow-pop p-1 max-h-80 overflow-auto"
        >
          <button
            type="button"
            role="option"
            aria-selected={!actual}
            onClick={() => elegir(null)}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition ${
              actual ? 'text-ink-700 hover:bg-ink-50' : 'bg-brand-50 text-brand-700 font-medium'
            }`}
          >
            <span className="w-6 h-6 shrink-0 rounded bg-ink-200 text-ink-600 text-[10px] font-bold flex items-center justify-center" aria-hidden="true">*</span>
            <span className="flex-1 truncate">Todas las cuentas</span>
          </button>

          {clientes.map((c) => {
            const seleccionado = c.id === actual?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={seleccionado}
                onClick={() => elegir(c.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition ${
                  seleccionado ? 'bg-brand-50 text-brand-700 font-medium' : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                <Logo cliente={c} />
                <span className="flex-1 truncate">{c.nombre}</span>
                {seleccionado && (
                  <svg className="w-4 h-4 shrink-0 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
