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
import { ESTADO_LABEL } from './flujo.js';
import { redNombre } from './redes.js';
import { parseFechaPublicacion } from './fecha.js';
import { normalizarPrefs } from './prefs.js';
import {
  asuntoNotificacion,
  construirEmailNotificacion,
  construirTextoNotificacion,
} from './email-notificaciones.js';

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

/**
 * Copia fija de avisos de estado: por defecto, Iván. Así un cambio que
 * corresponde al cliente no se pierde si el cliente no tiene usuario o no
 * tiene el email activado. Se puede cambiar con NOTIFICACIONES_ESTADO_EMAILS
 * (lista separada por comas) y se respetan las preferencias de ese usuario.
 */
const COPIA_ESTADO = (process.env.NOTIFICACIONES_ESTADO_EMAILS || 'ivan.luengo@studiomb.es')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

async function usuariosCopiaEstado() {
  if (COPIA_ESTADO.length === 0) return [];
  const r = await directusFetch({
    path: '/users',
    token: token(),
    search: {
      'filter[status][_eq]': 'active',
      'filter[email][_in]': COPIA_ESTADO.join(','),
      fields: 'id,email,first_name,last_name,preferencias',
      limit: '-1',
    },
  });
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/** Une destinatarios sin duplicados (la copia fija puede coincidir con el equipo). */
function unirUsuarios(...listas) {
  const mapa = new Map();
  for (const lista of listas) {
    for (const u of lista ?? []) {
      if (u?.id) mapa.set(u.id, u);
    }
  }
  return [...mapa.values()];
}

function nombreDe(u) {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return n || u?.email || 'Alguien';
}

function recorte(s, n = 140) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function idDe(valor) {
  return typeof valor === 'object' ? valor?.id : valor;
}

function etiquetaPublicacion(p) {
  const d = parseFechaPublicacion(p?.fecha_publicacion);
  const fecha = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '';
  return [p?.tipo_contenido, fecha].filter(Boolean).join(' · ') || 'publicación';
}

function fechaLarga(valor) {
  const d = parseFechaPublicacion(valor);
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

function fechaCorta(valor) {
  const d = parseFechaPublicacion(valor);
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '';
}

async function nombreCliente(clienteId) {
  if (!clienteId) return '';
  const r = await directusFetch({
    path: `/items/clientes/${clienteId}`,
    token: token(),
    search: { fields: 'nombre' },
  });
  return r.ok ? (r.data?.nombre ?? '') : '';
}

function mensajeEstado(anterior, nuevo, actor) {
  const key = `${anterior}->${nuevo}`;
  const mensajes = {
    'revision->en_diseno': 'El cliente ha confirmado el texto. La publicación pasa a diseño.',
    'revision->borrador': 'El cliente ha pedido cambios en el texto. Vuelve a borrador para corregirlo.',
    'revision_diseno->aprobado': 'El cliente ha aprobado el diseño. La publicación queda aprobada.',
    'revision_diseno->en_diseno': 'El cliente ha pedido cambios en el diseño. Vuelve a diseño para corregirlo.',
    'revision_conjunta->aprobado': 'El cliente ha aprobado el texto y el diseño. La publicación queda aprobada.',
    'revision_conjunta->borrador': 'El cliente ha pedido cambios en el texto. Vuelve a borrador para corregirlo.',
    'revision_conjunta->en_diseno': 'El cliente ha pedido cambios en el diseño. Vuelve a diseño para corregirlo.',
    'aprobado->publicado': 'La publicación se ha marcado como publicada.',
  };
  if (mensajes[key]) return mensajes[key];
  if (nuevo === 'revision') return 'El equipo ha enviado la publicación para que revises el texto.';
  if (nuevo === 'revision_conjunta') return 'El equipo ha enviado la publicación para que revises el texto y el diseño.';
  if (nuevo === 'revision_diseno') return 'El diseño está listo para que lo revises.';
  if (nuevo === 'aprobado') {
    return esCliente(actor)
      ? 'El cliente ha aprobado la publicación.'
      : 'La publicación ha quedado aprobada.';
  }
  const a = ESTADO_LABEL[anterior] ?? anterior ?? '—';
  const b = ESTADO_LABEL[nuevo] ?? nuevo ?? '—';
  return `La publicación ha pasado de ${a} a ${b}.`;
}

/**
 * Crea la notificación para una lista de usuarios y envía los emails.
 * @param {object} opts { usuarios, tipo, titulo, cuerpo, url, publicacionId }
 */
async function crearPara({ usuarios, tipo, titulo, cuerpo, url, publicacionId = null, email = null }) {
  const conPrefs = [...new Map(
    (usuarios ?? [])
      .filter((u) => u?.id)
      .map((u) => ({ ...u, prefs: normalizarPrefs(u.preferencias) }))
      .map((u) => [u.id, u]),
  ).values()];

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
  const enlace = url ? `${APP_URL}${url}` : null;
  const html = construirEmailNotificacion({ titulo, cuerpo, enlace, contexto: email });
  const texto = construirTextoNotificacion({ titulo, cuerpo, enlace, contexto: email });
  const asunto = asuntoNotificacion({ titulo, contexto: email });

  for (const u of recipients) {
    if (!u.email) continue;
    // 'nunca' → sin email; 'diario' → lo manda el resumen de las 9:00.
    if (u.prefs.notifEmail !== 'instante') continue;
    const res = await sendEmail({
      to: u.email,
      subject: asunto,
      text: texto,
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
    const clienteId = idDe(publicacion.cliente_id);

    let usuarios = [];
    let titulo = '';
    let url = '/dashboard';

    switch (nuevo) {
      case 'revision':
        usuarios = await usuariosDeCliente(clienteId);
        titulo = 'Nuevo post para revisar';
        url = '/dashboard/pendientes';
        break;
      case 'revision_conjunta':
        usuarios = await usuariosDeCliente(clienteId);
        titulo = 'Texto y diseño listos para revisar';
        url = '/dashboard/pendientes';
        break;
      case 'borrador':
        // Solo cuando el cliente rechaza el texto (revision → borrador) o
        // pide cambios en la revisión conjunta (texto/ambos → borrador).
        if (
          !esCliente(actor)
          || (anterior !== 'revision' && anterior !== 'revision_conjunta')
        ) return;
        usuarios = await usuariosEquipo();
        titulo = 'El cliente pidió cambios en el texto';
        break;
      case 'en_diseno':
        usuarios = await usuariosEquipo();
        titulo = anterior === 'revision_conjunta'
          ? 'El cliente pidió cambios de diseño'
          : 'El cliente confirmó el texto';
        break;
      case 'revision_diseno':
        usuarios = await usuariosDeCliente(clienteId);
        titulo = 'Diseño listo para aprobar';
        url = '/dashboard/pendientes';
        break;
      case 'aprobado':
        usuarios = await usuariosEquipo();
        titulo = anterior === 'revision_conjunta'
          ? 'El cliente aprobó texto y diseño'
          : 'El cliente aprobó el diseño';
        break;
      case 'publicado':
        usuarios = await usuariosDeCliente(clienteId);
        titulo = 'Publicación marcada como publicada';
        break;
      default:
        return;
    }

    // Copia fija (Iván por defecto): recibe también los avisos cuyo
    // destinatario natural es el cliente. Se respetan sus preferencias.
    usuarios = unirUsuarios(usuarios, await usuariosCopiaEstado());

    const anteriorLabel = ESTADO_LABEL[anterior] ?? anterior ?? '—';
    const nuevoLabel = ESTADO_LABEL[nuevo] ?? nuevo ?? '—';
    const clienteNombre = await nombreCliente(clienteId);
    const cuerpo = [
      etiqueta,
      `${anteriorLabel} → ${nuevoLabel}`,
      clienteNombre ? `Cliente: ${clienteNombre}` : null,
    ].filter(Boolean).join(' · ');

    const email = {
      anterior: anteriorLabel,
      anteriorClave: anterior,
      nuevo: nuevoLabel,
      nuevoClave: nuevo,
      mensaje: mensajeEstado(anterior, nuevo, actor),
      actor: actor ? nombreDe(actor) : '',
      publicacion: {
        tipo: publicacion.tipo_contenido || 'Publicación',
        formato: publicacion.formato || '',
        red: publicacion.red ? redNombre(publicacion.red) : '',
        fecha: fechaLarga(publicacion.fecha_publicacion),
        fechaCorta: fechaCorta(publicacion.fecha_publicacion),
        cliente: clienteNombre,
        copy: recorte(publicacion.copywriting, 170),
      },
    };

    await crearPara({
      usuarios,
      tipo: 'estado',
      titulo,
      cuerpo,
      url,
      publicacionId: publicacion.id ?? null,
      email,
    });
  } catch (err) {
    console.error('[notificaciones] estado:', err?.message ?? err);
  }
}
