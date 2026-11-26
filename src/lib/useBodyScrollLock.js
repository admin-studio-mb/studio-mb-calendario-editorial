import { useEffect } from 'react';

// Bloquea el scroll de la página mientras hay un modal abierto. El scroll
// interno del modal sigue funcionando. Se lleva un contador para que dos
// modales superpuestos (por ejemplo, editar y ver historial) no se pisen al
// restaurar el estilo del body.
let abiertos = 0;
let overflowPrevio = '';

export default function useBodyScrollLock(activo) {
  useEffect(() => {
    if (!activo) return undefined;

    if (abiertos === 0) overflowPrevio = document.body.style.overflow;
    abiertos += 1;
    document.body.style.overflow = 'hidden';

    return () => {
      abiertos = Math.max(0, abiertos - 1);
      if (abiertos === 0) document.body.style.overflow = overflowPrevio;
    };
  }, [activo]);
}
