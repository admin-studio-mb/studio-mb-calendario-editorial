// ============================================================================
//  src/pages/api/publicaciones/[id].js
// ----------------------------------------------------------------------------
//  PATCH  /api/publicaciones/:id  → actualiza una publicación existente.
//  DELETE /api/publicaciones/:id  → elimina la publicación.
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';

const REQUIRED_STRING_FIELDS = ['cliente_id', 'formato', 'estado'];
const VALID_FORMATO = ['post', 'reel', 'carrusel', 'story'];
const VALID_ESTADO = ['borrador', 'revision', 'aprobado'];

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
  if (!id) return json({ error: 'Falta el id de la publicación.' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  // Validación de campos básicos.
  for (const f of REQUIRED_STRING_FIELDS) {
    if (body[f] !== undefined && (typeof body[f] !== 'string' || body[f].length === 0)) {
      return json({ error: `Campo inválido: ${f}` }, 400);
    }
  }
  if (body.formato !== undefined && !VALID_FORMATO.includes(body.formato)) {
    return json({ error: `Formato inválido. Valores permitidos: ${VALID_FORMATO.join(', ')}` }, 400);
  }
  if (body.estado !== undefined && !VALID_ESTADO.includes(body.estado)) {
    return json({ error: `Estado inválido. Valores permitidos: ${VALID_ESTADO.join(', ')}` }, 400);
  }

  // Solo permitimos editar estos campos. Ignoramos silenciosamente el resto.
  const allowed = [
    'cliente_id',
    'tipo_contenido',
    'formato',
    'copywriting',
    'hashtags',
    'textos_slides',
    'imagenes_fondo',
    'fecha_publicacion',
    'estado',
    'diseno_final',
  ];
  const payload = {};
  for (const k of allowed) {
    if (body[k] !== undefined) payload[k] = body[k];
  }

  const r = await directusFetch({
    path: `/items/publicaciones/${id}`,
    method: 'PATCH',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/publicaciones PATCH]', id, r.status, r.raw);
    return json({ error: 'No se pudo actualizar la publicación.', detail: r.raw }, r.status);
  }

  // Invalidamos el cache para que el siguiente SSR vea el cambio.
  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/publicaciones PATCH] cache clear falló:', e?.message);
  }

  return json(r.data);
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id de la publicación.' }, 400);

  const r = await directusFetch({
    path: `/items/publicaciones/${id}`,
    method: 'DELETE',
    token,
  });

  if (!r.ok && r.status !== 204) {
    console.error('[api/publicaciones DELETE]', id, r.status, r.raw);
    return json({ error: 'No se pudo eliminar la publicación.', detail: r.raw }, r.status);
  }

  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/publicaciones DELETE] cache clear falló:', e?.message);
  }

  return json({ ok: true });
}
