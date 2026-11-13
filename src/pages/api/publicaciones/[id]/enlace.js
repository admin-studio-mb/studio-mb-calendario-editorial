// ============================================================================
//  /api/publicaciones/:id/enlace
//  POST   → crea (o devuelve) el enlace público de aprobación.
//  DELETE → revoca el enlace.
//
//  Solo equipo (Administrator / Editor). El token no es legible por el rol
//  Cliente.
// ============================================================================

import { directusFetch } from '../../../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../../../lib/cache.js';
import { esCliente } from '../../../../lib/flujo.js';
import { generarToken, fechaExpiracion, enlaceValido, DIAS_APROBACION } from '../../../../lib/aprobacion.js';

export const prerender = false;

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://calendar.studiomb.es').replace(/\/$/, '');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlDe(token) {
  return `${APP_URL}/aprobar/${token}`;
}

export async function POST({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (esCliente(locals?.user)) return json({ error: 'No autorizado.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id de la publicación.' }, 400);

  const actual = await directusFetch({
    path: `/items/publicaciones/${id}`,
    method: 'GET',
    token,
    search: { fields: 'id,token_aprobacion,aprobacion_expira' },
  });
  if (!actual.ok) {
    return json({ error: 'No se pudo leer la publicación.' }, actual.status || 500);
  }

  if (enlaceValido(actual.data)) {
    return json({
      token: actual.data.token_aprobacion,
      url: urlDe(actual.data.token_aprobacion),
      expira: actual.data.aprobacion_expira,
      reutilizado: true,
    });
  }

  const nuevo = generarToken();
  const expira = fechaExpiracion(DIAS_APROBACION);

  const r = await directusFetch({
    path: `/items/publicaciones/${id}`,
    method: 'PATCH',
    token,
    body: { token_aprobacion: nuevo, aprobacion_expira: expira },
  });
  if (!r.ok) {
    console.error('[api/publicaciones/enlace POST]', r.status, r.raw);
    return json({ error: 'No se pudo crear el enlace.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);
  return json({ token: nuevo, url: urlDe(nuevo), expira, reutilizado: false }, 201);
}

export async function DELETE({ params, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (esCliente(locals?.user)) return json({ error: 'No autorizado.' }, 403);

  const id = params?.id;
  if (!id) return json({ error: 'Falta el id de la publicación.' }, 400);

  const r = await directusFetch({
    path: `/items/publicaciones/${id}`,
    method: 'PATCH',
    token,
    body: { token_aprobacion: null, aprobacion_expira: null },
  });
  if (!r.ok) {
    console.error('[api/publicaciones/enlace DELETE]', r.status, r.raw);
    return json({ error: 'No se pudo revocar el enlace.', detail: r.raw }, r.status);
  }

  await clearDirectusCache(token);
  return json({ ok: true });
}
