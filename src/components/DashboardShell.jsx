// ============================================================================
//  src/components/DashboardShell.jsx
// ----------------------------------------------------------------------------
//  Layout del dashboard que decide si el panel "Nueva publicación" se muestra
//  fijo a la derecha (preferencia panelNueva) o se sustituye por un botón
//  "Añadir publicación" en la barra de filtros que abre el formulario en modal.
//
//  Se renderiza como isla única para que el cambio de preferencia no obligue
//  a reestructurar el HTML del SSR.
// ============================================================================

import { useState } from 'react';
import Calendar from './Calendar.jsx';
import FeedMockup from './FeedMockup.jsx';
import PostForm from './PostForm.jsx';

export default function DashboardShell({
  publicaciones = [],
  clientes = [],
  initialFeed = [],
  mostrarPanel = true,
  puedeCrear = true,
}) {
  const panelFijo = puedeCrear && mostrarPanel !== false;
  const [modalNueva, setModalNueva] = useState(false);

  return (
    <>
      <section className={panelFijo
        ? 'grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6'
        : 'grid grid-cols-1 gap-4 lg:gap-6'}
      >
        <div className={panelFijo
          ? 'lg:col-span-2 space-y-4 lg:space-y-6 order-1'
          : 'space-y-4 lg:space-y-6 order-1'}
        >
          <Calendar
            initialPublicaciones={publicaciones}
            clientes={clientes}
            mostrarBotonNueva={puedeCrear && !panelFijo}
            onNuevaPublicacion={() => setModalNueva(true)}
          />
          <div className="hidden lg:block">
            <FeedMockup posts={initialFeed} />
          </div>
        </div>

        {panelFijo && (
          <aside className="space-y-4 lg:space-y-6 order-2 lg:order-3">
            <PostForm clientes={clientes} />
          </aside>
        )}

        {/* FeedMockup en móvil: abajo del todo */}
        <div className="lg:hidden order-3">
          <FeedMockup posts={initialFeed} />
        </div>
      </section>

      {/* Modal "Añadir publicación" (cuando el panel lateral está oculto) */}
      {modalNueva && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setModalNueva(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <PostForm
              clientes={clientes}
              onCancel={() => setModalNueva(false)}
              onSubmitted={() => setModalNueva(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
