// ============================================================================
//  POST /api/files
//  Sube un archivo a Directus y devuelve su id. Usado por PostForm para
//  adjuntar el "diseno_final". Espera multipart/form-data con un campo "file".
// ============================================================================

import { uploadFile } from '../../lib/directus-fetch.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const token = locals.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'Falta el campo "file" (multipart).' }, 400);
  }

  try {
    const data = await uploadFile(file, token);
    return json(data, 201);
  } catch (err) {
    console.error('[api/files POST]', err);
    return json({ error: 'Subida fallida.', detail: String(err.message ?? err) }, 500);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
