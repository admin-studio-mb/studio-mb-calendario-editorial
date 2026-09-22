// ============================================================================
//  src/components/TimePicker.jsx
// ----------------------------------------------------------------------------
//  Selector de hora en formato 24h garantizado. Trigger = campo con "HH:MM",
//  popover = grids visuales para elegir hora y minuto (click). Sólo se
//  cierra cuando se eligen AMBAS partes (o se hace click fuera / Listo).
//
//  Props:
//    - value: string 'HH:mm' | ''
//    - onChange: (value: string) => void  → 'HH:mm' o '' si se limpia
//    - minuteStep: 5 | 10 | 15 | 30         → granularidad
//    - disabled: boolean
// ============================================================================

import { useState, useRef, useEffect } from 'react';

export default function TimePicker({ value = '', onChange, minuteStep = 5, disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Estado interno del picker: cada parte se rellena por separado.
  const [hh, setHh] = useState(value ? value.split(':')[0] : '');
  const [mm, setMm] = useState(value ? value.split(':')[1] : '');

  // Sincronizamos con el value externo cuando cambia desde fuera.
  useEffect(() => {
    if (value) {
      const [vHh, vMm] = value.split(':');
      setHh(vHh ?? '');
      setMm(vMm ?? '');
    } else {
      setHh('');
      setMm('');
    }
  }, [value]);

  // Cierra el popover al hacer click fuera del wrapper.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const minutes = [];
  for (let m = 0; m < 60; m += minuteStep) {
    minutes.push(String(m).padStart(2, '0'));
  }
  if (mm && !minutes.includes(mm)) {
    minutes.push(mm);
    minutes.sort();
  }

  function pickHour(h) {
    setHh(h);
    if (mm) {
      // Ya hay minuto → completa y cierra.
      onChange?.(`${h}:${mm}`);
      setTimeout(() => setOpen(false), 120);
    }
    // Si no hay minuto, sólo marcamos y esperamos al click en minuto.
  }

  function pickMinute(m) {
    setMm(m);
    if (hh) {
      // Ya hay hora → completa y cierra.
      onChange?.(`${hh}:${m}`);
      setTimeout(() => setOpen(false), 120);
    }
    // Si no hay hora, sólo marcamos y esperamos.
  }

  function clear() {
    setHh('');
    setMm('');
    onChange?.('');
    setOpen(false);
  }

  const displayText = (hh && mm) ? `${hh}:${mm}` : '';

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <div className="flex items-stretch rounded-lg border border-ink-200 bg-white overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition hover:border-ink-300">
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className={[
            'flex-1 px-3 py-2 text-sm text-left flex items-center gap-2',
            disabled ? 'bg-ink-50 text-ink-400 cursor-not-allowed' : '',
            !value && 'text-ink-400',
          ].join(' ')}
        >
          <svg className="w-4 h-4 text-ink-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          {value ? (
            <span className="tabular-nums font-medium text-ink-800">{hh}<span className="text-ink-400">:</span>{mm}</span>
          ) : (
            <span>Selecciona hora</span>
          )}
        </button>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="px-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 border-l border-ink-100"
            title="Limpiar"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Popover con grids */}
      {open && (
        <div
          className="absolute z-30 mt-2 right-0 w-[320px] max-w-[calc(100vw-1rem)] rounded-xl bg-white border border-ink-200 shadow-pop p-4"
          style={{ animation: 'fadeIn 120ms ease-out' }}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>

          {/* Hora */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Hora</span>
              <span className="text-[11px] text-ink-400 tabular-nums">24h</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => {
                const active = h === hh;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => pickHour(h)}
                    className={[
                      'h-9 rounded-lg text-sm font-semibold tabular-nums transition',
                      active
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-ink-50 text-ink-700 hover:bg-brand-50 hover:text-brand-700',
                    ].join(' ')}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minutos */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Minutos</span>
              <span className="text-[11px] text-ink-400 tabular-nums">{minuteStep} min</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {minutes.map((m) => {
                const active = m === mm;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickMinute(m)}
                    className={[
                      'h-9 rounded-lg text-sm font-semibold tabular-nums transition',
                      active
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-ink-50 text-ink-700 hover:bg-brand-50 hover:text-brand-700',
                    ].join(' ')}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-ink-100">
            <button
              type="button"
              onClick={clear}
              className="text-xs font-medium text-ink-500 hover:text-red-600 transition"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
