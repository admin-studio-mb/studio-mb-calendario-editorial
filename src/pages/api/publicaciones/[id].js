// ============================================================================
//  src/pages/api/publicaciones/[id].js
// ----------------------------------------------------------------------------
//  PATCH  /api/publicaciones/:id  → actualiza una publicación existente.
//  DELETE /api/publicaciones/:id  → elimina la publicación.
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../../lib/cache.js';
import { normalizarFechaPublicacion } from '../../../lib/fecha.js';
import { esCliente, transicionPermitida } from '../../../lib/flujo.js';
import { notificarEstado } from '../../../lib/notificaciones.js';

const REQUIRED_STRING_FIELDS = ['cliente_id', 'formato', 'estado'];
const VALID_FORMATO = ['post', 'reel', 'carrusel', 'story'];
const VALID_RED = ['instagram', 'linkedin', 'facebook'];
const VALID_ESTADO = ['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado'];

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

  // ── Restricciones del rol Cliente y datos previos ─────────────────────
  // El cliente solo puede CONFIRMAR (cambiar `estado` con una transición
  // válida del flujo). No edita contenido, no borra, no publica.
  const user = locals?.user ?? null;

  // Datos previos: los usan el guard de rol y las notificaciones.
  let prev = null;
  if (body.estado !== undefined) {
    const actual = await directusFetch({
      path: `/items/publicaciones/${id}`,
      method: 'GET',
      token,
      search: { fields: 'id,estado,cliente_id,tipo_contenido,fecha_publicacion' },
    });
    if (!actual.ok) {
      return json({ error: 'No se pudo leer la publicación.' }, actual.status || 500);
    }
    prev = actual.data;
  }

  if (esCliente(user)) {
    const campos = Object.keys(body).filter((k) => body[k] !== undefined);
    if (campos.some((k) => k !== 'estado')) {
      return json({ error: 'Los clientes solo pueden confirmar la publicación.' }, 403);
    }
    if (!body.estado) {
      return json({ error: 'Falta el estado.' }, 400);
    }
    const estadoActual = prev?.estado;
    if (!transicionPermitida(estadoActual, body.estado, user)) {
      return json(
        { error: `Transición no permitida: ${estadoActual} → ${body.estado}` },
        403,
      );
    }
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
  if (body.red !== undefined && body.red !== null && !VALID_RED.includes(body.red)) {
    return json({ error: `Red inválida. Valores permitidos: ${VALID_RED.join(', ')}` }, 400);
  }
  if (body.estado !== undefined && !VALID_ESTADO.includes(body.estado)) {
    return json({ error: `Estado inválido. Valores permitidos: ${VALID_ESTADO.join(', ')}` }, 400);
  }

  // Solo permitimos editar estos campos. Ignoramos silenciosamente el resto.
  const allowed = [
    'cliente_id',
    'red',
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

  // La fecha se normaliza a hora de pared (naive) antes de mandarla.
  if (payload.fecha_publicacion !== undefined) {
    const norm = normalizarFechaPublicacion(payload.fecha_publicacion);
    if (!norm) return json({ error: 'fecha_publicacion inválida.' }, 400);
    payload.fecha_publicacion = norm;
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
  await clearDirectusCache(token);

  // Notificación + email a la parte que tiene que actuar (best-effort).
  if (body.estado !== undefined && prev && prev.estado !== body.estado) {
    await notificarEstado({
      actor: user,
      publicacion: { ...prev, id },
      anterior: prev.estado,
      nuevo: body.estado,
    });
  }

  return json(r.data);
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  // El rol Cliente no puede borrar publicaciones.
  if (esCliente(locals?.user)) {
    return json({ error: 'No autorizado.' }, 403);
  }

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

  await clearDirectusCache(token);

  return json({ ok: true });
}
