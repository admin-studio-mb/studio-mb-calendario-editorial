// ============================================================================
//  /api/efemerides
//  GET  ?mes=1..12 → efemérides del mes (cualquier usuario autenticado).
//  POST            → crea una efeméride (solo Administrator).
// ============================================================================

import { directusFetch } from '../../lib/directus-fetch.js';
import { clearDirectusCache } from '../../lib/cache.js';
import { esAdmin, esCliente } from '../../lib/roles.js';
import { AMBITOS_VALIDOS } from '../../lib/efemerides.js';

export const prerender = false;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function validarEfemeride(body) {
  const dia = Number(body?.dia);
  const mes = Number(body?.mes);
  const nombre = String(body?.nombre ?? '').trim();
  const ambito = String(body?.ambito ?? 'propia');
  const clienteId = body?.cliente_id ? String(body.cliente_id) : null;
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: 'Día inválido (1-31).' };
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { error: 'Mes inválido (1-12).' };
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  if (!AMBITOS_VALIDOS.includes(ambito)) {
    return { error: `Ámbito inválido. Valores: ${AMBITOS_VALIDOS.join(', ')}.` };
  }
  return {
    data: {
      dia,
      mes,
      nombre,
      ambito,
      cliente_id: clienteId,
      notas: body?.notas ? String(body.notas).slice(0, 500) : null,
    },
  };
}

export async function GET({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const mes = Number(new URL(request.url).searchParams.get('mes'));
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return json({ error: 'Parámetro mes inválido (1-12).' }, 400);
  }

  const r = await directusFetch({
    path: '/items/efemerides',
    token,
    search: {
      'filter[mes][_eq]': String(mes),
      fields: 'id,dia,mes,nombre,ambito,notas,cliente_id',
      sort: 'dia',
      limit: '-1',
    },
  });
  if (!r.ok) {
    console.error('[api/efemerides GET]', r.status, r.raw);
    return json({ error: 'No se pudieron cargar las efemérides.' }, r.status);
  }

  // El Cliente solo ve las globales y las suyas. El filtro se hace también
  // aquí, aunque la policy de Directus ya lo limite, para no depender de ella
  // si cambia la configuración del CMS.
  const clienteId = esCliente(locals?.user) ? (locals.user.cliente_id ?? null) : null;
  const items = (r.data ?? []).filter((e) => (
    !esCliente(locals?.user) || !e.cliente_id || e.cliente_id === clienteId
  ));
  return json(items);
}

export async function POST({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return json({ error: 'Unauthorized' }, 401);
  if (!esAdmin(locals?.user)) return json({ error: 'Solo un administrador puede crear efemérides.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON inválido.' }, 400);
  }

  const { data, error } = validarEfemeride(body);
  if (error) return json({ error }, 400);

  const r = await directusFetch({ path: '/items/efemerides', method: 'POST', token, body: data });
  if (!r.ok) {
    console.error('[api/efemerides POST]', r.status, r.raw);
    return json({ error: 'No se pudo crear la efeméride.' }, r.status);
  }
  await clearDirectusCache(token);
  return json(r.data, 201);
}
