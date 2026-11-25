// ============================================================================
//  GET /api/pdf/mes?mes=YYYY-MM&cliente=<id>
// ----------------------------------------------------------------------------
//  Genera un PDF A4 con la marca del cliente:
//    · portada con mes, cliente, resumen y mosaico de diseños
//    · fichas de publicación (3 por página), con copy y hashtags completos
//
//  - Equipo: puede pedir un cliente concreto o todos.
//  - Cliente: se fuerza SU cliente (ignora el parámetro).
// ============================================================================

import PDFDocument from 'pdfkit';
import { directusFetch } from '../../../lib/directus-fetch.js';
import { env } from '../../../lib/env.js';
import { esCliente } from '../../../lib/flujo.js';
import { parseMes, dentroDelRango, nombreArchivo, ESTADO_PDF } from '../../../lib/informe.js';
import { normalizarHex, mezclar } from '../../../lib/marca.js';
import { redNombre } from '../../../lib/redes.js';

export const prerender = false;

const BRAND = '#4f46e5';
const INK = '#171717';
const MUTED = '#6f6863';
const BORDER = '#e7e5e4';
const PAPER = '#fbfaf8';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;

const CARD_TOP = 120;
const CARD_H = 198;
const CARD_GAP = 14;
const CARD_BOTTOM = PAGE_H - 72;

const ESTADO_COLOR = {
  borrador: '#fef3c7',
  revision: '#dbeafe',
  en_diseno: '#ede9fe',
  revision_diseno: '#fce7f3',
  revision_conjunta: '#e0e7ff',
  aprobado: '#d1fae5',
  publicado: '#ccfbf1',
};

