// ============================================================================
//  src/components/CopyButton.jsx
// ----------------------------------------------------------------------------
//  Botón pequeño "Copiar" con feedback visual. Usa navigator.clipboard y
//  cae a execCommand en navegadores antiguos o contextos sin permiso.
// ============================================================================

import { useState } from 'react';

export default function CopyButton({ text = '', label = 'Copiar', title, className = '' }) {
  const [estado, setEstado] = useState('idle'); // idle | ok | error

  async function copiar(e) {
    e.preventDefault();
    e.stopPropagation();

    const valor = String(text ?? '');
    if (!valor.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(valor);
      } else {
        const ta = document.createElement('textarea');
        ta.value = valor;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setEstado('ok');
      setTimeout(() => setEstado('idle'), 1600);
    } catch {
      setEstado('error');
      setTimeout(() => setEstado('idle'), 1600);
    }
  }

  const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition';
  const tono = estado === 'ok'
    ? 'text-emerald-700 bg-emerald-50'
    : estado === 'error'
      ? 'text-red-600 bg-red-50'
      : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100';

  return (
    <button
      type="button"
      onClick={copiar}
      title={title ?? `Copiar ${label.toLowerCase()} al portapapeles`}
      className={`${base} ${tono} ${className}`}
    >
      {estado === 'ok' ? (
        <>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copiado
        </>
      ) : estado === 'error' ? (
        'No se pudo copiar'
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
