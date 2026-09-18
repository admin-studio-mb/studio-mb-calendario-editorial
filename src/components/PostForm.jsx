import { useState, useEffect, useMemo } from 'react';

const FORMATOS = ['Post', 'Reel', 'Carrusel', 'Story'];
const ESTADOS = ['Borrador', 'Revisión', 'Aprobado'];

/**
 * PostForm — formulario controlado para crear/editar una publicación.
 *
 * Props:
 *   - clientes: Array<{ id, nombre, tipos_contenido_disponibles: string[] }>
 *   - initial:  objeto publicación (o {} para creación).
 *   - onSubmit: (payload) => Promise<void> | void
 *   - onCancel: () => void
 *   - uploadFile(file): Promise<{ id }>  → helper opcional para subir el diseño.
 *
 * Notas de comportamiento:
 *   - `tipo_contenido` se carga dinámicamente a partir del cliente elegido.
 *   - `imagenes_fondo` se modela como JSON con array de URLs o IDs.
 *   - `diseno_final` se sube como File a Directus (campo Files).
 */
export default function PostForm({
  clientes = [],
  initial = {},
  onSubmit,
  onCancel,
  uploadFile,
}) {
  const [clienteId, setClienteId] = useState(initial.cliente_id ?? clientes[0]?.id ?? '');
  const [tipo, setTipo] = useState(initial.tipo_contenido ?? '');
  const [formato, setFormato] = useState(initial.formato ?? 'Post');
  const [copywriting, setCopywriting] = useState(initial.copywriting ?? '');
  const [hashtags, setHashtags] = useState((initial.hashtags ?? []).join(', '));
  const [textosSlides, setTextosSlides] = useState(initial.textos_slides ?? '');
  const [imagenes, setImagenes] = useState((initial.imagenes_fondo ?? []).join('\n'));
  const [fechaPub, setFechaPub] = useState(
    initial.fecha_publicacion ? initial.fecha_publicacion.slice(0, 16) : '',
  );
  const [estado, setEstado] = useState(initial.estado ?? 'Borrador');
  const [disenoFile, setDisenoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  );

  const tiposDisponibles = useMemo(
    () => (Array.isArray(cliente?.tipos_contenido_disponibles) ? cliente.tipos_contenido_disponibles : []),
    [cliente],
  );

  // Si cambia el cliente y el tipo anterior no está disponible, lo limpiamos.
  useEffect(() => {
    if (tipo && tiposDisponibles.length && !tiposDisponibles.includes(tipo)) {
      setTipo('');
    }
  }, [tiposDisponibles, tipo]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!clienteId) return setError('Selecciona un cliente.');
    if (!fechaPub) return setError('Indica una fecha de publicación.');

    let disenoFinalId = initial.diseno_final?.id ?? null;
    if (disenoFile && uploadFile) {
      try {
        const uploaded = await uploadFile(disenoFile);
        disenoFinalId = uploaded?.id ?? disenoFinalId;
      } catch (err) {
        return setError(`Subida fallida: ${err.message}`);
      }
    }

    const payload = {
      cliente_id: clienteId,
      tipo_contenido: tipo,
      formato,
      copywriting,
      hashtags: hashtags.split(',').map((t) => t.trim()).filter(Boolean),
      textos_slides: textosSlides,
      imagenes_fondo: imagenes.split('\n').map((s) => s.trim()).filter(Boolean),
      fecha_publicacion: new Date(fechaPub).toISOString(),
      estado,
      diseno_final: disenoFinalId,
    };

    try {
      setSubmitting(true);
      await onSubmit?.(payload);
    } catch (err) {
      setError(err.message ?? 'Error guardando.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
      <header>
        <h3 className="text-lg font-semibold">
          {initial.id ? 'Editar publicación' : 'Nueva publicación'}
        </h3>
        <p className="text-sm text-slate-500">Los campos se guardan al pulsar “Guardar”.</p>
      </header>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cliente */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="cliente">Cliente</label>
          <select
            id="cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded-md border-slate-300"
          >
            <option value="" disabled>— Selecciona —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Tipo de contenido (dinámico según cliente) */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tipo">Tipo de contenido</label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            disabled={!cliente}
            className="w-full rounded-md border-slate-300 disabled:bg-slate-100"
          >
            <option value="">—</option>
            {tiposDisponibles.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Formato */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="formato">Formato</label>
          <select
            id="formato"
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            className="w-full rounded-md border-slate-300"
          >
            {FORMATOS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="estado">Estado</label>
          <select
            id="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-md border-slate-300"
          >
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Fecha */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1" htmlFor="fecha">Fecha de publicación</label>
          <input
            id="fecha"
            type="datetime-local"
            value={fechaPub}
            onChange={(e) => setFechaPub(e.target.value)}
            className="w-full rounded-md border-slate-300"
          />
        </div>
      </div>

      {/* Copywriting */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="copy">Copywriting</label>
        <textarea
          id="copy"
          rows={4}
          value={copywriting}
          onChange={(e) => setCopywriting(e.target.value)}
          className="w-full rounded-md border-slate-300"
          placeholder="Texto principal del post…"
        />
      </div>

      {/* Hashtags */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="hash">Hashtags</label>
        <input
          id="hash"
          type="text"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          placeholder="Separados por comas: #branding, #estudio"
          className="w-full rounded-md border-slate-300"
        />
      </div>

      {/* Textos slides */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="slides">Textos por slide</label>
        <textarea
          id="slides"
          rows={3}
          value={textosSlides}
          onChange={(e) => setTextosSlides(e.target.value)}
          placeholder="Slide 1: …&#10;Slide 2: …"
          className="w-full rounded-md border-slate-300"
        />
      </div>

      {/* Imágenes fondo */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="imgs">Imágenes de fondo (URLs)</label>
        <textarea
          id="imgs"
          rows={3}
          value={imagenes}
          onChange={(e) => setImagenes(e.target.value)}
          placeholder="https://…&#10;https://…"
          className="w-full rounded-md border-slate-300"
        />
        <p className="text-xs text-slate-500 mt-1">Una URL por línea. Alternativa: se puede migrar a Files M2M en Directus.</p>
      </div>

      {/* Diseño final */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="diseno">Diseño final</label>
        <input
          id="diseno"
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setDisenoFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-brand-700"
        />
        {initial.diseno_final?.id && (
          <p className="text-xs text-slate-500 mt-1">Archivo actual: {initial.diseno_final.id}</p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md text-slate-700 hover:bg-slate-100">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
