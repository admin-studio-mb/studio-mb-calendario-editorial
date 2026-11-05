// ============================================================================
//  src/lib/csv.js
// ----------------------------------------------------------------------------
//  Helper para generar un CSV a partir de un array de publicaciones.
//  Escapado correcto de comas, comillas y saltos de línea (RFC 4180).
// ============================================================================

const ESTADO_LABEL = { borrador: 'Borrador', revision: 'Revisión', aprobado: 'Aprobado' };
const FORMATO_LABEL = { post: 'Post', reel: 'Reel', carrusel: 'Carrusel', story: 'Story' };

export function escape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convierte publicaciones a filas CSV.
 * @param {Array<object>} publicaciones
 * @param {Map<string,string>} [clienteNombre]  id → nombre
 * @returns {string} contenido CSV con cabecera
 */
export function publicacionesToCsv(publicaciones, clienteNombre = new Map()) {
  const headers = ['Fecha', 'Hora', 'Cliente', 'Tipo', 'Formato', 'Estado', 'Copywriting', 'Hashtags', 'Textos slides'];
  const rows = publicaciones.map((p) => {
    let fecha = '', hora = '';
    if (p.fecha_publicacion) {
      const d = new Date(p.fecha_publicacion);
      if (!isNaN(d)) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        fecha = `${yyyy}-${mm}-${dd}`;
        hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
    }
    const cliente = clienteNombre.get(p.cliente_id) ?? p.cliente_id ?? '';
    const hashtags = (p.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return [
      fecha,
      hora,
      cliente,
      p.tipo_contenido ?? '',
      FORMATO_LABEL[p.formato] ?? p.formato ?? '',
      ESTADO_LABEL[p.estado] ?? p.estado ?? '',
      p.copywriting ?? '',
      hashtags,
      p.textos_slides ?? '',
    ].map(escape).join(',');
  });
  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Dispara la descarga de un string CSV en el navegador.
 * @param {string} csv
 * @param {string} filename  p.ej. "publicaciones-2026-09.csv"
 */
export function downloadCsv(csv, filename) {
  // BOM UTF-8 para que Excel lea bien acentos.
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberamos el objeto URL tras un pequeño delay para asegurar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
