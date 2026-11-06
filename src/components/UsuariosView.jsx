// ============================================================================
//  src/components/UsuariosView.jsx
// ----------------------------------------------------------------------------
//  Gestión de usuarios de la app (solo Administrator):
//    - Lista con rol, cliente asignado y estado.
//    - Crear / editar / suspender / borrar.
//    - Los usuarios Cliente deben llevar un cliente asignado.
//
//  Habla con /api/usuarios (GET/POST) y /api/usuarios/:id (PATCH/DELETE),
//  que a su vez validan el rol en servidor.
// ============================================================================

import { useState } from 'react';
import { ROL } from '../lib/roles.js';

const ROL_LABEL = {
  [ROL.ADMIN]: 'Administrador',
  [ROL.EDITOR]: 'Editor',
  [ROL.CLIENTE]: 'Cliente',
};

const ROL_BADGE = {
  [ROL.ADMIN]: 'bg-brand-50 text-brand-700 border-brand-200',
  [ROL.EDITOR]: 'bg-purple-50 text-purple-700 border-purple-200',
  [ROL.CLIENTE]: 'bg-blue-50 text-blue-700 border-blue-200',
};

const inputBase = 'w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-800 placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition disabled:bg-ink-50 disabled:text-ink-400';

function Field({ label, hint, children }) {
  return (
    <div className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400 mt-1">{hint}</span>}
    </div>
  );
}

