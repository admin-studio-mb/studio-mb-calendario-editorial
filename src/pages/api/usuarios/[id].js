// ============================================================================
//  src/pages/api/usuarios/[id].js
// ----------------------------------------------------------------------------
//  PATCH  /api/usuarios/:id  → actualiza nombre, rol, cliente, estado o
//                              contraseña (solo Administrator).
//  DELETE /api/usuarios/:id  → borra usuario (solo Administrator).
//
//  Salvaguardas:
//   - Nadie puede cambiarse a sí mismo el rol ni el estado (evita quedarse
//     fuera de la app).
//   - No se puede borrar a uno mismo.
//   - Si Directus devuelve 500 por FKs de creado_por (AGENTS.md §6.11),
//     se responde 409 con instrucciones.
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../../lib/cache.js';
import { esAdmin, ROL } from '../../../lib/roles.js';

const ROLES_VALIDOS = [ROL.ADMIN, ROL.EDITOR, ROL.CLIENTE];
const USER_FIELDS = 'id,email,first_name,last_name,status,role.id,role.name,cliente_id';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function roleIdPorNombre(nombre, token) {
  const r = await directusFetch({
    path: '/roles',
    method: 'GET',
    token,
    search: { 'filter[name][_eq]': nombre, fields: 'id,name' },
  });
  if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return null;
  return r.data[0].id;
}

export async function PATCH({ params, request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede editar usuarios.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id del usuario.' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const esUnoMismo = locals?.user?.id === id;
  const payload = {};

  if (body.first_name !== undefined) payload.first_name = String(body.first_name).trim() || null;
  if (body.last_name !== undefined) payload.last_name = String(body.last_name).trim() || null;

  if (body.role !== undefined) {
    const rol = String(body.role).trim();
    if (!ROLES_VALIDOS.includes(rol)) {
      return json({ error: `Rol inválido. Valores: ${ROLES_VALIDOS.join(', ')}` }, 400);
    }
    if (esUnoMismo) {
      return json({ error: 'No puedes cambiarte el rol a ti mismo.' }, 400);
    }
    const roleId = await roleIdPorNombre(rol, token);
    if (!roleId) return json({ error: `No existe el rol "${rol}" en Directus.` }, 500);
    payload.role = roleId;
  }

  if (body.cliente_id !== undefined) {
    payload.cliente_id = body.cliente_id ? String(body.cliente_id) : null;
  }

  if (body.status !== undefined) {
    const st = String(body.status);
    if (!['active', 'suspended'].includes(st)) {
      return json({ error: 'Estado inválido (active | suspended).' }, 400);
    }
    if (esUnoMismo) return json({ error: 'No puedes suspender tu propia cuenta.' }, 400);
    payload.status = st;
  }

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
    payload.password = pw;
  }

  if (Object.keys(payload).length === 0) {
    return json({ error: 'No hay campos para actualizar.' }, 400);
  }

  const r = await directusFetch({
    path: `/users/${id}`,
    method: 'PATCH',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/usuarios PATCH]', id, r.status, r.raw);
    return json({ error: 'No se pudo actualizar el usuario.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);

  const after = await directusFetch({
    path: `/users/${id}`,
    method: 'GET',
    token,
    search: { fields: USER_FIELDS },
  });
  return json(after.ok ? after.data : { ok: true });
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede borrar usuarios.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id del usuario.' }, 400);
  if (locals?.user?.id === id) {
    return json({ error: 'No puedes borrar tu propia cuenta.' }, 400);
  }

  const r = await directusFetch({
    path: `/users/${id}`,
    method: 'DELETE',
    token,
  });

  if (!r.ok && r.status !== 204) {
    console.error('[api/usuarios DELETE]', id, r.status, r.raw);
    // FK de creado_por/actualizado_por (AGENTS.md §6.11) → 500 de Postgres.
    if (r.status === 500) {
      return json({
        error: 'No se pudo borrar: el usuario tiene registros asociados (publicaciones o comentarios creados por él).',
        detail: 'Suspéndelo en vez de borrarlo, o reasigna esos registros primero.',
      }, 409);
    }
    return json({ error: 'No se pudo borrar el usuario.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);
  return json({ ok: true });
}
