// ============================================================================
//  /api/efemerides/:id
//  PATCH  → edita (solo Administrator)
//  DELETE → borra (solo Administrator)
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../../lib/cache.js';
import { esAdmin } from '../../../lib/roles.js';
import { validarEfemeride } from '../efemerides.js';

export const prerender = false;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PATCH({ params, request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede editar efemérides.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id.' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const { data, error } = validarEfemeride(body);
  if (error) return json({ error }, 400);

  const r = await directusFetch({
    path: `/items/efemerides/${id}`,
    method: 'PATCH',
    token,
    body: data,
  });
  if (!r.ok) {
    console.error('[api/efemerides PATCH]', r.status, r.raw);
    return json({ error: 'No se pudo guardar.' }, r.status);
  }
  await clearDirectusCache(token);
  return json(r.data);
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede borrar efemérides.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id.' }, 400);

  const r = await directusFetch({ path: `/items/efemerides/${id}`, method: 'DELETE', token });
  if (!r.ok && r.status !== 204) {
    console.error('[api/efemerides DELETE]', r.status, r.raw);
    return json({ error: 'No se pudo borrar.' }, r.status);
  }
  await clearDirectusCache(token);
  return json({ ok: true });
}
