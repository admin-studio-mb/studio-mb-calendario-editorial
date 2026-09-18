// ============================================================================
//  src/lib/auth.js
// ----------------------------------------------------------------------------
//  Helpers para el flujo de autenticación contra Directus:
//
//    - login(email, password)        → POST a /auth/login, devuelve JWT.
//    - logout(token)                 → POST a /auth/logout.
//    - saveSession(cookies, token)   → guarda JWT en cookie HttpOnly.
//    - clearSession(cookies)         → borra la cookie.
//    - getCurrentUser(cookies)       → lee /users/me con el JWT de la cookie.
//
//  La cookie es HttpOnly + Secure + SameSite=Lax para impedir que JS la lea
//  y mitigar CSRF básico. El JWT vive 15 min por defecto; Directus lo
//  refresca automáticamente si usamos el flujo cookie-based, pero para
//  mantenerlo simple guardamos el `access_token` y dejamos que el frontend
//  pida uno nuevo al expirar.
// ============================================================================

import { env } from './env.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Llama a Directus /auth/login con email+password.
 * @returns {Promise<{access_token: string, expires: number, refresh_token?: string}>}
 */
export async function login(email, password) {
  const url = `${env.DIRECTUS_INTERNAL_URL}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, mode: 'json' }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login fallido (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * Invalida el token en Directus (best-effort, no bloquea).
 */
export async function logout(token) {
  if (!token) return;
  try {
    await fetch(`${env.DIRECTUS_INTERNAL_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (_) { /* noop */ }
}

/**
 * Persiste el JWT en una cookie HttpOnly.
 * @param {import('astro').AstroCookies} cookies
 */
export function saveSession(cookies, token, expiresInSeconds = 60 * 60 * 8) {
  cookies.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: expiresInSeconds,
  });
}

/**
 * Borra la cookie de sesión (logout local).
 */
export function clearSession(cookies) {
  cookies.delete(env.SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Devuelve el usuario autenticado o null si el token no es válido.
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_INTERNAL_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data;
  } catch {
    return null;
  }
}
