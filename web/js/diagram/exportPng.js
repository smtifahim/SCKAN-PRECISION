// Exports the currently-rendered legend + partial-order diagram + a simple
// per-diagram caption (SCKAN population curie and preferred label) as a
// single PNG file. All three pieces are plain Graphviz-rendered SVG, so they
// can be rasterized and stacked on a canvas without any extra
// HTML-to-image dependency.

import { renderDotToString } from './render.js';

const PADDING = 20;
const GAP = 16;
const EXPORT_SCALE = 2; // render at 2x backing resolution for a crisp PNG

function escapeDotHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCaptionDot(rows) {
  const tableRows = rows
    .map(
      (r) =>
        `<TR><TD ALIGN="LEFT"><B>${escapeDotHtml(r.curie)}</B></TD><TD ALIGN="LEFT">${escapeDotHtml(r.label)}</TD></TR>`
    )
    .join('');
  return [
    'digraph Caption {',
    '  bgcolor=transparent;',
    // Helvetica is one of Graphviz's built-in core-font metrics, so its own
    // text-width estimate (used to size the HTML-like table) stays accurate.
    // A CSS font stack like "Segoe UI, ..." has no built-in metrics, so
    // Graphviz under-estimates the width and the text overflows its cell.
    '  node [shape=plain, fontname="Helvetica", fontsize=12];',
    `  caption [label=<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="6" CELLPADDING="4">${tableRows}</TABLE>>];`,
    '}',
  ].join('\n');
}

function readViewBoxSize(svgEl) {
  const viewBox = svgEl.getAttribute('viewBox');
  if (!viewBox) return { width: 600, height: 400 };
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  return { width, height };
}

/** Clone an SVG element with explicit width/height (from its viewBox) so it
 * rasterizes at a reliable, predictable size regardless of browser quirks
 * around sizing SVG images that only carry a viewBox. */
function serializeWithExplicitSize(svgEl) {
  const clone = svgEl.cloneNode(true);
  const { width, height } = readViewBoxSize(svgEl);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.classList.remove('partial-order-svg');
  clone.removeAttribute('style');
  return { svgString: new XMLSerializer().serializeToString(clone), width, height };
}

function svgStringToImage(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function svgElementToImage(svgEl) {
  const { svgString, width, height } = serializeWithExplicitSize(svgEl);
  const img = await svgStringToImage(svgString);
  return { img, width, height };
}

/**
 * @param {Object} options
 * @param {SVGElement} [options.legendSvgEl] - the rendered legend <svg>, if the view has one
 * @param {SVGElement} options.diagramSvgEl - the rendered diagram <svg>
 * @param {Array<{curie:string,label:string}>} [options.captionRows] - omit for no caption block
 * @param {string} [options.filename]
 */
export async function exportDiagramPng({ legendSvgEl, diagramSvgEl, captionRows, filename = 'sckan-precision-diagram.png' }) {
  const [legend, diagram, captionSvgString] = await Promise.all([
    legendSvgEl ? svgElementToImage(legendSvgEl) : null,
    svgElementToImage(diagramSvgEl),
    captionRows ? renderDotToString(buildCaptionDot(captionRows)) : null,
  ]);
  const caption = captionSvgString
    ? { img: await svgStringToImage(captionSvgString), ...readCaptionSize(captionSvgString) }
    : null;

  // A small safety margin on the caption: even with Helvetica metrics,
  // different browsers' font rasterizers can disagree with Graphviz's
  // layout estimate by a few pixels, and it's cheap insurance against text
  // clipping at the right edge.
  const pieces = [legend, diagram, caption].filter(Boolean);
  const captionWidthWithMargin = caption ? caption.width + 24 : 0;
  const contentWidth = Math.max(...pieces.map((p) => p.width), captionWidthWithMargin);
  const totalWidth = contentWidth + PADDING * 2;
  const totalHeight = pieces.reduce((sum, p) => sum + p.height, 0) + GAP * (pieces.length - 1) + PADDING * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(totalWidth * EXPORT_SCALE);
  canvas.height = Math.ceil(totalHeight * EXPORT_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  let y = PADDING;
  for (const piece of pieces) {
    const x = PADDING + (contentWidth - piece.width) / 2;
    ctx.drawImage(piece.img, x, y, piece.width, piece.height);
    y += piece.height + GAP;
  }

  await downloadCanvasAsPng(canvas, filename);
}

function readCaptionSize(svgString) {
  const match = svgString.match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
  if (!match) return { width: 400, height: 60 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function downloadCanvasAsPng(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}
