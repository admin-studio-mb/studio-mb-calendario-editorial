// ============================================================================
//  GET /api/actividad?publicacion_id=<uuid>
// ----------------------------------------------------------------------------
//  Devuelve el historial de una publicación (máx. 50 eventos, recientes
//  primero). Se lee con el JWT del usuario: las policies limitan al cliente
//  a la actividad de SUS publicaciones.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';

export const prerender = false;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const publicacionId = new URL(request.url).searchParams.get('publicacion_id');
  if (!publicacionId) return json({ error: 'Falta publicacion_id.' }, 400);

  const r = await directusFetch({
    path: '/items/actividad',
    method: 'GET',
    token,
    search: {
      'filter[publicacion_id][_eq]': publicacionId,
      fields: 'id,tipo,detalle,estado_anterior,estado_nuevo,motivo,fecha_creacion,usuario.id,usuario.first_name,usuario.last_name,usuario.email',
      sort: '-fecha_creacion',
      limit: '50',
    },
  });

  if (!r.ok) {
    console.error('[api/actividad GET]', r.status, r.raw);
    return json({ error: 'No se pudo cargar el historial.', detail: r.raw }, r.status);
  }

  return json(r.data ?? []);
}
