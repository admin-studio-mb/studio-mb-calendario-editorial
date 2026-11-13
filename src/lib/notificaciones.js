// ============================================================================
//  src/lib/notificaciones.js
// ----------------------------------------------------------------------------
//  Motor de notificaciones: crea filas en la colección `notificaciones` y
//  envía email a cada destinatario (si SMTP está configurado).
//
//  Reglas:
//    - Comentario de un CLIENTE  → notifica al equipo (Admin + Editor).
//    - Comentario del EQUIPO     → notifica a los usuarios Cliente de ese cliente.
//    - Cambios de estado         → notifica a la parte que tiene que actuar:
//        revision          → cliente (post para revisar)
//        en_diseno         → equipo (el cliente confirmó el texto)
//        revision_diseno   → cliente (diseño listo para aprobar)
//        aprobado          → equipo (el cliente aprobó)
//        publicado         → cliente (publicado)
//        borrador          → equipo (solo si el cliente pide cambios de texto)
//
//  La escritura usa PUBLIC_DIRECTUS_STATIC_TOKEN (admin) porque hay que crear
//  notificaciones PARA OTROS usuarios: las policies de Cliente/Editor solo
//  permiten leer/actualizar las propias.
//
//  Nunca lanza: si falta token o Directus falla, se loguea y la petición
//  original del usuario sigue su curso.
// ============================================================================

import { directusFetch } from './directus-fetch.js';
import { env } from './env.js';
import { sendEmail, smtpConfigurado } from './email.js';
import { esCliente } from './roles.js';
import { parseFechaPublicacion } from './fecha.js';
import { normalizarPrefs } from './prefs.js';

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://calendar.studiomb.es').replace(/\/$/, '');

function token() {
  return env.PUBLIC_DIRECTUS_STATIC_TOKEN || '';
}

