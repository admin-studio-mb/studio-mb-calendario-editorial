// ============================================================================
//  GET /api/equipo
//  Lista los usuarios del equipo (Administrator / Editor) para asignarlos
//  como responsables de publicaciones. Cualquier usuario autenticado del
//  equipo puede leerla; el rol Cliente no.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { esCliente } from '../../lib/flujo.js';

export const prerender = false;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (esCliente(locals?.user)) return json({ error: 'No autorizado.' }, 403);

  const r = await directusFetch({
    path: '/users',
    token,
    search: {
      'filter[status][_eq]': 'active',
      'filter[role][name][_in]': 'Administrator,Editor',
      fields: 'id,first_name,last_name,email',
      sort: 'first_name',
      limit: '-1',
    },
  });

  if (!r.ok) {
    console.error('[api/equipo GET]', r.status, r.raw);
    return json({ error: 'No se pudo cargar el equipo.' }, r.status);
  }

  return json(Array.isArray(r.data) ? r.data : []);
}
