import { describe, expect, it } from 'vitest';
import {
  asuntoNotificacion,
  construirEmailNotificacion,
  construirTextoNotificacion,
} from './email-notificaciones.js';

const contexto = {
  anterior: 'Revisión texto',
  anteriorClave: 'revision',
  nuevo: 'En diseño',
  nuevoClave: 'en_diseno',
  mensaje: 'El cliente ha confirmado el texto. La publicación pasa a diseño.',
  actor: 'Camila Acosta',
  publicacion: {
    tipo: 'Promo',
    formato: 'post',
    red: 'Instagram',
    fecha: '25 de septiembre de 2026',
    fechaCorta: '25 sept',
    cliente: 'Camila Acosta Interiorisme',
    copy: 'Una casa frente al mar <con luz>',
  },
};

describe('email de notificaciones', () => {
  it('el asunto identifica qué pasó, el post y la fecha', () => {
    expect(asuntoNotificacion({ titulo: 'El cliente confirmó el texto', contexto }))
      .toBe('[Studio mb] El cliente confirmó el texto · Promo · 25 sept');
  });

  it('el HTML muestra la transición, el cliente y escapea el copy', () => {
    const html = construirEmailNotificacion({
      titulo: 'El cliente confirmó el texto',
      enlace: 'https://calendar.studiomb.es/dashboard',
      contexto,
    });
    expect(html).toContain('Cambio de estado');
    expect(html).toContain('Revisión texto');
    expect(html).toContain('En diseño');
    expect(html).toContain('Camila Acosta Interiorisme');
    expect(html).toContain('Promo');
    expect(html).toContain('25 de septiembre de 2026');
    expect(html).toContain('&lt;con luz&gt;');
    expect(html).not.toContain('<con luz>');
    expect(html).toContain('Abrir publicación en el calendario');
  });

  it('el texto plano explica lo mismo sin HTML', () => {
    const texto = construirTextoNotificacion({
      titulo: 'El cliente confirmó el texto',
      enlace: 'https://calendar.studiomb.es/dashboard',
      contexto,
    });
    expect(texto).toContain('Cambio: Revisión texto → En diseño');
    expect(texto).toContain('Cliente: Camila Acosta Interiorisme');
    expect(texto).toContain('Cambio realizado por: Camila Acosta');
    expect(texto).not.toContain('<div');
  });

  it('sin contexto sigue sirviendo para un comentario', () => {
    const html = construirEmailNotificacion({
      titulo: 'Nuevo comentario del equipo',
      cuerpo: '¿Cambiamos el titular?',
      enlace: 'https://calendar.studiomb.es/dashboard',
    });
    expect(html).toContain('Nuevo comentario del equipo');
    expect(html).toContain('¿Cambiamos el titular?');
    expect(html).not.toContain('Cambio de estado');
  });
});
