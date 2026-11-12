// ============================================================================
//  src/lib/redes.js
// ----------------------------------------------------------------------------
//  Redes sociales soportadas en la app. Fuente única para etiquetas, colores y
//  tipos de post por red.
//
//  El modelo de datos:
//    - clientes.redes = [{ red: 'instagram', tipos: ['Post', 'Reel', ...] }, ...]
//    - publicaciones.red = 'instagram' | 'linkedin' | 'facebook'
// ============================================================================

export const REDES = [
  {
    id: 'instagram',
    nombre: 'Instagram',
    color: '#E1306C',
    tiposDefault: ['Post', 'Reel', 'Carrusel', 'Story'],
  },
  {
    id: 'linkedin',
    nombre: 'LinkedIn',
    color: '#0A66C2',
    tiposDefault: ['Post', 'Artículo', 'Vídeo'],
  },
  {
    id: 'facebook',
    nombre: 'Facebook',
    color: '#1877F2',
    tiposDefault: ['Post', 'Vídeo', 'Story'],
  },
];

export const RED_IDS = REDES.map((r) => r.id);

export function redMeta(id) {
  return REDES.find((r) => r.id === id) ?? null;
}

export function redNombre(id) {
  return redMeta(id)?.nombre ?? '';
}

/** Redes configuradas de un cliente (solo entradas válidas). */
export function redesDeCliente(cliente) {
  const raw = Array.isArray(cliente?.redes) ? cliente.redes : [];
  return raw.filter((r) => r && typeof r === 'object' && RED_IDS.includes(r.red));
}

/** Tipos de post de una red concreta para un cliente. */
export function tiposDeRed(cliente, redId) {
  const item = redesDeCliente(cliente).find((r) => r.red === redId);
  return Array.isArray(item?.tipos) ? item.tipos.filter(Boolean) : [];
}
