// ============================================================================
//  /api/comentarios
//  GET  ?publicacion_id=...   → lista los comentarios de una publicación.
//  POST { publicacion_id, texto } → crea un comentario (usuario_id del JWT).
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';

export const prerender = false;

export async function GET({ url, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const publicacionId = url.searchParams.get('publicacion_id');
  if (!publicacionId) return json({ error: 'publicacion_id requerido.' }, 400);

  // El hilo se relee al abrir un post y tras cada comentario. Como Directus
  // cachea los GET en Redis y no invalida al escribir, hay que limpiar la
  // caché ANTES de leer para que el hilo refleje el estado real.
  // (Los parámetros tipo ?t= NO sirven: Directus ignora los parámetros
  // extra al calcular la clave de caché. Ver AGENTS.md §6.7.)
  await clearDirectusCache(token);

  const filter = JSON.stringify({ publicacion_id: { _eq: publicacionId } });
  const r = await directusFetch({
    path: '/items/comentarios',
    token,
    search: {
      filter,
      sort: 'fecha_creacion',
      limit: 200,
      fields: 'id,publicacion_id,cliente_id,texto,fecha_creacion,usuario_id.id,usuario_id.first_name,usuario_id.last_name,usuario_id.email',
    },
  });

  if (!r.ok) {
    console.error('[api/comentarios GET]', r.status, r.raw);
    return json({ error: 'No se pudieron listar los comentarios.', detail: r.raw }, r.status);
  }

  return json(r.data ?? [], 200);
}

export async function POST({ request, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const publicacionId = body?.publicacion_id;
  const texto = String(body?.texto ?? '').trim();
  if (!publicacionId) return json({ error: 'publicacion_id obligatorio.' }, 400);
  if (!texto) return json({ error: 'texto obligatorio.' }, 400);

  // El user id del JWT se inyecta desde locals.user (lo rellena el middleware).
  const userId = locals.user?.id ?? null;
  if (!userId) return json({ error: 'No se pudo identificar al usuario.' }, 401);

  // Para los permisos por cliente (Directus 12), el comentario lleva el
  // `cliente_id` desnormalizado: heredado de la publicación, nunca del
  // cliente (así un usuario de cliente no puede atribuir sus comentarios a
  // otra cuenta ni colarse en el hilo de otro cliente).
  const pub = await directusFetch({
    path: `/items/publicaciones/${publicacionId}`,
    method: 'GET',
    token,
    search: { fields: 'id,cliente_id' },
  });
  if (!pub.ok || !pub.data?.id) {
    console.error('[api/comentarios POST] publicación no encontrada', publicacionId, pub.status, pub.raw);
    return json({ error: 'La publicación no existe.' }, 404);
  }

  const clienteId = pub.data.cliente_id ?? null;

  const r = await directusFetch({
    path: '/items/comentarios',
    method: 'POST',
    token,
    body: {
      publicacion_id: publicacionId,
      cliente_id: clienteId,
      usuario_id: userId,
      texto,
    },
  });

  if (!r.ok) {
    console.error('[api/comentarios POST]', r.status, r.raw);
    return json({ error: 'No se pudo guardar el comentario.', detail: r.raw }, r.status);
  }

  // Directus 12 NO invalida la caché al crear items: sin esto, el hilo que
  // se acaba de abrir seguiría mostrando la lista anterior.
  await clearDirectusCache(token);

  return json(r.data, 201);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
