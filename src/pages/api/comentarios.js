// ============================================================================
//  /api/comentarios
//  GET  ?publicacion_id=...   → lista los comentarios de una publicación.
//  POST { publicacion_id, texto } → crea un comentario (usuario_id del JWT).
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';

export const prerender = false;

export async function GET({ url, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const publicacionId = url.searchParams.get('publicacion_id');
  if (!publicacionId) return json({ error: 'publicacion_id requerido.' }, 400);

  const filter = JSON.stringify({ publicacion_id: { _eq: publicacionId } });
  const r = await directusFetch({
    path: '/items/comentarios',
    token,
    search: { filter, sort: 'fecha_creacion', limit: 200 },
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

  const r = await directusFetch({
    path: '/items/comentarios',
    method: 'POST',
    token,
    body: {
      publicacion_id: publicacionId,
      usuario_id: userId,
      texto,
    },
  });

  if (!r.ok) {
    console.error('[api/comentarios POST]', r.status, r.raw);
    return json({ error: 'No se pudo guardar el comentario.', detail: r.raw }, r.status);
  }

  return json(r.data, 201);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
