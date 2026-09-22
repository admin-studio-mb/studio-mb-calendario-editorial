// ============================================================================
//  POST /api/auth/login
//  Recibe { email, password, next }, llama a Directus, guarda el JWT en
//  cookie HttpOnly y redirige a `next` (o /dashboard).
// ============================================================================

import { login, saveSession } from '../../../lib/auth.js';

export const prerender = false;

export async function POST({ request, cookies, redirect }) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/dashboard');

  if (!email || !password) {
    return redirect('/login?error=missing', 303);
  }

  try {
    const { access_token, expires, expires_in } = await login(email, password);
    // Directus 12 devuelve `expires` en ms epoch (ej. 604800000 = 1 semana).
    // Si llega `expires_in`, va en segundos.
    let maxAge = 60 * 60 * 8;
    if (typeof expires_in === 'number' && Number.isFinite(expires_in) && expires_in > 0) {
      maxAge = Math.max(60, Math.floor(expires_in));
    } else if (typeof expires === 'number' && Number.isFinite(expires) && expires > Date.now()) {
      // expires en ms epoch → convertir a segundos hasta ahora.
      maxAge = Math.max(60, Math.floor((expires - Date.now()) / 1000));
    }
    saveSession(cookies, access_token, maxAge);
    return redirect(next.startsWith('/') ? next : '/dashboard', 303);
  } catch (err) {
    console.error('[auth/login]', err);
    return redirect('/login?error=invalid', 303);
  }
}
