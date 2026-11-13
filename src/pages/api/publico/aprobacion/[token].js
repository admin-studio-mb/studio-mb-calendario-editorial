// ============================================================================
//  GET  /api/publico/aprobacion/:token  → datos públicos de la publicación.
//  POST /api/publico/aprobacion/:token  → { accion, motivo? }
//        accion: 'confirmar' | 'aprobar' | 'cambios'
//
//  Sin sesión: el token es la credencial. Usa el token estático en servidor
//  para leer y actualizar; nunca devuelve ids internos ni el token.
// ============================================================================

import { directusFetch } from '../../../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../../../lib/cache.js';
import { env } from '../../../../lib/env.js';
import { registrarActividad, etiquetaEstado } from '../../../../lib/actividad.js';
import { notificarEstado } from '../../../../lib/notificaciones.js';
import { destinoDeAccion, enlaceValido, accionExigeMotivo } from '../../../../lib/aprobacion.js';

export const prerender = false;

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function tokenServidor() {
  return env.PUBLIC_DIRECTUS_STATIC_TOKEN || '';
}

function esUrl(s) {
  return /^https?:\/\//i.test(String(s ?? '').trim());
}

/** Convierte un id de archivo de Directus en URL pública del proxy. */
function urlArchivo(valor) {
  const id = typeof valor === 'object' ? valor?.id : valor;
  if (!id) return null;
  if (esUrl(id)) return String(id);
  return `/api/publico/asset/${id}`;
}

function slidesPublicos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    if (s && typeof s === 'object') {
      return { texto: s.texto ?? '', imagen: urlArchivo(s.imagen) };
    }
    return { texto: '', imagen: urlArchivo(s) };
  });
}

async function buscarPorToken(token) {
  const r = await directusFetch({
    path: '/items/publicaciones',
    token: tokenServidor(),
    search: {
      'filter[token_aprobacion][_eq]': token,
      fields: 'id,cliente_id.nombre,tipo_contenido,formato,red,copywriting,hashtags,imagenes_fondo,fecha_publicacion,estado,motivo_rechazo,diseno_final,token_aprobacion,aprobacion_expira',
      limit: '1',
    },
  });
  if (!r.ok) return { error: 'No se pudo leer la publicación.', status: 500 };
  const post = (r.data ?? [])[0];
  if (!post) return { error: 'Enlace no válido.', status: 404 };
  if (!enlaceValido(post)) return { error: 'Este enlace ha caducado.', status: 410 };
  return { post };
}

export async function GET({ params }) {
  const token = String(params?.token ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) return json({ error: 'Enlace no válido.' }, 404);

  const { post, error, status } = await buscarPorToken(token);
  if (error) return json({ error }, status);

  return json({
    cliente: post.cliente_id?.nombre ?? '',
    tipo: post.tipo_contenido ?? '',
    formato: post.formato ?? '',
    red: post.red ?? '',
    fecha: post.fecha_publicacion ?? null,
    copy: post.copywriting ?? '',
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    slides: slidesPublicos(post.imagenes_fondo),
    diseno: urlArchivo(post.diseno_final),
    estado: post.estado,
    motivo: post.motivo_rechazo ?? null,
  });
}

export async function POST({ params, request }) {
  const token = String(params?.token ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) return json({ error: 'Enlace no válido.' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const accion = String(body?.accion ?? '');
  if (!['confirmar', 'aprobar', 'cambios'].includes(accion)) {
    return json({ error: 'Acción no válida.' }, 400);
  }

  const { post, error, status } = await buscarPorToken(token);
  if (error) return json({ error }, status);

  const destino = destinoDeAccion(accion, post.estado);
  if (!destino) {
    return json({ error: 'Esta publicación ya no admite esa acción.', estado: post.estado }, 409);
  }

  let motivo = null;
  if (accionExigeMotivo(accion)) {
    motivo = String(body?.motivo ?? '').trim();
    if (!motivo) return json({ error: 'Escribe el motivo de los cambios.' }, 400);
    if (motivo.length > 500) return json({ error: 'El motivo no puede superar 500 caracteres.' }, 400);
  }

  const payload = { estado: destino };
  if (accion === 'cambios') payload.motivo_rechazo = motivo;

  const r = await directusFetch({
    path: `/items/publicaciones/${post.id}`,
    method: 'PATCH',
    token: tokenServidor(),
    body: payload,
  });
  if (!r.ok) {
    console.error('[api/publico/aprobacion POST]', r.status, r.raw);
    return json({ error: 'No se pudo guardar la respuesta.' }, r.status);
  }

  await clearDirectusCache(tokenServidor());

  await registrarActividad({
    publicacion_id: post.id,
    tipo: 'estado',
    detalle: `${etiquetaEstado(post.estado)} → ${etiquetaEstado(destino)} (enlace público)`,
    estado_anterior: post.estado,
    estado_nuevo: destino,
    motivo,
    usuario: null,
  });

  // Notificamos como si actuara el cliente (para que el equipo se entere).
  await notificarEstado({
    actor: { role: { name: 'Cliente' }, first_name: 'Cliente' },
    publicacion: post,
    anterior: post.estado,
    nuevo: destino,
  });

  return json({ ok: true, estado: destino });
}
