// ============================================================================
//  /api/comentarios/[id]
//  PATCH  { texto }         → edita el texto del comentario (sólo el autor).
//  DELETE                   → elimina el comentario (sólo el autor).
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';

export const prerender = false;

async function loadComentario(token, id) {
  const r = await directusFetch({
    path: `/items/comentarios/${id}`,
    token,
  });
  if (!r.ok) return { ok: false, status: r.status, raw: r.raw, item: null };
  return { ok: true, status: 200, raw: r.raw, item: r.data };
}

export async function PATCH({ params, request, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const id = params?.id;
  if (!id) return json({ error: 'id requerido.' }, 400);

  // Comprobamos autoría antes de modificar.
  const cur = await loadComentario(token, id);
  if (!cur.ok) return json({ error: 'Comentario no encontrado.', detail: cur.raw }, 404);

  const userId = locals.user?.id ?? null;
  // usuario_id puede venir como string o como objeto {id} en distintas versiones de Directus.
  const ownerId = typeof cur.item?.usuario_id === 'object'
    ? cur.item?.usuario_id?.id
    : cur.item?.usuario_id;
  if (!userId || ownerId !== userId) {
    return json({ error: 'Sólo el autor puede editar este comentario.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }
  const texto = String(body?.texto ?? '').trim();
  if (!texto) return json({ error: 'texto obligatorio.' }, 400);

  const r = await directusFetch({
    path: `/items/comentarios/${id}`,
    method: 'PATCH',
    token,
    body: { texto },
  });
  if (!r.ok) {
    console.error('[api/comentarios PATCH]', r.status, r.raw);
    return json({ error: 'No se pudo editar el comentario.', detail: r.raw }, r.status);
  }
  return json(r.data, 200);
}

export async function DELETE({ params, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const id = params?.id;
  if (!id) return json({ error: 'id requerido.' }, 400);

  const cur = await loadComentario(token, id);
  if (!cur.ok) return json({ error: 'Comentario no encontrado.' }, 404);

  const userId = locals.user?.id ?? null;
  const ownerId = typeof cur.item?.usuario_id === 'object'
    ? cur.item?.usuario_id?.id
    : cur.item?.usuario_id;
  if (!userId || ownerId !== userId) {
    return json({ error: 'Sólo el autor puede eliminar este comentario.' }, 403);
  }

  const r = await directusFetch({
    path: `/items/comentarios/${id}`,
    method: 'DELETE',
    token,
  });
  if (!r.ok) {
    console.error('[api/comentarios DELETE]', r.status, r.raw);
    return json({ error: 'No se pudo eliminar el comentario.', detail: r.raw }, r.status);
  }
  return new Response(null, { status: 204 });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