async function fetchAssetBuffer(token, valor, { width = 700, format = 'jpg' } = {}) {
  const id = typeof valor === 'object' ? valor?.id : valor;
  if (!id || /^https?:\/\//i.test(String(id))) return null;
  try {
    const res = await fetch(
      `${env.DIRECTUS_INTERNAL_URL}/assets/${id}?width=${width}&format=${format}&quality=84`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Imagen externa (Drive/Unsplash): se descarga tal cual, con miniatura en Drive. */
async function fetchExternalBuffer(url, { width = 700 } = {}) {
  if (!/^https?:\/\//i.test(String(url))) return null;
  let destino = String(url);
  if (/googleusercontent\.com\/d\//i.test(destino) && !/[=][whs]\d+/i.test(destino)) {
    destino += `=w${width}`;
  }
  try {
    const res = await fetch(destino, { cache: 'no-store' });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function idDe(valor) {
  return typeof valor === 'object' ? valor?.id : valor;
}

function slidesDe(p) {
  let slides = p?.diseno_slides;
  if (typeof slides === 'string') {
    try { slides = JSON.parse(slides); } catch { slides = []; }
  }
  return Array.isArray(slides) ? slides : [];
}

function fondosDe(p) {
  let fondos = p?.imagenes_fondo;
  if (typeof fondos === 'string') {
    try { fondos = JSON.parse(fondos); } catch { fondos = []; }
  }
  return Array.isArray(fondos) ? fondos : [];
}

/** Primera imagen de fondo (Google Drive u otra URL) como propuesta. */
function imagenFondoDe(p) {
  const fondo = fondosDe(p).find((f) => f?.imagen);
  return fondo?.imagen || null;
}

/** Portada del post: diseño final, primera slide o imagen de fondo. */
function portadaDe(p) {
  const id = idDe(p.diseno_final) || idDe(slidesDe(p)[0]);
  if (id) return { valor: id, externa: false, final: true };
  const url = imagenFondoDe(p);
  return url ? { valor: url, externa: true, final: false } : null;
}

function fechaCorta(valor) {
  const d = String(valor ?? '');
  return { dia: d.slice(8, 10) || '—', mes: d.slice(5, 7) || '' };
}

function iniciales(nombre) {
  return String(nombre ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '·';
}

function mesCorto(mm) {
  const nombres = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return nombres[Number(mm) - 1] ?? '';
}

export async function GET({ request, locals }) {
  const token = locals?.token ?? null;
  if (!token) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const ahora = new Date();
  const mes = parseMes(url.searchParams.get('mes'))
    ?? parseMes(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`);

  let clienteId = url.searchParams.get('cliente') || '';

  if (esCliente(locals.user)) {
    const r = await directusFetch({
      path: `/users/${locals.user.id}`,
      token: env.PUBLIC_DIRECTUS_STATIC_TOKEN,
      search: { fields: 'cliente_id' },
    });
    clienteId = r.ok ? (r.data?.cliente_id ?? '') : '';
    if (!clienteId) return new Response('Sin cliente asignado', { status: 400 });
  }

  const lista = await directusFetch({
    path: '/items/publicaciones',
    token,
    search: {
      fields: 'id,cliente_id,tipo_contenido,formato,red,fecha_publicacion,copywriting,hashtags,estado,diseno_final,diseno_slides,imagenes_fondo',
      limit: '-1',
    },
  });
  if (!lista.ok) return new Response('No se pudieron leer las publicaciones', { status: 502 });

  let posts = (lista.data ?? [])
    .filter((p) => dentroDelRango(p.fecha_publicacion, mes.desde, mes.hasta));
  if (clienteId) posts = posts.filter((p) => p.cliente_id === clienteId);
  posts.sort((a, b) => String(a.fecha_publicacion).localeCompare(String(b.fecha_publicacion)));

  let cliente = null;
  if (clienteId) {
    const c = await directusFetch({
      path: `/items/clientes/${clienteId}`,
      token,
      search: { fields: 'id,nombre,logo,color_marca' },
    });
    cliente = c.ok ? c.data : null;
  }

  const logoBuf = cliente ? await fetchAssetBuffer(token, cliente.logo, { width: 240, format: 'png' }) : null;
  const nombreCliente = cliente?.nombre ?? 'Studio mb';
  const colorCliente = normalizarHex(cliente?.color_marca) ?? BRAND;

  // Portadas (diseño final, primera slide o imagen de fondo de propuesta).
  const imagenes = new Map();
  const propuestas = new Set();
  for (const p of posts) {
    const portada = portadaDe(p);
    if (!portada) continue;
    const buf = portada.externa
      ? await fetchExternalBuffer(portada.valor)
      : await fetchAssetBuffer(token, portada.valor, { width: 700, format: 'jpg' });
    if (buf) {
      imagenes.set(p.id, buf);
      if (!portada.final) propuestas.add(p.id);
    }
  }

  const redes = new Set(posts.map((p) => p.red).filter(Boolean));
  const conDiseno = posts.filter((p) => portadaDe(p)?.final).length;

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    autoFirstPage: true,
    info: { Title: `Calendario editorial · ${nombreCliente} · ${mes.label}`, Author: 'Studio mb' },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const terminado = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ── Utilidades de dibujo ────────────────────────────────────────────────

  function imagenRedondeada(buf, x, y, w, h, r = 8) {
    try {
      doc.save();
      doc.roundedRect(x, y, w, h, r).clip();
      doc.image(buf, x, y, { cover: [w, h], align: 'center', valign: 'center' });
      doc.restore();
    } catch {
      try { doc.restore(); } catch { /* nada */ }
    }
    doc.save().roundedRect(x, y, w, h, r).lineWidth(0.6).strokeColor(BORDER).stroke().restore();
  }

  function regla(x1, y1, x2, y2, color = BORDER, grosor = 0.7) {
    doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(grosor).strokeColor(color).stroke().restore();
  }

  // ── Portada ─────────────────────────────────────────────────────────────

  function portada() {
    doc.save().rect(0, 0, PAGE_W, PAGE_H).fill(PAPER).restore();
    doc.save().rect(0, 0, 10, PAGE_H).fill(colorCliente).restore();

    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7)
      .text('STUDIO MB', MARGIN, 38, { characterSpacing: 1.6 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('CALENDARIO EDITORIAL', PAGE_W - MARGIN - 190, 38, {
        width: 190, align: 'right', characterSpacing: 1.2,
      });

    const logoBox = 64;
    const lx = PAGE_W - MARGIN - logoBox;
    const ly = 58;
    if (logoBuf) {
      doc.save().roundedRect(lx, ly, logoBox, logoBox, 10).fill('#ffffff').restore();
      try {
        doc.image(logoBuf, lx + 7, ly + 7, { fit: [logoBox - 14, logoBox - 14], align: 'center', valign: 'center' });
      } catch { /* logo no válido */ }
    } else {
      doc.save().circle(lx + logoBox / 2, ly + logoBox / 2, logoBox / 2).fill(mezclar(colorCliente, 0.88)).restore();
      doc.fillColor(colorCliente).font('Helvetica-Bold').fontSize(22)
        .text(iniciales(nombreCliente), lx, ly + 19, { width: logoBox, align: 'center' });
    }

    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('CLIENTE', MARGIN, 116, { characterSpacing: 1.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(24)
      .text(nombreCliente, MARGIN, 130, { width: CONTENT_W - 100, ellipsis: true });

    const mesTxt = mes.label.split(' de ')[0].toUpperCase();
    doc.fillColor(colorCliente).font('Helvetica-Bold').fontSize(46)
      .text(mesTxt, MARGIN, 190, { characterSpacing: -0.5 });
    doc.fillColor('#8d8781').font('Helvetica').fontSize(20)
      .text(String(mes.year), MARGIN, 246);

    regla(MARGIN, 292, PAGE_W - MARGIN, 292);

    const stats = [
      { valor: posts.length, etiqueta: posts.length === 1 ? 'PUBLICACIÓN' : 'PUBLICACIONES' },
      { valor: redes.size, etiqueta: redes.size === 1 ? 'RED SOCIAL' : 'REDES' },
      { valor: conDiseno, etiqueta: 'DISEÑO FINAL' },
    ];
    const colW = CONTENT_W / 3;
    stats.forEach((s, i) => {
      const x = MARGIN + i * colW;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(String(s.valor), x, 313);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.5)
        .text(s.etiqueta, x, 345, { characterSpacing: 1.1 });
      if (i > 0) regla(x - 20, 316, x - 20, 352);
    });

    const tiles = [];
    for (const p of posts) {
      const buf = imagenes.get(p.id);
      if (buf) tiles.push(buf);
      if (tiles.length === 3) break;
    }

    const my = 390;
    const mh = 250;
    if (tiles.length > 0) {
      const gap = 10;
      const tw = tiles.length === 1
        ? CONTENT_W
        : tiles.length === 2 ? (CONTENT_W - gap) / 2 : (CONTENT_W - gap * 2) / 3;
      tiles.forEach((buf, i) => imagenRedondeada(buf, MARGIN + i * (tw + gap), my, tw, mh, 9));
    } else {
      doc.save().roundedRect(MARGIN, my, CONTENT_W, mh, 10).fill(mezclar(colorCliente, 0.9)).restore();
      doc.fillColor(mezclar(colorCliente, 0.55)).font('Helvetica-Bold').fontSize(150)
        .text(iniciales(nombreCliente), MARGIN, my + 32, { width: CONTENT_W, align: 'center' });
      doc.fillColor(colorCliente).font('Helvetica-Bold').fontSize(8)
        .text('CALENDARIO EDITORIAL', MARGIN, my + mh - 30, {
          width: CONTENT_W, align: 'center', characterSpacing: 1.5,
        });
    }

    if (propuestas.size > 0) {
      doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(7)
        .text('Las imágenes de portada son propuestas pendientes de diseño final.', MARGIN, 652, {
          width: CONTENT_W,
        });
    }

    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('Planificación editorial y diseños del mes.', MARGIN, 670, { width: CONTENT_W });
    doc.fillColor('#8d8781').font('Helvetica').fontSize(7)
      .text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, MARGIN, 686, { width: CONTENT_W });

    if (posts.length === 0) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(10)
        .text('No hay publicaciones planificadas para este mes.', MARGIN, 710, { width: CONTENT_W });
    }
  }

  // ── Cabecera de páginas interiores ──────────────────────────────────────

  function cabeceraInterior() {
    doc.save().rect(0, 0, PAGE_W, 6).fill(colorCliente).restore();

    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.5)
      .text('CALENDARIO EDITORIAL', MARGIN, 32, { characterSpacing: 1.4 });
    doc.fillColor(colorCliente).font('Helvetica-Bold').fontSize(12)
      .text(nombreCliente, MARGIN, 45, { width: CONTENT_W - 190, ellipsis: true });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(mes.label, PAGE_W - MARGIN - 190, 46, { width: 190, align: 'right' });

    regla(MARGIN, 74, PAGE_W - MARGIN, 74);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
      .text('Publicaciones', MARGIN, 92);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`${posts.length} ${posts.length === 1 ? 'publicación' : 'publicaciones'}`, PAGE_W - MARGIN - 160, 99, {
        width: 160, align: 'right',
      });
  }

  // ── Ficha de publicación ────────────────────────────────────────────────

  function tarjeta(p, y) {
    const x = MARGIN;
    const w = CONTENT_W;
    const h = CARD_H;

    doc.save().roundedRect(x, y, w, h, 6).fill('#ffffff').lineWidth(0.7).strokeColor(BORDER).stroke().restore();
    doc.save().rect(x, y + 12, 3, h - 24).fill(colorCliente).restore();

    const { dia, mes: mm } = fechaCorta(p.fecha_publicacion);
    doc.fillColor(colorCliente).font('Helvetica-Bold').fontSize(21)
      .text(dia, x + 14, y + 18, { width: 44, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.5)
      .text(mesCorto(mm), x + 14, y + 46, { width: 44, align: 'center', characterSpacing: 1 });

    regla(x + 64, y + 18, x + 64, y + h - 18);

    const ix = x + w - 16 - 132;
    const iy = y + 16;
    const iw = 132;
    const ih = 165;
    const tx = x + 78;
    const tw = ix - 16 - tx;

    const tipo = String(p.tipo_contenido || 'Publicación');
    const tipoTxt = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
      .text(tipoTxt, tx, y + 16, { width: tw, ellipsis: true });

    const formato = p.formato && String(p.formato).toLowerCase() !== tipo.toLowerCase()
      ? p.formato
      : null;
    const meta = [formato, p.red ? redNombre(p.red) : null].filter(Boolean).join(' · ');
    if (meta) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(meta, tx, y + 35, { width: tw, ellipsis: true });
    }

    const estadoTxt = ESTADO_PDF[p.estado] ?? p.estado ?? '—';
    doc.font('Helvetica-Bold').fontSize(6.5);
    const chipW = doc.widthOfString(estadoTxt) + 12;
    doc.save().roundedRect(tx, y + 52, chipW, 14, 7)
      .fill(ESTADO_COLOR[p.estado] ?? '#f5f5f4').restore();
    doc.fillColor('#44403c').font('Helvetica-Bold').fontSize(6.5)
      .text(estadoTxt, tx + 6, y + 56, { width: chipW - 12 });

    if (p.copywriting) {
      doc.fillColor('#3f3f46').font('Helvetica').fontSize(8.6)
        .text(p.copywriting, tx, y + 76, {
          width: tw, height: 68, ellipsis: true, lineGap: 1.1,
        });
    }

    const tags = Array.isArray(p.hashtags) ? p.hashtags : [];
    if (tags.length) {
      const texto = tags.map((h) => (String(h).startsWith('#') ? h : `#${h}`)).join(' ');
      doc.fillColor(mezclar(colorCliente, -0.15)).font('Helvetica').fontSize(7.2)
        .text(texto, tx, y + 150, { width: tw, height: 32, ellipsis: true, lineGap: 1 });
    }

    const buf = imagenes.get(p.id);
    if (buf) {
      imagenRedondeada(buf, ix, iy, iw, ih, 5);
      if (propuestas.has(p.id)) {
        const bw = 52;
        const bh = 13;
        const by = iy + ih - bh - 6;
        doc.save().roundedRect(ix + 6, by, bw, bh, 6)
          .fill('#fde68a').lineWidth(0.6).strokeColor('#d97706').stroke().restore();
        doc.fillColor('#78350f').font('Helvetica-Bold').fontSize(5.5)
          .text('PROPUESTA', ix + 6, by + 3.7, {
            width: bw, align: 'center', characterSpacing: 0.5,
          });
      }
    } else {
      doc.save().roundedRect(ix, iy, iw, ih, 5).fill(mezclar(colorCliente, 0.94)).restore();
      doc.fillColor(mezclar(colorCliente, 0.35)).font('Helvetica-Bold').fontSize(7)
        .text('PENDIENTE', ix, iy + ih / 2 - 18, {
          width: iw, align: 'center', characterSpacing: 1.2,
        });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text('de diseño', ix, iy + ih / 2 - 4, { width: iw, align: 'center' });
    }
  }

  // ── Pie de página (después de maquetar, sin romper el flujo) ────────────

  function numerarPaginas() {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      // El pie va por debajo del margen inferior: desactivamos el salto
      // automático de PDFKit mientras lo dibujamos.
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      regla(MARGIN, PAGE_H - 54, PAGE_W - MARGIN, PAGE_H - 54);
      doc.fillColor('#8d8781').font('Helvetica').fontSize(7)
        .text('Studio mb · calendario editorial', MARGIN, PAGE_H - 42, { width: CONTENT_W - 90 });
      doc.text(`${i + 1} / ${range.count}`, PAGE_W - MARGIN - 70, PAGE_H - 42, {
        width: 70, align: 'right',
      });
      doc.page.margins.bottom = margenInferior;
    }
  }

  // ── Composición ─────────────────────────────────────────────────────────

  portada();

  if (posts.length > 0) {
    doc.addPage();
    cabeceraInterior();

    let y = CARD_TOP;
    for (const p of posts) {
      if (y + CARD_H > CARD_BOTTOM) {
        doc.addPage();
        cabeceraInterior();
        y = CARD_TOP;
      }
      tarjeta(p, y);
      y += CARD_H + CARD_GAP;
    }
  }

  numerarPaginas();
  doc.flushPages();
  doc.end();

  const pdf = await terminado;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo(nombreCliente, mes.year, mes.month)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
