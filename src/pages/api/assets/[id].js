// ============================================================================
//  src/pages/api/assets/[id].js
// ----------------------------------------------------------------------------
//  Proxy de archivos de Directus. Devuelve el binario usando el token de la
//  sesión del usuario, así el navegador puede pedir el logo de un cliente
//  sin saber nada de Directus.
//
//  Endpoint:
//    GET /api/assets/:id  → 200 con el body del archivo + Content-Type.
// ============================================================================

import { env } from '../../../lib/env.js';

export async function GET({ params, locals }) {
  const id = params?.id;
  if (!id) return new Response('Missing id', { status: 400 });

  const token = locals?.token ?? null;
  if (!token) return new Response('Unauthorized', { status: 401 });

  const url = `${env.DIRECTUS_INTERNAL_URL}/assets/${id}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!r.ok) {
    return new Response(`Upstream error ${r.status}`, { status: r.status });
  }

  // Reenviamos el body y content-type tal cual.
  const headers = new Headers();
  const ct = r.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  // Cacheamos en el navegador por una hora para evitar pedir lo mismo muchas veces.
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(r.body, { status: 200, headers });
}
