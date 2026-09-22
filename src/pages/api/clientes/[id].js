// ============================================================================
//  src/pages/api/clientes/[id].js
// ----------------------------------------------------------------------------
//  PATCH  /api/clientes/:id  → actualiza un cliente.
//  DELETE /api/clientes/:id  → elimina (sólo si no tiene publicaciones).
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PATCH({ params, request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id del cliente.' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const payload = {};

  if (body.nombre !== undefined) {
    if (typeof body.nombre !== 'string' || body.nombre.trim().length === 0) {
      return json({ error: 'El nombre es obligatorio.' }, 400);
    }
    if (body.nombre.length > 100) {
      return json({ error: 'El nombre no puede superar los 100 caracteres.' }, 400);
    }
    payload.nombre = body.nombre.trim();
  }

  if (body.tipos_contenido_disponibles !== undefined) {
    let tipos = body.tipos_contenido_disponibles;
    if (!Array.isArray(tipos)) tipos = [];
    tipos = tipos.map((t) => String(t).trim()).filter(Boolean);
    if (tipos.length === 0) {
      return json({ error: 'Define al menos un tipo de contenido.' }, 400);
    }
    payload.tipos_contenido_disponibles = tipos;
  }

  if (body.logo !== undefined) {
    payload.logo = body.logo || null;
  }

  if (Object.keys(payload).length === 0) {
    return json({ error: 'No hay campos para actualizar.' }, 400);
  }

  const r = await directusFetch({
    path: `/items/clientes/${id}`,
    method: 'PATCH',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/clientes PATCH]', id, r.status, r.raw);
    return json({ error: 'No se pudo actualizar el cliente.', detail: r.raw }, r.status);
  }

  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/clientes PATCH] cache clear falló:', e?.message);
  }

  return json(r.data);
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id del cliente.' }, 400);

  // Comprobamos cuántas publicaciones tiene este cliente antes de borrar.
  // Usamos aggregate para evitar el problema de que la respuesta aggregate
  // devuelve [{count:"N"}] (que un check tipo Array.isArray confunde con datos).
  const check = await directusFetch({
    path: `/items/publicaciones`,
    method: 'GET',
    token,
    search: {
      'filter[cliente_id][_eq]': id,
      'aggregate[count]': '*',
    },
  });

  // El aggregate devuelve { data: [{ count: "N" }] }. Si N > 0, no se puede borrar.
  const countStr = check.raw?.data?.[0]?.count;
  const count = countStr !== undefined ? Number(countStr) : null;

  if (count !== null && count > 0) {
    return json({
      error: 'No se puede eliminar el cliente porque tiene publicaciones asociadas.',
      detail: `Tiene ${count} publicación${count === 1 ? '' : 'es'}. Mueve o elimina primero las publicaciones.`,
    }, 409);
  }

  // Fallback si el aggregate falló por permisos: contamos con un list de 0.
  if (count === null && check.ok && Array.isArray(check.data)) {
    if (check.data.length > 0) {
      return json({
        error: 'No se puede eliminar el cliente porque tiene publicaciones asociadas.',
        detail: 'Mueve o elimina primero las publicaciones del cliente.',
      }, 409);
    }
  }

  const r = await directusFetch({
    path: `/items/clientes/${id}`,
    method: 'DELETE',
    token,
  });

  if (!r.ok && r.status !== 204) {
    console.error('[api/clientes DELETE]', id, r.status, r.raw);
    return json({ error: 'No se pudo eliminar el cliente.', detail: r.raw }, r.status);
  }

  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/clientes DELETE] cache clear falló:', e?.message);
  }

  return json({ ok: true });
}
