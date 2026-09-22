// ============================================================================
//  src/lib/directus-fetch.js
// ----------------------------------------------------------------------------
//  Wrapper ligero sobre la API REST de Directus pensado para usar desde los
//  endpoints SSR (src/pages/api/*). Construye la URL con `DIRECTUS_INTERNAL_URL`
//  y adjunta el JWT de la cookie si está presente. Devuelve { ok, status,
//  data, raw } para no tener que reinventar el manejo de errores en cada
//  endpoint.
//
//  Por qué no usar el SDK aquí: el SDK encadena `.with(authentication())` que
//  en SSR intenta refrescar tokens y rompe. Para CRUD puntual, fetch es más
//  predecible y consume menos.
// ============================================================================

import { env } from './env.js';

/**
 * @param {object} opts
 * @param {string} opts.path          Ruta bajo / (p.ej. '/items/publicaciones').
 * @param {string} [opts.method]      GET por defecto.
 * @param {object|null} [opts.token]  JWT del usuario (o null si anónimo).
 * @param {object} [opts.body]        Body JSON para POST/PATCH.
 * @param {object} [opts.search]      Query string adicional (?fields=..., ?filter=..., etc.).
 */
export async function directusFetch({ path, method = 'GET', token = null, body = null, search = null }) {
  const url = new URL(`${env.DIRECTUS_INTERNAL_URL}${path}`);
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Directus siempre devuelve JSON en sus endpoints REST.
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data: payload?.data ?? null,
    raw: payload,
  };
}

/**
 * Sube un archivo binario a Directus /files. Devuelve el `id` del archivo.
 * Importante: usamos multipart/form-data directamente a Directus porque la
 * subida no se hace por el SDK y no queremos mantener un cliente paralelo.
 *
 * @param {File} file                  File de un FormData (request.formData()).
 * @param {string|null} token          JWT del usuario.
 */
export async function uploadFile(file, token) {
  const fd = new FormData();
  fd.append('file', file);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${env.DIRECTUS_INTERNAL_URL}/files`, {
    method: 'POST',
    headers,
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload fallido (${res.status}): ${text || res.statusText}`);
  }
  const json = await res.json();
  return json?.data ?? null;
}
