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
import { registrarActividad, borrarActividadDe } from '../../../lib/actividad.js';
import { etiquetaEstado } from '../../../lib/actividad.js';

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
    // Solo `estado` y, al pedir cambios, `motivo_rechazo`.
    if (campos.some((k) => k !== 'estado' && k !== 'motivo_rechazo')) {
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

    // "Pedir cambios" exige motivo: rechazo de texto (revision → borrador) o
    // de diseño (revision_diseno → en_diseno).
    const pideCambios = (estadoActual === 'revision' && body.estado === 'borrador')
      || (estadoActual === 'revision_diseno' && body.estado === 'en_diseno');
    if (pideCambios) {
      const motivo = typeof body.motivo_rechazo === 'string' ? body.motivo_rechazo.trim() : '';
      if (!motivo) {
        return json({ error: 'Indica el motivo por el que pides cambios.' }, 400);
      }
      if (motivo.length > 500) {
        return json({ error: 'El motivo no puede superar 500 caracteres.' }, 400);
      }
      body.motivo_rechazo = motivo;
    } else if (body.motivo_rechazo !== undefined) {
      return json({ error: 'El motivo solo se envía al pedir cambios.' }, 400);
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
  if (body.motivo_rechazo !== undefined && body.motivo_rechazo !== null
      && typeof body.motivo_rechazo !== 'string') {
    return json({ error: 'motivo_rechazo inválido.' }, 400);
  }
  if (body.responsable_id !== undefined && body.responsable_id !== null
      && typeof body.responsable_id !== 'string') {
    return json({ error: 'responsable_id inválido.' }, 400);
  }

  // Solo permitimos editar estos campos. Ignoramos silenciosamente el resto.
  const allowed = [
    'cliente_id',
    'red',
    'responsable_id',
    'tipo_contenido',
    'formato',
    'copywriting',
    'hashtags',
    'textos_slides',
    'imagenes_fondo',
    'fecha_publicacion',
    'estado',
    'diseno_final',
    'motivo_rechazo',
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

  // Limpieza: al volver a revisión (texto o diseño), el motivo anterior ya no
  // aplica (el historial conserva el que hubo).
  if (body.estado === 'revision' || body.estado === 'revision_diseno') {
    payload.motivo_rechazo = null;
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

  // Historial: cambio de estado o edición de campos (best-effort).
  if (body.estado !== undefined && prev && prev.estado !== body.estado) {
    await registrarActividad({
      publicacion_id: id,
      tipo: 'estado',
      detalle: `${etiquetaEstado(prev.estado)} → ${etiquetaEstado(body.estado)}`,
      estado_anterior: prev.estado,
      estado_nuevo: body.estado,
      motivo: payload.motivo_rechazo ?? null,
      usuario: user,
    });
  } else {
    const campos = Object.keys(payload).filter((k) => payload[k] !== undefined && k !== 'motivo_rechazo');
    if (campos.length > 0) {
      await registrarActividad({
        publicacion_id: id,
        tipo: 'edicion',
        detalle: `Editado: ${campos.join(', ')}`,
        usuario: user,
      });
    }
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

  // Historial primero: la FK quedó en SET NULL y quedarían filas huérfanas.
  await borrarActividadDe(id);

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
