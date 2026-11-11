// ============================================================================
//  src/lib/email.js
// ----------------------------------------------------------------------------
//  Envío de emails vía SMTP (nodemailer). Configuración por entorno:
//    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
//
//  Si falta host/user/pass → no se envía y se avisa UNA vez por log.
//  Nunca lanza: los fallos de email no deben romper la petición del usuario.
// ============================================================================

import nodemailer from 'nodemailer';
import { env } from './env.js';

let transport = null;
let initialized = false;
let warned = false;

function getTransport() {
  if (initialized) return transport;
  initialized = true;

  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (!warned) {
      console.warn('[email] SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS); emails desactivados.');
      warned = true;
    }
    return null;
  }

  const port = Number(env.SMTP_PORT || 587);
  const secure = env.SMTP_SECURE
    ? String(env.SMTP_SECURE).toLowerCase() === 'true'
    : port === 465;

  transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return transport;
}

/**
 * Envía un email. Devuelve { ok, reason? }. Nunca lanza.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { ok: false, reason: 'sin-destinatario' };
  const t = getTransport();
  if (!t) return { ok: false, reason: 'no-configurado' };

  try {
    await t.sendMail({
      from: env.SMTP_FROM || 'Studio mb <no-reply@studiomb.es>',
      to,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error('[email] fallo enviando a', to, '→', err?.message ?? err);
    return { ok: false, reason: err?.message ?? 'error' };
  }
}

/** ¿Hay SMTP configurado? Útil para marcar email_enviado con criterio. */
export function smtpConfigurado() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
