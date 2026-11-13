// ============================================================================
//  GET /api/pdf/mes?mes=YYYY-MM&cliente=<id>
// ----------------------------------------------------------------------------
//  Genera un PDF A4 con la marca del cliente: cabecera, logo y todas las
//  publicaciones del mes (con diseño final si existe).
//
//  - Equipo: puede pedir un cliente concreto o todos.
//  - Cliente: se fuerza SU cliente (ignora el parámetro).
// ============================================================================

import PDFDocument from 'pdfkit';
import { directusFetch } from '../../../lib/directus-fetch.js';
import { env } from '../../../lib/env.js';
import { esCliente } from '../../../lib/flujo.js';
import { parseMes, dentroDelRango, nombreArchivo, ESTADO_PDF } from '../../../lib/informe.js';
import { redNombre } from '../../../lib/redes.js';

export const prerender = false;

const BRAND = '#4f46e5';
const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ESTADO_COLOR = {
  borrador: '#fef3c7',
  revision: '#dbeafe',
  en_diseno: '#ede9fe',
  revision_diseno: '#fce7f3',
  aprobado: '#d1fae5',
  publicado: '#ccfbf1',
};

async function fetchAssetBuffer(token, valor, { width = 520, format = 'jpg' } = {}) {
  const id = typeof valor === 'object' ? valor?.id : valor;
  if (!id || /^https?:\/\//i.test(String(id))) return null;
  try {
    const res = await fetch(
      `${env.DIRECTUS_INTERNAL_URL}/assets/${id}?width=${width}&format=${format}&quality=82`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function fechaCorta(valor) {
  const d = String(valor ?? '');
  return { dia: d.slice(8, 10) || '—', mes: d.slice(5, 7) || '' };
}

function azulClaro(doc, x, y, w, h) {
  doc.save().roundedRect(x, y, w, h, 4).fill('#f9fafb').restore();
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
      fields: 'id,cliente_id,tipo_contenido,formato,red,fecha_publicacion,copywriting,hashtags,estado,diseno_final',
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
      search: { fields: 'id,nombre,logo' },
    });
    cliente = c.ok ? c.data : null;
  }

  const logoBuf = cliente ? await fetchAssetBuffer(token, cliente.logo, { width: 240, format: 'png' }) : null;
  const nombreCliente = cliente?.nombre ?? 'Studio mb';

  // Imágenes de diseño final (secuencial para no saturar).
  const imagenes = new Map();
  for (const p of posts) {
    if (p.diseno_final) {
      const buf = await fetchAssetBuffer(token, p.diseno_final, { width: 520, format: 'jpg' });
      if (buf) imagenes.set(p.id, buf);
    }
  }

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    autoFirstPage: true,
    info: { Title: `Calendario editorial · ${nombreCliente} · ${mes.label}`, Author: 'Studio mb' },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const terminado = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ── Cabecera ────────────────────────────────────────────────────────────
  function cabeceraPrimera() {
    doc.save().rect(0, 0, PAGE_W, 118).fill(BRAND).restore();

    doc.fillColor('#c7d2fe').font('Helvetica-Bold').fontSize(8)
      .text('CALENDARIO EDITORIAL', MARGIN, 26, { characterSpacing: 1.5 });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
      .text(nombreCliente, MARGIN, 42, { width: CONTENT_W - 90, ellipsis: true });
    doc.fillColor('#c7d2fe').font('Helvetica').fontSize(11)
      .text(mes.label, MARGIN, 76);

    // Logo en caja blanca
    const box = 64;
    const bx = PAGE_W - MARGIN - box;
    doc.save().roundedRect(bx, 27, box, box, 10).fill('#ffffff').restore();
    if (logoBuf) {
      try {
        doc.image(logoBuf, bx + 6, 33, { fit: [box - 12, box - 12], align: 'center', valign: 'center' });
      } catch { /* logo no válido */ }
    } else {
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20)
        .text('mb', bx, 48, { width: box, align: 'center' });
    }
  }

  function cabeceraSiguiente() {
    doc.save().rect(0, 0, PAGE_W, 54).fill('#f9fafb').restore();
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text(nombreCliente, MARGIN, 20, { width: CONTENT_W - 150, ellipsis: true });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(mes.label, PAGE_W - MARGIN - 150, 22, { width: 150, align: 'right' });
    doc.save().moveTo(MARGIN, 54).lineTo(PAGE_W - MARGIN, 54).lineWidth(0.5).strokeColor(BORDER).stroke().restore();
  }

  function pie() {
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
      .text('Studio mb · calendario editorial', MARGIN, PAGE_H - 28, { width: CONTENT_W, align: 'center' });
  }

  cabeceraPrimera();
  pie();

  let y = 142;

  if (posts.length === 0) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(12)
      .text(`No hay publicaciones en ${mes.label}.`, MARGIN, y + 20, { width: CONTENT_W, align: 'center' });
  }

  const imgW = 92;
  const imgH = 123;
  const colW = CONTENT_W - imgW - 18;
  const itemH = 142;

  for (const p of posts) {
    if (y + itemH > PAGE_H - 46) {
      doc.addPage();
      cabeceraSiguiente();
      pie();
      y = 76;
    }

    const { dia, mes: mm } = fechaCorta(p.fecha_publicacion);
    azulClaro(doc, MARGIN, y, CONTENT_W, itemH - 10);

    // Fecha
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(dia, MARGIN + 12, y + 12, { width: 42, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(mm, MARGIN + 12, y + 35, { width: 42, align: 'center' });

    // Título y meta
    const tx = MARGIN + 66;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
      .text(p.tipo_contenido || 'Publicación', tx, y + 12, { width: colW, ellipsis: true });

    const meta = [p.formato, p.red ? redNombre(p.red) : null].filter(Boolean).join(' · ');
    if (meta) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(meta, tx, y + 30, { width: colW });
    }

    // Chip de estado
    const estadoTxt = ESTADO_PDF[p.estado] ?? p.estado ?? '';
    const chipW = doc.widthOfString(estadoTxt) + 12;
    doc.save().roundedRect(tx, y + 43, chipW, 14, 7).fill(ESTADO_COLOR[p.estado] ?? '#f3f4f6').restore();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(7).text(estadoTxt, tx + 6, y + 47, { width: chipW - 12 });

    // Copy
    if (p.copywriting) {
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
        .text(p.copywriting, tx, y + 64, { width: colW, height: 40, ellipsis: true, lineGap: 1 });
    }

    // Hashtags
    if (Array.isArray(p.hashtags) && p.hashtags.length) {
      const tags = p.hashtags.map((h) => (String(h).startsWith('#') ? h : `#${h}`)).join(' ');
      doc.fillColor('#6d28d9').font('Helvetica').fontSize(8)
        .text(tags, tx, y + 108, { width: colW, height: 12, ellipsis: true });
    }

    // Imagen de diseño final
    const ix = PAGE_W - MARGIN - imgW - 12;
    const iy = y + 10;
    const img = imagenes.get(p.id);
    if (img) {
      try {
        doc.save().rect(ix, iy, imgW, imgH).lineWidth(0.5).strokeColor(BORDER).stroke().restore();
        doc.image(img, ix, iy, { cover: [imgW, imgH], align: 'center', valign: 'center' });
      } catch { /* imagen no válida */ }
    } else {
      doc.save().roundedRect(ix, iy, imgW, imgH, 4).fill('#ffffff').strokeColor(BORDER).lineWidth(0.5).stroke().restore();
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
        .text('Sin diseño\nfinal', ix, iy + imgH / 2 - 8, { width: imgW, align: 'center' });
    }

    y += itemH;
  }

  // Resumen
  if (posts.length > 0) {
    if (y + 30 > PAGE_H - 46) {
      doc.addPage();
      cabeceraSiguiente();
      pie();
      y = 76;
    }
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`${posts.length} ${posts.length === 1 ? 'publicación' : 'publicaciones'} · generado el ${new Date().toLocaleDateString('es-ES')}`,
        MARGIN, y + 4, { width: CONTENT_W });
  }

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
