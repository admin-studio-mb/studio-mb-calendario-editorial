// ============================================================================
//  src/middleware.js
// ----------------------------------------------------------------------------
//  Middleware global: si la ruta requiere auth y no hay cookie válida,
//  redirige a /login. Se ejecuta antes de cada página .astro y endpoint.
// ============================================================================

import { defineMiddleware } from 'astro:middleware';
import { env } from './lib/env.js';
import { getCurrentUser } from './lib/auth.js';

// Rutas que NO requieren autenticación.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;

  // Estáticos y assets del propio Astro: dejar pasar.
  if (url.pathname.startsWith('/_astro') || url.pathname.startsWith('/favicon')) {
    return next();
  }

  // Permitir login y su endpoint.
  if (PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith('/api/auth/login')) {
    return next();
  }

  const token = cookies.get(env.SESSION_COOKIE_NAME)?.value;
  const user = token ? await getCurrentUser(token) : null;

  // Inyectamos el usuario en locals para que las páginas .astro lo lean.
  context.locals.user = user;
  context.locals.token = token ?? null;

  if (!user) {
    // API → 401; páginas → redirect a /login
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/login?next=${encodeURIComponent(url.pathname)}`);
  }

  return next();
});
