// Loads the vendored Graphviz WASM engine once, lays out a DOT string as
// SVG, and injects it into a container. Nodes/edges carrying a DOT `URL`
// attribute are already native, clickable `<a>` links in the rendered SVG
// (handled by the browser); this module's job is just to also wire up
// clicks on the dotted RDF-star candidate-match edges, which have no URL
// (they open the legend panel instead of navigating).

import { Graphviz } from '../../vendor/graphviz/dist/index.js';
import { makeZoomable } from './zoomPan.js';

let graphvizPromise = null;

function getGraphviz() {
  if (!graphvizPromise) {
    graphvizPromise = Graphviz.load();
  }
  return graphvizPromise;
}

/**
 * @param {HTMLElement} container
 * @param {string} dot
 * @param {Object} [options]
 * @param {(edgeId: string) => void} [options.onCandidateEdgeClick]
 * @param {(nodeId: string) => void} [options.onCellTypeNodeClick] - called with the SVG id of a clicked PRECISION cell type node
 * @param {boolean} [options.zoomable] - wrap the SVG in a zoom/pan viewport with +/- controls
 */
export async function renderDotInto(container, dot, { onCandidateEdgeClick, onCellTypeNodeClick, zoomable = false } = {}) {
  const svg = await renderDotToString(dot);
  container.innerHTML = svg;

  const svgEl = container.querySelector('svg');
  if (!svgEl) return svgEl;

  // Let the SVG scale to its container instead of staying pixel-locked.
  // "xMidYMid" (not the default "xMidYMid" for <svg>, which we override from
  // Graphviz's own output) centers the content when the CSS box's aspect
  // ratio differs from the viewBox's - e.g. a short/wide LR diagram inside a
  // taller container would otherwise render hugged to the top-left corner.
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.classList.add('partial-order-svg');

  if (onCandidateEdgeClick) {
    svgEl.querySelectorAll('g.edge').forEach((edgeGroup) => {
      if (!edgeGroup.id?.startsWith('cm_')) return;
      edgeGroup.classList.add('candidate-edge');
      widenClickTarget(edgeGroup);
      edgeGroup.addEventListener('click', () => onCandidateEdgeClick(edgeGroup.id));
    });
  }

  if (onCellTypeNodeClick) {
    svgEl.querySelectorAll('g.node').forEach((nodeGroup) => {
      if (!nodeGroup.id?.startsWith('ct_')) return;
      nodeGroup.classList.add('candidate-node');
      nodeGroup.addEventListener('click', () => onCellTypeNodeClick(nodeGroup.id));
    });
  }

  if (zoomable) makeZoomable(container, svgEl);

  return svgEl;
}

/**
 * Lay out a DOT string and return the raw SVG markup, without touching the
 * DOM. Used both by renderDotInto() above and by the PNG export, which needs
 * a standalone caption diagram it never actually displays on screen.
 * @param {string} dot
 * @returns {Promise<string>}
 */
export async function renderDotToString(dot) {
  const graphviz = await getGraphviz();
  return graphviz.layout(dot, 'svg', 'dot');
}

/**
 * The visible dotted candidate-match line is thin and easy to miss with the
 * mouse. Overlay an invisible, much thicker copy of its path so clicks
 * anywhere near the line still register (the click listener is on the
 * parent `<g>`, so this just has to be inside it).
 */
function widenClickTarget(edgeGroup) {
  const path = edgeGroup.querySelector('path');
  if (!path) return;
  const hitPath = path.cloneNode();
  hitPath.setAttribute('stroke', 'transparent');
  hitPath.setAttribute('stroke-dasharray', 'none');
  hitPath.setAttribute('stroke-width', '12');
  hitPath.setAttribute('fill', 'none');
  hitPath.classList.add('candidate-edge-hit-target');
  path.insertAdjacentElement('beforebegin', hitPath);
}
