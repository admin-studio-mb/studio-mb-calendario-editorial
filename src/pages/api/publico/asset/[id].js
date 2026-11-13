// ============================================================================
//  GET /api/publico/asset/:id
//  Proxy público de archivos de Directus (diseño final y fotos de slides en
//  el enlace de aprobación). Solo acepta ids uuid; usa el token estático en
//  servidor para no exponer credenciales en el HTML.
// ============================================================================

import { env } from '../../../../lib/env.js';

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET({ params, url }) {
  const id = String(params?.id ?? '').trim();
  if (!UUID_RE.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const token = env.PUBLIC_DIRECTUS_STATIC_TOKEN;
  if (!token) return new Response('No disponible', { status: 503 });

  // Pasamos los parámetros de transformación (width/height/fit/quality).
  const qs = new URLSearchParams();
  for (const k of ['width', 'height', 'fit', 'quality']) {
    if (url.searchParams.has(k)) qs.set(k, url.searchParams.get(k));
  }
  const query = qs.toString() ? `?${qs.toString()}` : '';

  const res = await fetch(`${env.DIRECTUS_INTERNAL_URL}/assets/${id}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('Not found', { status: res.status === 404 ? 404 : 502 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
