// ============================================================================
//  src/lib/initials.js
// ----------------------------------------------------------------------------
//  Helper para obtener las iniciales (1-2 chars) del nombre de un usuario de
//  Directus, con fallback al email.
// ============================================================================

/**
 * @param {{ first_name?: string|null, last_name?: string|null, email?: string|null }|null|undefined} user
 * @returns {string}
 */
export function initials(user) {
  if (!user) return '?';
  const first = (user.first_name ?? '').trim();
  const last = (user.last_name ?? '').trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  // Si solo hay uno de los dos, devolvemos la PRIMERA letra (no dos) para
  // distinguir "no conozco el segundo nombre" de "solo conozco uno".
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();
  const email = (user.email ?? '').trim();
  if (email) {
    const local = email.split('@')[0] ?? '';
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0][0].toUpperCase();
  }
  return '?';
}
