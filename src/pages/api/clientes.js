// ============================================================================
//  src/pages/api/clientes.js
// ----------------------------------------------------------------------------
//  POST /api/clientes — crea un cliente.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  // Validación
  if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim().length === 0) {
    return json({ error: 'El nombre es obligatorio.' }, 400);
  }
  if (body.nombre.length > 100) {
    return json({ error: 'El nombre no puede superar los 100 caracteres.' }, 400);
  }

  // tipos_contenido_disponibles debe ser array de strings no vacío.
  let tipos = body.tipos_contenido_disponibles;
  if (!Array.isArray(tipos)) tipos = [];
  tipos = tipos.map((t) => String(t).trim()).filter(Boolean);
  if (tipos.length === 0) {
    return json({ error: 'Define al menos un tipo de contenido.' }, 400);
  }

  const payload = {
    nombre: body.nombre.trim(),
    tipos_contenido_disponibles: tipos,
  };
  if (body.logo) payload.logo = body.logo;

  const r = await directusFetch({
    path: '/items/clientes',
    method: 'POST',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/clientes POST]', r.status, r.raw);
    return json({ error: 'No se pudo crear el cliente.', detail: r.raw }, r.status);
  }

  // Invalidar cache.
  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/clientes POST] cache clear falló:', e?.message);
  }

  return json(r.data, 201);
}
