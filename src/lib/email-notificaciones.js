// ============================================================================
//  src/lib/email-notificaciones.js
// ----------------------------------------------------------------------------
//  Plantillas de email para avisos del calendario. Sin dependencias de Astro
//  ni de Directus: se pueden probar y previsualizar por separado.
//
//  El email de cambio de estado explica qué ha pasado, en qué publicación,
//  de qué estado a cuál y quién lo hizo. El de comentario mantiene una
//  tarjeta sencilla con el texto y el enlace.
// ============================================================================

const BRAND = '#4f46e5';
const INK = '#171717';
const MUTED = '#78716c';
const SOFT = '#a8a29e';
const BORDER = '#e7e5e4';
const PAPER = '#f4f2ee';
const CARD = '#faf9f7';

const ESTADO_COLOR = {
  borrador: { bg: '#fef3c7', fg: '#92400e' },
  revision: { bg: '#dbeafe', fg: '#1d4ed8' },
  en_diseno: { bg: '#ede9fe', fg: '#6d28d9' },
  revision_diseno: { bg: '#fce7f3', fg: '#be185d' },
  revision_conjunta: { bg: '#e0e7ff', fg: '#3730a3' },
  aprobado: { bg: '#d1fae5', fg: '#047857' },
  publicado: { bg: '#ccfbf1', fg: '#0f766e' },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

function badge(estado, label, actual = false) {
  const color = ESTADO_COLOR[estado] ?? { bg: '#f5f5f4', fg: '#57534e' };
  return `<span style="display:inline-block;background:${color.bg};color:${color.fg};font:700 11px Arial,Helvetica,sans-serif;padding:5px 10px;border-radius:999px;${actual ? `border:1px solid ${color.fg};` : ''}">${esc(label)}</span>`;
}

function capitalizar(s) {
  const t = String(s ?? '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Asunto del email. Para estados incluye el tipo de publicación y la fecha
 * para que se entienda sin abrir el mensaje.
 */
export function asuntoNotificacion({ titulo, contexto = null }) {
  const p = contexto?.publicacion;
  const extra = [p?.tipo, p?.fechaCorta].filter(Boolean).join(' · ');
  return `[Studio mb] ${titulo}${extra ? ` · ${extra}` : ''}`;
}

/**
 * Cuerpo HTML del email.
 *
 * contexto = {
 *   anterior, nuevo, mensaje, actor,
 *   publicacion: { tipo, formato, red, fecha, fechaCorta, cliente, copy }
 * }
 */
export function construirEmailNotificacion({ titulo, cuerpo = '', enlace = null, contexto = null }) {
  const p = contexto?.publicacion;
  const transicion = contexto
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:12px;border-collapse:separate;margin:22px 0">
        <tr>
          <td style="padding:16px 18px 0;font:700 9px Arial,Helvetica,sans-serif;letter-spacing:1.4px;color:${SOFT};text-transform:uppercase">Cambio de estado</td>
        </tr>
        <tr>
          <td style="padding:10px 18px 0">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;padding-right:8px">
                  <div style="font:700 8px Arial,Helvetica,sans-serif;letter-spacing:1px;color:${SOFT};margin-bottom:4px">ANTES</div>
                  ${badge(contexto.anteriorClave, contexto.anterior)}
                </td>
                <td style="vertical-align:middle;padding:10px 8px 0;color:${SOFT};font:700 14px Arial,Helvetica,sans-serif">→</td>
                <td style="vertical-align:top">
                  <div style="font:700 8px Arial,Helvetica,sans-serif;letter-spacing:1px;color:${SOFT};margin-bottom:4px">AHORA</div>
                  ${badge(contexto.nuevoClave, contexto.nuevo, true)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px 0;font:700 16px Arial,Helvetica,sans-serif;color:${INK}">${esc(p?.tipo || 'Publicación')}</td>
        </tr>
        <tr>
          <td style="padding:4px 18px 0;font:400 12px Arial,Helvetica,sans-serif;color:${MUTED}">
            ${[p?.cliente, p?.fecha, capitalizar(p?.formato), p?.red].filter(Boolean).map(esc).join(' · ')}
          </td>
        </tr>
        ${p?.copy ? `
        <tr>
          <td style="padding:12px 18px 0;font:700 8px Arial,Helvetica,sans-serif;letter-spacing:1.2px;color:${SOFT};text-transform:uppercase">Texto de la publicación</td>
        </tr>
        <tr>
          <td style="padding:4px 18px 0;font:italic 13px/1.5 Georgia,serif;color:#57534e">“${esc(p.copy)}”</td>
        </tr>` : ''}
        ${contexto.actor ? `
        <tr>
          <td style="padding:12px 18px 18px;font:400 11px Arial,Helvetica,sans-serif;color:${SOFT}">Cambio realizado por ${esc(contexto.actor)}</td>
        </tr>` : ''}
      </table>`
    : '';

  const intro = contexto?.mensaje || cuerpo;
  const cta = enlace
    ? `<p style="margin:22px 0 0"><a href="${esc(enlace)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:9px;font:700 13px Arial,Helvetica,sans-serif">Abrir publicación en el calendario</a></p>`
    : '';

  return `
    <div style="margin:0;padding:0;background:${PAPER}">
      <div style="max-width:600px;margin:0 auto;padding:28px 16px;font-family:Arial,Helvetica,sans-serif">
        <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
          <div style="height:6px;background:${BRAND}"></div>
          <div style="padding:28px 28px 24px">
            <p style="margin:0 0 10px;font:700 9px Arial,Helvetica,sans-serif;letter-spacing:1.8px;color:${MUTED};text-transform:uppercase">Studio mb · Calendario editorial</p>
            <h1 style="margin:0 0 10px;font:700 22px/1.25 Arial,Helvetica,sans-serif;color:${INK}">${esc(titulo)}</h1>
            <p style="margin:0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#57534e">${nl2br(intro)}</p>
            ${transicion}
            ${cta}
          </div>
          <div style="padding:14px 28px 20px;border-top:1px solid ${BORDER};background:${CARD}">
            <p style="margin:0;font:400 11px/1.5 Arial,Helvetica,sans-serif;color:${SOFT}">Recibes este email porque tienes cuenta en el calendario editorial de Studio mb.</p>
          </div>
        </div>
        <p style="margin:14px 0 0;text-align:center;font:400 10px Arial,Helvetica,sans-serif;color:${SOFT}">Studio mb · calendario editorial</p>
      </div>
    </div>`;
}

/** Versión en texto plano, para clientes de correo sin HTML. */
export function construirTextoNotificacion({ titulo, cuerpo = '', enlace = null, contexto = null }) {
  const p = contexto?.publicacion;
  const lineas = [titulo, ''];
  lineas.push(contexto?.mensaje || cuerpo);
  if (contexto) {
    lineas.push('', `Cambio: ${contexto.anterior} → ${contexto.nuevo}`);
    if (p) {
      lineas.push(
        `Publicación: ${[p.tipo, p.formato, p.red].filter(Boolean).join(' · ')}`,
      );
      if (p.cliente) lineas.push(`Cliente: ${p.cliente}`);
      if (p.fecha) lineas.push(`Fecha: ${p.fecha}`);
      if (p.copy) lineas.push(`Copy: “${p.copy}”`);
    }
    if (contexto.actor) lineas.push(`Cambio realizado por: ${contexto.actor}`);
  }
  if (enlace) lineas.push('', `Abrir: ${enlace}`);
  lineas.push('', '— Studio mb · calendario editorial');
  return lineas.join('\n');
}
