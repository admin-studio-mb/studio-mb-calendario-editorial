// ============================================================================
//  src/pages/api/notificaciones.js
// ----------------------------------------------------------------------------
//  GET  /api/notificaciones        → notificaciones NO leídas del usuario.
//  POST /api/notificaciones        → marcar leída: { id } o { all: true }.
//
//  Usa el JWT del usuario: la policy solo le permite ver/actualizar las suyas.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ locals }) {
  const token = locals?.token ?? null;
  const user = locals?.user ?? null;
  if (!token || !user?.id) return json({ error: 'Unauthorized' }, 401);

  const r = await directusFetch({
    path: '/items/notificaciones',
    method: 'GET',
    token,
    search: {
      'filter[usuario][_eq]': user.id,
      'filter[leida][_eq]': 'false',
      sort: '-fecha_creacion',
      limit: '30',
      fields: 'id,tipo,titulo,cuerpo,url,leida,fecha_creacion,publicacion_id',
    },
  });

  if (!r.ok) {
    console.error('[api/notificaciones GET]', r.status, r.raw);
    return json({ error: 'No se pudieron cargar las notificaciones.', detail: r.raw }, r.status);
  }

  const items = Array.isArray(r.data) ? r.data : [];
  return json({ items, unread: items.length });
}

export async function POST({ request, locals }) {
  const token = locals?.token ?? null;
  const user = locals?.user ?? null;
  if (!token || !user?.id) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  if (body.all === true) {
    // Directus 12 exige en bulk update { data, query } (o keys). El filtro
    // por usuario lo aplica además la policy (usuario = $CURRENT_USER).
    const r = await directusFetch({
      path: '/items/notificaciones',
      method: 'PATCH',
      token,
      body: {
        data: { leida: true },
        query: { filter: { usuario: { _eq: user.id }, leida: { _eq: false } } },
      },
    });
    if (!r.ok) {
      console.error('[api/notificaciones POST all]', r.status, r.raw);
      return json({ error: 'No se pudieron marcar como leídas.', detail: r.raw }, r.status);
    }
    // §6.7: Directus no invalida su caché al escribir.
    await clearDirectusCache(token);
    return json({ ok: true });
  }

  const id = String(body.id ?? '');
  if (!id) return json({ error: 'Falta el id (o all:true).' }, 400);

  const r = await directusFetch({
    path: `/items/notificaciones/${id}`,
    method: 'PATCH',
    token,
    body: { leida: true },
  });
  if (!r.ok) {
    console.error('[api/notificaciones POST id]', r.status, r.raw);
    return json({ error: 'No se pudo marcar como leída.', detail: r.raw }, r.status);
  }
  // §6.7: Directus no invalida su caché al escribir.
  await clearDirectusCache(token);
  return json({ ok: true });
}
