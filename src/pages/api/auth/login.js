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
    const { access_token, expires } = await login(email, password);
    // expires viene en ms; lo convertimos a segundos para maxAge.
    const maxAge = Math.max(60, Math.floor((expires - Date.now()) / 1000));
    saveSession(cookies, access_token, maxAge);
    return redirect(next.startsWith('/') ? next : '/dashboard', 303);
  } catch (err) {
    console.error('[auth/login]', err);
    return redirect('/login?error=invalid', 303);
  }
}
