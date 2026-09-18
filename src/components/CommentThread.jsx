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
export default function CommentThread({ publicacionId, initial = [], onCreate, currentUser }) {
  const [items, setItems] = useState(initial);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await onCreate?.(texto.trim());
      // Optimista: añadimos al final para feedback inmediato.
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
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <header className="px-4 py-3 border-b border-slate-200">
        <h4 className="text-sm font-semibold">Comentarios</h4>
        <p className="text-xs text-slate-500">{items.length} mensajes</p>
      </header>

      <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {items.map((c) => {
          const autor = c.usuario_id
            ? `${c.usuario_id.first_name ?? ''} ${c.usuario_id.last_name ?? ''}`.trim() || 'Anónimo'
            : 'Anónimo';
          return (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">{autor}</span>
                <time dateTime={c.fecha_creacion}>
                  {c.fecha_creacion
                    ? formatDistanceToNow(parseISO(c.fecha_creacion), {
                        addSuffix: true,
                        locale: es,
                      })
                    : ''}
                </time>
              </div>
              <p className="mt-1 text-sm whitespace-pre-line">{c.texto}</p>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            Sé el primero en comentar.
          </li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 flex items-center gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Comentar en ${publicacionId.slice(0, 8)}…`}
          className="flex-1 rounded-md border-slate-300 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50 hover:bg-brand-700"
        >
          {enviando ? '…' : 'Enviar'}
        </button>
      </form>
    </section>
  );
}
