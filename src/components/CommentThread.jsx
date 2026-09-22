import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * CommentThread — hilo de comentarios de una publicación.
 *
 * Props:
 *   - publicacionId: string
 *   - initial: Array<{ id, texto, fecha_creacion, usuario_id: { first_name, last_name } }>
 *   - onCreate: (texto) => Promise<void>     → POST a /api/comentarios
 *   - currentUser: { id, first_name, last_name }
 *
 * El backend (no incluido aquí) debe:
 *   - Listar GET  /api/comentarios?publicacion_id=…
 *   - Crear  POST /api/comentarios { publicacion_id, texto }
 */
export default function CommentThread({ publicacionId, initial = [], onCreate, currentUser, apiBase = '' }) {
  const [items, setItems] = useState(initial);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      if (apiBase) {
        const res = await fetch(`${apiBase}/api/comentarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicacion_id: publicacionId, texto: texto.trim() }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Comentar falló (${res.status}): ${text || res.statusText}`);
        }
        const created = await res.json().catch(() => null);
        // Optimista: mostramos lo que volvió el server (con id real).
        setItems((arr) => [
          ...arr,
          {
            id: created?.id ?? `tmp-${Date.now()}`,
            texto: texto.trim(),
            fecha_creacion: created?.fecha_creacion ?? new Date().toISOString(),
            usuario_id: currentUser
              ? { first_name: currentUser.first_name, last_name: currentUser.last_name }
              : null,
          },
        ]);
        setTexto('');
        return;
      }

      await onCreate?.(texto.trim());
      setItems((arr) => [
        ...arr,
        {
          id: `tmp-${Date.now()}`,
          texto: texto.trim(),
          fecha_creacion: new Date().toISOString(),
          usuario_id: currentUser
            ? { first_name: currentUser.first_name, last_name: currentUser.last_name }
            : null,
        },
      ]);
      setTexto('');
    } catch (err) {
      console.error('[CommentThread]', err);
      alert(err.message ?? 'Error enviando comentario.');
    } finally {
      setEnviando(false);
    }
  }

  function initials(autor) {
    if (!autor) return '?';
    const parts = autor.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || autor[0].toUpperCase();
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <h4 className="text-base font-semibold text-ink-900">Comentarios</h4>
          <p className="text-xs text-ink-500 mt-0.5">{items.length} mensajes</p>
        </div>
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
      </header>

      <ul className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
        {items.map((c) => {
          const autor = c.usuario_id
            ? `${c.usuario_id.first_name ?? ''} ${c.usuario_id.last_name ?? ''}`.trim() || 'Anónimo'
            : 'Anónimo';
          return (
            <li key={c.id} className="px-5 py-3.5 flex gap-3 hover:bg-ink-50/50 transition">
              <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-[11px] font-semibold flex items-center justify-center">
                {initials(autor)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink-800 truncate">{autor}</span>
                  <time dateTime={c.fecha_creacion} className="text-[11px] text-ink-400 shrink-0">
                    {c.fecha_creacion
                      ? formatDistanceToNow(parseISO(c.fecha_creacion), {
                          addSuffix: true,
                          locale: es,
                        })
                      : ''}
                  </time>
                </div>
                <p className="mt-0.5 text-sm text-ink-700 whitespace-pre-line leading-relaxed">{c.texto}</p>
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-ink-400">
            Sé el primero en comentar.
          </li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/50">
        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-[11px] font-semibold flex items-center justify-center">
          {initials(currentUser ? `${currentUser.first_name ?? ''} ${currentUser.last_name ?? ''}` : '')}
        </div>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un comentario…"
          className="flex-1 px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {enviando ? '…' : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Enviar
            </>
          )}
        </button>
      </form>
    </section>
  );
}
