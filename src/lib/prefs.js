// ============================================================================
//  src/lib/prefs.js
// ----------------------------------------------------------------------------
//  Preferencias de UI por usuario (columna JSON `directus_users.preferencias`).
//
//  Claves soportadas (whitelist — lo demás se descarta):
//    panelNueva:   boolean → mostrar el panel "Nueva publicación"
//    notifEmail:   'instante' | 'diario' | 'nunca'
//    notifTipos:   array de 'comentario' | 'estado'
// ============================================================================

export const NOTIF_EMAIL_OPCIONES = [
  { value: 'instante', label: 'Al instante' },
  { value: 'diario', label: 'Resumen diario' },
  { value: 'nunca', label: 'Nunca (solo campanita)' },
];

export const NOTIF_TIPOS_OPCIONES = [
  { value: 'comentario', label: 'Comentarios nuevos' },
  { value: 'estado', label: 'Cambios de estado' },
];

const EMAIL_VALUES = NOTIF_EMAIL_OPCIONES.map((o) => o.value);
const TIPO_VALUES = NOTIF_TIPOS_OPCIONES.map((o) => o.value);

export const DEFAULT_PREFS = {
  panelNueva: true,
  notifEmail: 'instante',
  notifTipos: [...TIPO_VALUES],
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

  const out = { ...DEFAULT_PREFS, notifTipos: [...DEFAULT_PREFS.notifTipos] };

  if (typeof obj.panelNueva === 'boolean') out.panelNueva = obj.panelNueva;
  if (EMAIL_VALUES.includes(obj.notifEmail)) out.notifEmail = obj.notifEmail;
  if (Array.isArray(obj.notifTipos)) {
    out.notifTipos = obj.notifTipos.filter((t) => TIPO_VALUES.includes(t));
  }

  return out;
}

/**
 * Valida un PATCH parcial de preferencias.
 * Solo devuelve las claves presentes y válidas; si alguna está presente pero
 * es inválida, devuelve error (400) en vez de ignorarla en silencio.
 *
 * @param {unknown} body
 * @returns {{patch: object, error: string|null}}
 */
export function parchearPrefs(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { patch: {}, error: 'Body inválido.' };
  }

  const patch = {};

  if (body.panelNueva !== undefined) {
    if (typeof body.panelNueva !== 'boolean') {
      return { patch: {}, error: 'panelNueva debe ser boolean.' };
    }
    patch.panelNueva = body.panelNueva;
  }

  if (body.notifEmail !== undefined) {
    if (!EMAIL_VALUES.includes(body.notifEmail)) {
      return { patch: {}, error: `notifEmail debe ser: ${EMAIL_VALUES.join(', ')}.` };
    }
    patch.notifEmail = body.notifEmail;
  }

  if (body.notifTipos !== undefined) {
    if (!Array.isArray(body.notifTipos)) {
      return { patch: {}, error: 'notifTipos debe ser un array.' };
    }
    const tipos = body.notifTipos.filter((t) => TIPO_VALUES.includes(t));
    if (tipos.length !== body.notifTipos.length) {
      return { patch: {}, error: `notifTipos solo admite: ${TIPO_VALUES.join(', ')}.` };
    }
    patch.notifTipos = [...new Set(tipos)];
  }

  return { patch, error: null };
}

/** Preferencias de un usuario de Directus (locals.user). */
export function prefsDe(user) {
  return normalizarPrefs(user?.preferencias);
}
