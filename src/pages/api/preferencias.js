// ============================================================================
//  src/pages/api/preferencias.js
// ----------------------------------------------------------------------------
//  GET   /api/preferencias  → preferencias normalizadas del usuario.
//  PATCH /api/preferencias  → merge parcial; solo claves whitelist booleanas.
//
//  Guarda en `directus_users.preferencias` (JSON) con el JWT del usuario:
//  las policies permiten update del propio usuario (campo `preferencias`).
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';
import { normalizarPrefs, PREFS_VALIDAS } from '../../lib/prefs.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ locals }) {
  if (!locals?.token || !locals?.user?.id) return json({ error: 'Unauthorized' }, 401);
  return json(normalizarPrefs(locals.user.preferencias));
}

export async function PATCH({ request, locals }) {
  const token = locals?.token ?? null;
  const user = locals?.user ?? null;
  if (!token || !user?.id) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const patch = {};
  for (const key of PREFS_VALIDAS) {
    if (typeof body?.[key] === 'boolean') patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: `Nada que actualizar. Claves: ${PREFS_VALIDAS.join(', ')}` }, 400);
  }

  const merged = { ...normalizarPrefs(user.preferencias), ...patch };

  const r = await directusFetch({
    path: `/users/${user.id}`,
    method: 'PATCH',
    token,
    body: { preferencias: merged },
  });
  if (!r.ok) {
    console.error('[api/preferencias PATCH]', r.status, r.raw);
    return json({ error: 'No se pudieron guardar las preferencias.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);
  return json(merged);
}
