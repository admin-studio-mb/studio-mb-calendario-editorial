// ============================================================================
//  src/lib/roles.js
// ----------------------------------------------------------------------------
//  Roles de la app y helpers. Fuente única para decidir qué ve/puede cada uno.
//
//    - Administrator → admin de la agencia: todo, incluida gestión de
//      clientes y usuarios.
//    - Editor        → personal de agencia: contenido de TODOS los clientes
//      (publicaciones, diseños, comentarios), sin gestionar clientes/usuarios.
//    - Cliente       → solo su cliente: ver, comentar y confirmar.
// ============================================================================

export const ROL = {
  ADMIN: 'Administrator',
  EDITOR: 'Editor',
  CLIENTE: 'Cliente',
};

/** Nombre del rol del usuario (o null). */
export function rolDe(user) {
  return user?.role?.name ?? null;
}

export function esAdmin(user) {
  return rolDe(user) === ROL.ADMIN;
}

export function esEditor(user) {
  return rolDe(user) === ROL.EDITOR;
}

export function esCliente(user) {
  return rolDe(user) === ROL.CLIENTE;
}

/** Equipo de la agencia (admin o editor): acceso completo al contenido. */
export function esEquipo(user) {
  return esAdmin(user) || esEditor(user);
}
