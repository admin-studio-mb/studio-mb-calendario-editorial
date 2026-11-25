import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HistorialModal from './HistorialModal.jsx';

const items = [
  {
    id: 'a1',
    tipo: 'edicion',
    detalle: 'Editado: Copywriting, Fecha de publicación\n• Copywriting: «Hola» → «Hola y adiós»\n• Fecha de publicación: «2026-11-20» → «2026-11-21»',
    fecha_creacion: new Date().toISOString(),
    usuario: { first_name: 'Ivan', last_name: 'Luengo', email: 'ivan@studiomb.es' },
  },
  {
    id: 'a2',
    tipo: 'estado',
    detalle: 'Borrador → En revisión',
    estado_anterior: 'borrador',
    estado_nuevo: 'revision',
    motivo: null,
    fecha_creacion: '2026-11-20T09:15:00.000Z',
    usuario: null,
  },
  {
    id: 'a3',
    tipo: 'edicion',
    detalle: 'Editado: cliente_id, red',
    fecha_creacion: '2026-11-19T08:00:00.000Z',
    usuario: { email: 'laia@studiomb.es' },
  },
];

describe('modal de historial', () => {
  it('pinta los cambios con antes y después', () => {
    const html = renderToStaticMarkup(<HistorialModal items={items} onClose={() => {}} />);
    expect(html).toContain('Historial');
    expect(html).toContain('3 eventos');
    expect(html).toContain('Copywriting');
    expect(html).toContain('Hola');
    expect(html).toContain('Hola y adiós');
    expect(html).toContain('Ivan Luengo');
    expect(html).toContain('Cambio de estado');
    expect(html).toContain('Estado');
  });

  it('traduce los campos del formato viejo', () => {
    const html = renderToStaticMarkup(<HistorialModal items={[items[2]]} onClose={() => {}} />);
    expect(html).toContain('Campos: Cliente, Red social');
    expect(html).toContain('laia@studiomb.es');
  });

  it('agrupa por día', () => {
    const html = renderToStaticMarkup(<HistorialModal items={items} onClose={() => {}} />);
    expect(html).toContain('Hoy');
    expect(html).toContain('20 nov 2026');
    expect(html).toContain('19 nov 2026');
  });

  it('muestra el estado vacío', () => {
    const html = renderToStaticMarkup(<HistorialModal items={[]} onClose={() => {}} />);
    expect(html).toContain('Todavía no hay cambios registrados');
  });
});
