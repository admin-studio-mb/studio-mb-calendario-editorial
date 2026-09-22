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

export const prerender = false;

const FORMATOS = new Set(['post', 'reel', 'carrusel', 'story']);
const ESTADOS = new Set(['borrador', 'revision', 'aprobado']);

export async function POST({ request, locals }) {
  const token = locals.token ?? null;
  if (!token) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const err = validate(body);
  if (err) return json({ error: err }, 400);

  // No permitimos que el cliente envíe campos no esperados (incl. usuario_id).
  const payload = {
    cliente_id: body.cliente_id,
    tipo_contenido: body.tipo_contenido ?? null,
    formato: body.formato ?? 'post',
    copywriting: body.copywriting ?? null,
    hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
    textos_slides: body.textos_slides ?? null,
    imagenes_fondo: Array.isArray(body.imagenes_fondo) ? body.imagenes_fondo : [],
    fecha_publicacion: new Date(body.fecha_publicacion).toISOString(),
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
  // vea la nueva publicación. Sin esto, el listado puede venir de Redis (cache
  // interna) y no incluir lo recién creado. Best-effort: si falla seguimos.
  try {
    await directusFetch({
      path: '/utils/cache/clear',
      method: 'POST',
      token,
      search: { system: 'true' },
    });
  } catch (e) {
    console.warn('[api/publicaciones POST] cache clear falló:', e?.message);
  }

  return json(r.data, 201);
}

function validate(b) {
  if (!b || typeof b !== 'object') return 'Body requerido.';
  if (!b.cliente_id || typeof b.cliente_id !== 'string') return 'cliente_id obligatorio.';
  if (!b.fecha_publicacion) return 'fecha_publicacion obligatoria.';
  const d = new Date(b.fecha_publicacion);
  if (Number.isNaN(d.getTime())) return 'fecha_publicacion inválida.';
  if (b.formato && !FORMATOS.has(b.formato)) return `formato debe ser uno de: ${[...FORMATOS].join(', ')}.`;
  if (b.estado && !ESTADOS.has(b.estado)) return `estado debe ser uno de: ${[...ESTADOS].join(', ')}.`;
  return null;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
