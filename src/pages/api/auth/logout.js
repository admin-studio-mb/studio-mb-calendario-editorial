// ============================================================================
//  POST /api/auth/logout
//  Invalida el token en Directus y borra la cookie.
// ============================================================================

import { logout, clearSession } from '../../../lib/auth.js';
import { env } from '../../../lib/env.js';

export const prerender = false;

export async function POST({ cookies, redirect }) {
  const token = cookies.get(env.SESSION_COOKIE_NAME)?.value;
  await logout(token);
  clearSession(cookies);
  return redirect('/login', 303);
}
