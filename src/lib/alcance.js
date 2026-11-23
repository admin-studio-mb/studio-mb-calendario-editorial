// ============================================================================
//  src/lib/alcance.js
// ----------------------------------------------------------------------------
//  "Cliente activo" del equipo: limita calendario y pendientes a un cliente
//  mientras se navega. Se guarda en cookie para que el SSR pueda filtrar.
// ============================================================================

export const CLIENTE_COOKIE = 'studio_mb_cliente';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee el cliente activo de las cookies de Astro (solo ids válidos). */
export function clienteActivoDe(cookies) {
  const valor = cookies?.get?.(CLIENTE_COOKIE)?.value ?? '';
  return UUID_RE.test(valor) ? valor : null;
}

/** Fija (o limpia con null) el cliente activo desde el navegador. */
export function fijarClienteActivo(id) {
  if (typeof document === 'undefined') return;
  if (id) {
    document.cookie = `${CLIENTE_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } else {
    document.cookie = `${CLIENTE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}
