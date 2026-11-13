// ============================================================================
//  POST /api/publicaciones
//  Crea una publicación. Body esperado (subset del payload de PostForm.jsx):
//    {
//      cliente_id, tipo_contenido, formato, copywriting, hashtags,
//      textos_slides, imagenes_fondo, fecha_publicacion, estado, diseno_final
//    }
//  Responde 201 con la publicación creada o 400 con el detalle del error.
//
//  Validación mínima: cliente_id y fecha_publicacion obligatorios (PostForm ya
//  los exige pero defendemos también en el servidor por si llegan de fuera).
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';
import { normalizarFechaPublicacion } from '../../lib/fecha.js';
import { esCliente } from '../../lib/flujo.js';
import { registrarActividad } from '../../lib/actividad.js';

export const prerender = false;

const FORMATOS = new Set(['post', 'reel', 'carrusel', 'story']);
const REDES = new Set(['instagram', 'linkedin', 'facebook']);
const ESTADOS = new Set(['borrador', 'revision', 'en_diseno', 'revision_diseno', 'aprobado', 'publicado']);

export async function POST({ request, locals }) {
  const token = locals.token ?? null;
  if (!token) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // El rol Cliente no crea publicaciones: las crea la agencia.
  if (esCliente(locals?.user)) {
    return json({ error: 'Los clientes no pueden crear publicaciones.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const err = validate(body);
  if (err) return json({ error: err }, 400);

  // Payload: la fecha va como HORA DE PARED local (naive, sin Z) porque
  // Directus la guarda en `timestamp without time zone`.
  const payload = {
    cliente_id: body.cliente_id,
    red: body.red ?? null,
    responsable_id: body.responsable_id ?? null,
    tipo_contenido: body.tipo_contenido ?? null,
    formato: body.formato ?? 'post',
    copywriting: body.copywriting ?? null,
    hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
    textos_slides: body.textos_slides ?? null,
    imagenes_fondo: Array.isArray(body.imagenes_fondo) ? body.imagenes_fondo : [],
    fecha_publicacion: normalizarFechaPublicacion(body.fecha_publicacion),
    estado: body.estado ?? 'borrador',
    diseno_final: body.diseno_final ?? null,
  };

  const r = await directusFetch({
    path: '/items/publicaciones',
    method: 'POST',
    token,
    body: payload,
  });

  if (!r.ok) {
    console.error('[api/publicaciones POST]', r.status, r.raw);
    return json({ error: 'No se pudo guardar la publicación.', detail: r.raw }, r.status);
  }

  // Invalidamos el cache de Directus para que el siguiente SSR del dashboard
  // vea la nueva publicación. Sin esto, Directus sirve la lista cacheada
  // (Redis) y la publicación no aparece hasta que expira.
  await clearDirectusCache(token);

  // Historial: alta normal o duplicado (origen lo manda el botón Duplicar).
  await registrarActividad({
    publicacion_id: r.data.id,
    tipo: body.origen === 'duplicado' ? 'duplicado' : 'creado',
    detalle: body.origen === 'duplicado' ? 'Publicación duplicada' : 'Publicación creada',
    usuario: locals.user,
  });

  return json(r.data, 201);
}

function validate(b) {
  if (!b || typeof b !== 'object') return 'Body requerido.';
  if (!b.cliente_id || typeof b.cliente_id !== 'string') return 'cliente_id obligatorio.';
  if (!b.fecha_publicacion) return 'fecha_publicacion obligatoria.';
  if (!normalizarFechaPublicacion(b.fecha_publicacion)) return 'fecha_publicacion inválida.';
  if (b.formato && !FORMATOS.has(b.formato)) return `formato debe ser uno de: ${[...FORMATOS].join(', ')}.`;
  if (b.red && !REDES.has(b.red)) return `red debe ser una de: ${[...REDES].join(', ')}.`;
  if (b.responsable_id !== undefined && b.responsable_id !== null
      && typeof b.responsable_id !== 'string') return 'responsable_id inválido.';
  if (b.estado && !ESTADOS.has(b.estado)) return `estado debe ser uno de: ${[...ESTADOS].join(', ')}.`;
  return null;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
