// ============================================================================
//  PATCH /api/perfil — foto de perfil del usuario autenticado.
//  Body: { avatar: <uuid de directus_files> | null }
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PATCH({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  if (body?.avatar === undefined) {
    return json({ error: 'Falta el avatar.' }, 400);
  }
  if (body.avatar !== null && !UUID_RE.test(String(body.avatar))) {
    return json({ error: 'avatar debe ser un id de archivo o null.' }, 400);
  }

  const r = await directusFetch({
    path: '/users/me',
    method: 'PATCH',
    token,
    body: { avatar: body.avatar },
  });

  if (!r.ok) {
    console.error('[api/perfil PATCH]', r.status, r.raw);
    return json({ error: 'No se pudo guardar la foto de perfil.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);
  return json({ avatar: r.data?.avatar ?? null });
}
