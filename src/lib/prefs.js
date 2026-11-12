// ============================================================================
//  src/lib/prefs.js
// ----------------------------------------------------------------------------
//  Preferencias de UI por usuario (columna JSON `directus_users.preferencias`).
//
//  Claves soportadas (whitelist — lo demás se descarta):
//    panelNueva: boolean  → mostrar el panel "Nueva publicación" en el calendario
// ============================================================================

export const DEFAULT_PREFS = {
  panelNueva: true,
};

export const PREFS_VALIDAS = Object.keys(DEFAULT_PREFS);

/**
 * Normaliza el valor de `preferencias` (objeto, string JSON o null) aplicando
 * defaults y descartando claves desconocidas o de tipo incorrecto.
 */
export function normalizarPrefs(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};

  const out = { ...DEFAULT_PREFS };
  for (const key of PREFS_VALIDAS) {
    if (typeof obj[key] === 'boolean') out[key] = obj[key];
  }
  return out;
}

/** Preferencias de un usuario de Directus (locals.user). */
export function prefsDe(user) {
  return normalizarPrefs(user?.preferencias);
}
