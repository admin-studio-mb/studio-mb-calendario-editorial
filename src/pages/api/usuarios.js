// ============================================================================
//  src/pages/api/usuarios.js
// ----------------------------------------------------------------------------
//  GET  /api/usuarios  → lista de usuarios (solo Administrator).
//  POST /api/usuarios  → crea usuario { email, password, first_name,
//                        last_name, role, cliente_id? } (solo Administrator).
//
//  Roles permitidos: Administrator | Editor | Cliente.
//  Si el rol es Cliente, `cliente_id` es obligatorio.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';
import { esAdmin, ROL } from '../../lib/roles.js';

const ROLES_VALIDOS = [ROL.ADMIN, ROL.EDITOR, ROL.CLIENTE];
const USER_FIELDS = 'id,email,first_name,last_name,status,role.id,role.name,cliente_id';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Resuelve el id de un rol por nombre (o null). */
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

export async function GET({ locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede ver los usuarios.' }, 403);

  const r = await directusFetch({
    path: '/users',
    method: 'GET',
    token,
    search: { fields: USER_FIELDS, limit: '-1', sort: 'email' },
  });
  if (!r.ok) {
    console.error('[api/usuarios GET]', r.status, r.raw);
    return json({ error: 'No se pudieron cargar los usuarios.', detail: r.raw }, r.status);
  }
  return json(r.data ?? []);
}

export async function POST({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede crear usuarios.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const firstName = String(body.first_name ?? '').trim();
  const lastName = String(body.last_name ?? '').trim();
  const rol = String(body.role ?? '').trim();
  const clienteId = body.cliente_id ? String(body.cliente_id) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Email inválido.' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return json({ error: `Rol inválido. Valores: ${ROLES_VALIDOS.join(', ')}` }, 400);
  }
  if (rol === ROL.CLIENTE && !clienteId) {
    return json({ error: 'Para un usuario Cliente hay que asignar un cliente.' }, 400);
  }

  const roleId = await roleIdPorNombre(rol, token);
  if (!roleId) return json({ error: `No existe el rol "${rol}" en Directus.` }, 500);

  const payload = {
    email,
    password,
    first_name: firstName || null,
    last_name: lastName || null,
    role: roleId,
    status: 'active',
    // cliente_id solo tiene sentido para el rol Cliente.
    cliente_id: rol === ROL.CLIENTE ? clienteId : null,
  };

  const r = await directusFetch({
    path: '/users',
    method: 'POST',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/usuarios POST]', r.status, r.raw);
    const msg = r.status === 400
      ? 'No se pudo crear el usuario (¿email duplicado o contraseña inválida?).'
      : 'No se pudo crear el usuario.';
    return json({ error: msg, detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);

  const created = r.data
    ? {
        id: r.data.id,
        email: r.data.email,
        first_name: r.data.first_name,
        last_name: r.data.last_name,
        status: r.data.status,
        role: { id: roleId, name: rol },
        cliente_id: r.data.cliente_id ?? null,
      }
    : null;
  return json(created, 201);
}