export default function UsuariosView({ initialUsuarios = [], clientes = [], currentUserId = '' }) {
  const [usuarios, setUsuarios] = useState(initialUsuarios);
  const [modal, setModal] = useState(null); // null | 'new' | usuario
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function handleSaved(saved) {
    setModal(null);
    if (!saved || !saved.id) return;
    setUsuarios((arr) => {
      const idx = arr.findIndex((u) => u.id === saved.id);
      if (idx === -1) return [...arr, saved];
      const copy = [...arr];
      copy[idx] = { ...copy[idx], ...saved };
      return copy;
    });
  }

  async function patchUsuario(u, patch) {
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const saved = await res.json().catch(() => null);
      if (saved && saved.id) {
        setUsuarios((arr) => arr.map((x) => (x.id === saved.id ? saved : x)));
      }
    } catch (err) {
      setError(err.message ?? 'Error actualizando el usuario.');
    } finally {
      setBusyId(null);
    }
  }

  async function borrar(u) {
    if (!confirm(`¿Borrar el usuario "${u.email}"? Esta acción no se puede deshacer.`)) return;
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          msg = parsed.detail ? `${parsed.error} ${parsed.detail}` : (parsed.error ?? msg);
        } catch { /* noop */ }
        throw new Error(msg);
      }
      setUsuarios((arr) => arr.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err.message ?? 'Error borrando el usuario.');
    } finally {
      setBusyId(null);
    }
  }

  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <>
      <div className="card p-4 md:p-5 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-400 font-medium">Equipo y clientes</p>
          <p className="mt-1 text-sm text-ink-600">
            Crea usuarios <strong>Cliente</strong> (ven solo su contenido), <strong>Editor</strong> (trabajan con todos los clientes) o <strong>Administrador</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal('new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-medium shadow-sm hover:shadow-md transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3 mb-4">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/50 text-ink-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Usuario</th>
                <th className="px-5 py-3 text-left font-semibold">Rol</th>
                <th className="px-5 py-3 text-left font-semibold">Cliente</th>
                <th className="px-5 py-3 text-left font-semibold">Estado</th>
                <th className="px-5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {usuarios.map((u) => {
                const rol = u.role?.name ?? '';
                const yo = u.id === currentUserId;
                const suspendido = u.status !== 'active';
                return (
                  <tr key={u.id} className="hover:bg-ink-50/40 transition">
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900 truncate">
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                          {yo && <span className="ml-2 text-[10px] uppercase tracking-wider text-brand-600 font-semibold">tú</span>}
                        </p>
                        <p className="text-xs text-ink-400 truncate">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${ROL_BADGE[rol] ?? 'bg-ink-50 text-ink-600 border-ink-200'}`}>
                        {ROL_LABEL[rol] ?? rol ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {rol === ROL.CLIENTE ? nombreCliente(u.cliente_id) : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${suspendido ? 'text-amber-600' : 'text-emerald-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${suspendido ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                        {suspendido ? 'Suspendido' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setModal(u)}
                          className="p-1.5 rounded-md text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        {!yo && (
                          <button
                            type="button"
                            onClick={() => patchUsuario(u, { status: suspendido ? 'active' : 'suspended' })}
                            disabled={busyId === u.id}
                            className="p-1.5 rounded-md text-ink-500 hover:text-amber-600 hover:bg-amber-50 transition disabled:opacity-50"
                            title={suspendido ? 'Reactivar' : 'Suspender'}
                          >
                            {suspendido ? (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 14M19 12a7 7 0 01-7 7 7 7 0 01-4.9-2"/><circle cx="12" cy="12" r="7"/></svg>
                            ) : (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5"/></svg>
                            )}
                          </button>
                        )}
                        {!yo && (
                          <button
                            type="button"
                            onClick={() => borrar(u)}
                            disabled={busyId === u.id}
                            className="p-1.5 rounded-md text-ink-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                            title="Borrar"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-ink-500">
                    No hay usuarios todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-ink-100 bg-white">
              <div>
                <h3 className="text-base font-semibold text-ink-900">
                  {modal === 'new' ? 'Nuevo usuario' : 'Editar usuario'}
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  {modal === 'new' ? 'Crea el acceso de un cliente o de alguien del equipo.' : `Modifica a "${modal.email}".`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            <div className="p-5">
              <UsuarioForm
                initial={modal === 'new' ? {} : modal}
                clientes={clientes}
                isSelf={modal !== 'new' && modal.id === currentUserId}
                onCancel={() => setModal(null)}
                onSaved={handleSaved}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UsuarioForm({ initial = {}, clientes = [], isSelf = false, onCancel, onSaved }) {
  const isEdit = Boolean(initial.id);
  const [email, setEmail] = useState(initial.email ?? '');
  const [firstName, setFirstName] = useState(initial.first_name ?? '');
  const [lastName, setLastName] = useState(initial.last_name ?? '');
  const [rol, setRol] = useState(initial.role?.name ?? ROL.CLIENTE);
  const [clienteId, setClienteId] = useState(initial.cliente_id ?? '');
  const [status, setStatus] = useState(initial.status === 'suspended' ? 'suspended' : 'active');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!isEdit && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (rol === ROL.CLIENTE && !clienteId) return setError('Elige el cliente al que pertenece este usuario.');
    if (isEdit && password && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');

    const body = {
      first_name: firstName,
      last_name: lastName,
      role: rol,
      cliente_id: rol === ROL.CLIENTE ? clienteId : null,
    };
    if (isEdit) {
      if (!isSelf) body.status = status;
      if (password) body.password = password;
    } else {
      body.email = email;
      body.password = password;
    }

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/usuarios/${initial.id}` : '/api/usuarios', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Error (${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const saved = await res.json().catch(() => null);
      onSaved(saved);
    } catch (err) {
      setError(err.message ?? 'Error guardando el usuario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{error}</div>
      )}

      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isEdit}
          required
          className={inputBase}
          placeholder="cliente@empresa.com"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre">
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputBase} placeholder="Nombre" />
        </Field>
        <Field label="Apellidos">
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputBase} placeholder="Apellidos" />
        </Field>
      </div>

      <Field
        label="Rol"
        hint={isSelf ? 'No puedes cambiarte el rol a ti mismo.' : 'Cliente: solo su contenido. Editor: todos los clientes. Administrador: todo.'}
      >
        <select value={rol} onChange={(e) => setRol(e.target.value)} disabled={isSelf} className={inputBase}>
          <option value={ROL.CLIENTE}>Cliente</option>
          <option value={ROL.EDITOR}>Editor</option>
          <option value={ROL.ADMIN}>Administrador</option>
        </select>
      </Field>

      {rol === ROL.CLIENTE && (
        <Field label="Cliente asignado" hint="El usuario solo verá publicaciones de este cliente.">
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required className={inputBase}>
            <option value="" disabled>— Selecciona —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Field>
      )}

      {isEdit && !isSelf && (
        <Field label="Estado">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputBase}>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </select>
        </Field>
      )}

      <Field
        label={isEdit ? 'Contraseña (opcional)' : 'Contraseña'}
        hint={isEdit ? 'Déjalo vacío para no cambiarla. Mínimo 8 caracteres.' : 'Mínimo 8 caracteres.'}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!isEdit}
          minLength={8}
          autoComplete="new-password"
          className={inputBase}
          placeholder="••••••••"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-100 transition">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-medium shadow-sm hover:shadow-md disabled:opacity-50 transition"
        >
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}
