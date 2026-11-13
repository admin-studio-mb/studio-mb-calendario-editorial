// ============================================================================
//  POST /api/notificaciones/digest
// ----------------------------------------------------------------------------
//  Envía el resumen diario de notificaciones a los usuarios que tienen
//  `notifEmail = 'diario'` y aún tienen emails sin enviar.
//
//  Pensado para un cron (n8n, systemd timer, etc.) a las 9:00:
//    curl -X POST https://calendar.studiomb.es/api/notificaciones/digest \
//         -H "Authorization: Bearer $PUBLIC_DIRECTUS_STATIC_TOKEN"
//
//  Requiere SMTP configurado. No toca la campanita: solo manda el email y
//  marca `email_enviado`.
// ============================================================================

import { directusFetch } from '../../../lib/directus-fetch.js';
import { env } from '../../../lib/env.js';
import { normalizarPrefs } from '../../../lib/prefs.js';
import { sendEmail, smtpConfigurado } from '../../../lib/email.js';

export const prerender = false;

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://calendar.studiomb.es').replace(/\/$/, '');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request }) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const esperado = env.PUBLIC_DIRECTUS_STATIC_TOKEN;

  if (!esperado || token !== esperado) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!smtpConfigurado()) {
    return json({ ok: false, error: 'SMTP no configurado.' }, 503);
  }

  const resumen = { usuarios: 0, notificaciones: 0, errores: [] };

  const users = await directusFetch({
    path: '/users',
    token,
    search: {
      'filter[status][_eq]': 'active',
      fields: 'id,email,first_name,last_name,preferencias',
      limit: '-1',
    },
  });
  if (!users.ok) return json({ error: 'No se pudieron listar los usuarios.' }, 500);

  const destinatarios = (users.data ?? []).filter(
    (u) => u.email && normalizarPrefs(u.preferencias).notifEmail === 'diario',
  );

  for (const u of destinatarios) {
    const pend = await directusFetch({
      path: '/items/notificaciones',
      token,
      search: {
        'filter[usuario][_eq]': u.id,
        'filter[leida][_eq]': 'false',
        'filter[email_enviado][_eq]': 'false',
        fields: 'id,titulo,cuerpo,url,fecha_creacion',
        sort: 'fecha_creacion',
        limit: '50',
      },
    });
    const items = pend.ok ? (pend.data ?? []) : [];
    if (items.length === 0) continue;

    const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
    const lineas = items.map((n) => {
      const enlace = n.url ? `\n  ${APP_URL}${n.url}` : '';
      return `• ${n.titulo}${n.cuerpo ? `\n  ${n.cuerpo}` : ''}${enlace}`;
    });

    const text = [
      `Hola ${nombre},`,
      '',
      `Tienes ${items.length} ${items.length === 1 ? 'aviso' : 'avisos'} en el calendario editorial:`,
      '',
      ...lineas,
      '',
      `— Studio mb · Calendario (${APP_URL})`,
    ].join('\n');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <p style="font-size:12px;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin:0 0 8px">Studio mb · Calendario</p>
        <h2 style="font-size:18px;color:#111827;margin:0 0 12px">Resumen de notificaciones</h2>
        <p style="font-size:14px;color:#374151;margin:0 0 16px">Tienes <b>${items.length}</b> ${items.length === 1 ? 'aviso' : 'avisos'} pendientes:</p>
        <ul style="padding-left:18px;margin:0 0 16px">
          ${items.map((n) => `<li style="font-size:14px;color:#374151;margin:0 0 10px">${escapeHtml(n.titulo)}${n.cuerpo ? `<br><span style="font-size:13px;color:#6b7280">${escapeHtml(n.cuerpo)}</span>` : ''}${n.url ? `<br><a href="${APP_URL}${n.url}" style="font-size:13px;color:#4f46e5">Abrir en el calendario</a>` : ''}</li>`).join('')}
        </ul>
        <p style="font-size:11px;color:#9ca3af;margin:24px 0 0">Recibes este resumen porque lo activaste en Configuración.</p>
      </div>`;

    const enviado = await sendEmail({
      to: u.email,
      subject: `[Studio mb] ${items.length} ${items.length === 1 ? 'aviso pendiente' : 'avisos pendientes'}`,
      text,
      html,
    });

    if (!enviado.ok) {
      resumen.errores.push({ usuario: u.email, error: enviado.error ?? 'sendEmail falló' });
      continue;
    }

    await directusFetch({
      path: '/items/notificaciones',
      method: 'PATCH',
      token,
      body: {
        data: { email_enviado: true },
        query: { filter: { id: { _in: items.map((n) => n.id) } } },
      },
    });

    resumen.usuarios += 1;
    resumen.notificaciones += items.length;
  }

  return json({ ok: true, ...resumen });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
