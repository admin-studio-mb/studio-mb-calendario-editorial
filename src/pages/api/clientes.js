// ============================================================================
//  src/pages/api/clientes.js
// ----------------------------------------------------------------------------
//  POST /api/clientes — crea un cliente.
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';
import { esAdmin } from '../../lib/roles.js';
import { normalizarHex } from '../../lib/marca.js';

const REDES_VALIDAS = ['instagram', 'linkedin', 'facebook'];

/** Valida y sanea redes: [{ red, tipos: string[] }]. Devuelve null si es inválido. */
function sanitizarRedes(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    if (!REDES_VALIDAS.includes(item.red)) return null;
    const tipos = Array.isArray(item.tipos)
      ? item.tipos.map((t) => String(t).trim()).filter(Boolean)
      : [];
    if (tipos.length === 0) continue; // red sin tipos = desactivada
    out.push({ red: item.red, tipos });
  }
  return out;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  // Alta de clientes: solo el Administrator.
  if (!esAdmin(locals?.user)) {
    return json({ error: 'Solo un administrador puede crear clientes.' }, 403);
  }

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

  // Color de marca (marca blanca). Vacío = morado de Studio mb.
  if (body.color_marca !== undefined) {
    if (body.color_marca && !normalizarHex(body.color_marca)) {
      return json({ error: 'El color de marca debe ser un hex (#4f46e5).' }, 400);
    }
    payload.color_marca = normalizarHex(body.color_marca);
  }

  // Redes sociales: [{ red, tipos: [] }]. Se valida y sanea.
  if (body.redes !== undefined) {
    const redes = sanitizarRedes(body.redes);
    if (redes === null) return json({ error: 'redes inválidas (red o tipos).' }, 400);
    payload.redes = redes;
  }

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
  await clearDirectusCache(token);

  return json(r.data, 201);
}
