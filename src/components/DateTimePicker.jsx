// ============================================================================
//  src/components/DateTimePicker.jsx
// ----------------------------------------------------------------------------
//  Selector de fecha + hora. Fecha con `react-day-picker` (headless,
//  estilable con Tailwind) en un popover, y hora con un input nativo en
//  formato 24h.
//
//  Props:
//    - value:      Date | null | undefined
//    - onChange:   (date: Date | null) => void
//    - placeholder: texto del input cuando no hay valor.
//    - disabled:   boolean
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { es } from 'date-fns/locale';
import { format, isValid } from 'date-fns';
import TimePicker from './TimePicker.jsx';

export default function DateTimePicker({ value, onChange, placeholder = 'Selecciona fecha y hora', disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Cierra el popover al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function handleSelect(day) {
    if (!day) {
      onChange(null);
      return;
    }
    // Conservamos la hora que ya estaba, o 09:00 por defecto.
    const prev = value && isValid(value) ? value : null;
    const next = new Date(day);
    if (prev) {
      next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    } else {
      next.setHours(9, 0, 0, 0);
    }
    onChange(next);
  }

  function handleTime(v) {
    // v = 'HH:mm' o '' cuando se limpia.
    if (!v) {
      // Si limpian la hora, mantenemos la fecha pero a 00:00.
      if (value && isValid(value)) {
        const next = new Date(value);
        next.setHours(0, 0, 0, 0);
        onChange(next);
      }
      return;
    }
    const base = value && isValid(value) ? new Date(value) : new Date();
    const [h, m] = v.split(':').map(Number);
    base.setHours(h, m, 0, 0);
    onChange(base);
  }

  const selectedDay = value && isValid(value) ? value : undefined;
  const timeStr = value && isValid(value) ? format(value, 'HH:mm') : '';
  const displayText = value && isValid(value)
    ? format(value, "EEEE d 'de' MMMM, HH:mm", { locale: es })
    : '';

  return (
    <div ref={wrapRef} className="relative">
      {/* Input "trigger" que abre el popover */}
      <button
        ref={inputRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={[
          'w-full px-3 py-2 rounded-lg border bg-white text-sm text-left',
          'border-ink-200 text-ink-800 placeholder:text-ink-300',
          'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition',
          disabled ? 'bg-ink-50 text-ink-400 cursor-not-allowed' : 'hover:border-ink-300',
          !value && 'text-ink-400',
        ].join(' ')}
      >
        <span className="inline-flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          {value && isValid(value) ? (
            <span className="capitalize">{displayText}</span>
          ) : (
            <span>{placeholder}</span>
          )}
        </span>
      </button>

      {/* Botón X para limpiar */}
      {value && isValid(value) && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100"
          title="Limpiar"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      )}

      {/* Popover */}
      {open && (
        <div
          className="absolute z-30 mt-2 left-0 right-0 sm:left-auto sm:right-auto sm:w-[340px] rounded-xl bg-white border border-ink-200 shadow-pop p-4 animate-in fade-in"
          style={{ animation: 'fadeIn 120ms ease-out' }}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
            .rdp { --rdp-cell-size: 36px; --rdp-accent-color: var(--color-brand-600); --rdp-background-color: var(--color-brand-50); --rdp-accent-color-dark: var(--color-brand-700); --rdp-background-color-dark: var(--color-brand-100); margin: 0; }
            .rdp-months { justify-content: center; }
            .rdp-month { width: 100%; }
            .rdp-caption_label { font-weight: 600; text-transform: capitalize; color: var(--color-ink-900); font-size: 0.95rem; }
            .rdp-nav_button { color: var(--color-ink-500); border-radius: 0.5rem; }
            .rdp-nav_button:hover:not([disabled]) { background: var(--color-ink-100); color: var(--color-ink-900); }
            .rdp-head_cell { color: var(--color-ink-400); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
            .rdp-day { border-radius: 0.5rem; color: var(--color-ink-700); font-weight: 500; }
            .rdp-day:hover:not([disabled]):not(.rdp-day_selected) { background: var(--color-brand-50); color: var(--color-brand-700); }
            .rdp-day_today { color: var(--color-brand-600); font-weight: 700; }
            .rdp-day_selected { background: var(--color-brand-600) !important; color: white !important; font-weight: 600; }
            .rdp-day_outside { color: var(--color-ink-300); }
            .rdp-day_disabled { color: var(--color-ink-300); }
          `}</style>

          <DayPicker
            mode="single"
            selected={selectedDay}
            onSelect={handleSelect}
            locale={es}
            weekStartsOn={1}
            showOutsideDays
          />

          {/* Separador */}
          <div className="border-t border-ink-100 mt-3 pt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
              Hora (24h)
            </label>
            <TimePicker value={timeStr} onChange={handleTime} minuteStep={5} />
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