/** Usuarios activos con rol Administrator o Editor. */
async function usuariosEquipo() {
  const r = await directusFetch({
    path: '/users',
    token: token(),
    search: {
      'filter[status][_eq]': 'active',
      'filter[role][name][_in]': 'Administrator,Editor',
      fields: 'id,email,first_name,last_name,preferencias',
      limit: '-1',
    },
  });
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/** Usuarios activos del rol Cliente asignados a un cliente concreto. */
async function usuariosDeCliente(clienteId) {
  if (!clienteId) return [];
  const r = await directusFetch({
    path: '/users',
    token: token(),
    search: {
      'filter[status][_eq]': 'active',
      'filter[role][name][_eq]': 'Cliente',
      'filter[cliente_id][_eq]': clienteId,
      fields: 'id,email,first_name,last_name,preferencias',
      limit: '-1',
    },
  });
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

function nombreDe(u) {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return n || u?.email || 'Alguien';
}

function recorte(s, n = 140) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function etiquetaPublicacion(p) {
  const d = parseFechaPublicacion(p?.fecha_publicacion);
  const fecha = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '';
  return [p?.tipo_contenido, fecha].filter(Boolean).join(' · ') || 'publicación';
}

/**
 * Crea la notificación para una lista de usuarios y envía los emails.
 * @param {object} opts { usuarios, tipo, titulo, cuerpo, url, publicacionId }
 */
async function crearPara({ usuarios, tipo, titulo, cuerpo, url, publicacionId = null }) {
  const conPrefs = (usuarios ?? [])
    .filter((u) => u?.id)
    .map((u) => ({ ...u, prefs: normalizarPrefs(u.preferencias) }));

  // Preferencia "Avisarme de": si el usuario no quiere este tipo, no se le
  // crea ni la campanita ni el email.
  const recipients = (tipo === 'comentario' || tipo === 'estado')
    ? conPrefs.filter((u) => u.prefs.notifTipos.includes(tipo))
    : conPrefs;

  if (recipients.length === 0) return;
  if (!token()) {
    console.warn('[notificaciones] sin PUBLIC_DIRECTUS_STATIC_TOKEN: se omiten');
    return;
  }

  const rows = recipients.map((u) => ({
    usuario: u.id,
    tipo,
    titulo,
    cuerpo: cuerpo ?? null,
    url: url ?? null,
    publicacion_id: publicacionId,
    leida: false,
    // 'nunca' → la fila nace como "email ya enviado" para que el digest no
    // la recoja nunca. Con 'diario' queda false y la envía el resumen.
    email_enviado: u.prefs.notifEmail === 'nunca',
  }));

  const r = await directusFetch({
    path: '/items/notificaciones',
    method: 'POST',
    token: token(),
    body: rows,
  });
  if (!r.ok) {
    console.error('[notificaciones] no se pudieron crear:', r.status, r.raw);
    return;
  }

  // Emails (best-effort, uno a uno; no bloquea el flujo si falla).
  if (!smtpConfigurado()) return;
  const enlace = url ? `\n\n${APP_URL}${url}` : '';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <p style="font-size:12px;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin:0 0 8px">Studio mb · Calendario</p>
      <h2 style="font-size:18px;color:#111827;margin:0 0 12px">${escapeHtml(titulo)}</h2>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">${escapeHtml(cuerpo ?? '')}</p>
      ${url ? `<p style="margin:0 0 16px"><a href="${APP_URL}${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Abrir en el calendario</a></p>` : ''}
      <p style="font-size:11px;color:#9ca3af;margin:24px 0 0">Recibes este email porque tienes cuenta en el calendario editorial de Studio mb.</p>
    </div>`;

  for (const u of recipients) {
    if (!u.email) continue;
    // 'nunca' → sin email; 'diario' → lo manda el resumen de las 9:00.
    if (u.prefs.notifEmail !== 'instante') continue;
    const res = await sendEmail({
      to: u.email,
      subject: `[Studio mb] ${titulo}`,
      text: `${titulo}\n\n${cuerpo ?? ''}${enlace}`,
      html,
    });
    if (res.ok) {
      // Marcamos email_enviado en la fila correspondiente (bulk update de
      // Directus 12: { data, query }).
      await directusFetch({
        path: '/items/notificaciones',
        method: 'PATCH',
        token: token(),
        body: {
          data: { email_enviado: true },
          query: {
            filter: {
              usuario: { _eq: u.id },
              titulo: { _eq: titulo },
              email_enviado: { _eq: false },
              ...(publicacionId ? { publicacion_id: { _eq: publicacionId } } : {}),
            },
          },
        },
      });
    }
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Notifica un comentario nuevo.
 * @param {object} opts { autor, publicacion, texto }
 */
export async function notificarComentario({ autor, publicacion, texto }) {
  try {
    if (!autor || !publicacion) return;
    const autorEsCliente = esCliente(autor);
    const usuarios = autorEsCliente
      ? await usuariosEquipo()
      : await usuariosDeCliente(publicacion.cliente_id);

    const etiqueta = etiquetaPublicacion(publicacion);
    const titulo = autorEsCliente
      ? `Nuevo comentario de ${nombreDe(autor)}`
      : 'Nuevo comentario del equipo';
    const cuerpo = `${recorte(texto, 200)}\n\nSobre: ${etiqueta}`;

    await crearPara({
      usuarios,
      tipo: 'comentario',
      titulo,
      cuerpo,
      url: '/dashboard',
      publicacionId: publicacion.id ?? null,
    });
  } catch (err) {
    console.error('[notificaciones] comentario:', err?.message ?? err);
  }
}

/**
 * Notifica un cambio de estado relevante.
 * @param {object} opts { actor, publicacion, anterior, nuevo }
 */
export async function notificarEstado({ actor, publicacion, anterior, nuevo }) {
  try {
    if (!publicacion) return;
    const etiqueta = etiquetaPublicacion(publicacion);

    let usuarios = [];
    let titulo = '';
    let url = '/dashboard';

    switch (nuevo) {
      case 'revision':
        usuarios = await usuariosDeCliente(publicacion.cliente_id);
        titulo = 'Nuevo post para revisar';
        url = '/dashboard/pendientes';
        break;
      case 'borrador':
        // Solo cuando el cliente rechaza el texto (revision → borrador).
        if (anterior !== 'revision' || !esCliente(actor)) return;
        usuarios = await usuariosEquipo();
        titulo = 'El cliente pidió cambios en el texto';
        break;
      case 'en_diseno':
        usuarios = await usuariosEquipo();
        titulo = 'El cliente confirmó el texto';
        break;
      case 'revision_diseno':
        usuarios = await usuariosDeCliente(publicacion.cliente_id);
        titulo = 'Diseño listo para aprobar';
        url = '/dashboard/pendientes';
        break;
      case 'aprobado':
        usuarios = await usuariosEquipo();
        titulo = 'El cliente aprobó el diseño';
        break;
      case 'publicado':
        usuarios = await usuariosDeCliente(publicacion.cliente_id);
        titulo = 'Publicación marcada como publicada';
        break;
      default:
        return;
    }

    const cuerpo = `${etiqueta}${anterior ? ` · ${anterior} → ${nuevo}` : ''}`;
    await crearPara({
      usuarios,
      tipo: 'estado',
      titulo,
      cuerpo,
      url,
      publicacionId: publicacion.id ?? null,
    });
  } catch (err) {
    console.error('[notificaciones] estado:', err?.message ?? err);
  }
}
