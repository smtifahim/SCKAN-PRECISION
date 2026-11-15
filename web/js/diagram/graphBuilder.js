// Builds a Graphviz DOT string for one SCKAN population's partial-order
// route diagram, plus dotted RDF-star-style cross-edges from every soma node
// to its candidate PRECISION cell types. Styling follows the project's
// reference node/edge legend:
//   Soma Location          - pale green rounded box, solid border
//   Axon Location          - pale blue rounded box, dashed border
//   Axon Terminal          - white box, red border, notched ("diagonals") corners
//   Sensory Terminal       - white box, dark orange border, sharp corners
//   Synapse Location       - pale green rounded box, double border
//   PRECISION Cell Type    - amber ellipse (candidate match, not in SCKAN)
// All sensory-terminal nodes (the peripheral end-organ structures) are
// grouped inside a dotted "End organ" cluster box.

import { resolveNodeLink } from '../data/curie.js';
import { DEFAULT_PATHWAY_MODE, PATHWAY_MODES, orientPathwayEdge } from './pathwayDirection.js';

export const NODE_STYLE = {
  soma: 'shape=box, style="rounded,filled", color="#3f8f4f", fillcolor="#e6f6e9", penwidth=1.3',
  axon: 'shape=box, style="rounded,dashed,filled", color="#5b7fdb", fillcolor="#edf1fc", penwidth=1.1',
  axonTerminal: 'shape=box, style="diagonals,filled", color="#d6342c", fillcolor="#ffffff", penwidth=1.6',
  sensoryTerminal: 'shape=box, style=filled, color="#cc6600", fillcolor="#ffffff", penwidth=1.3',
  synapse: 'shape=box, style="rounded,filled", color="#3f8f4f", fillcolor="#e6f6e9", peripheries=2, penwidth=1.3',
  // PRECISION cell types are a big dark-orange dot followed by the text (see cellTypeLabel()).
  cellType: 'shape=plain, margin=0',
};

export const CELL_TYPE_DOT_COLOR = '#ff9800'; // orange

/**
 * HTML-like Graphviz label for a PRECISION cell type: a round orange
 * marker (a "●" glyph, so it is always a true circle) on the left of the text.
 * @param {string} text
 * @param {number} [dotSize] - marker size in points
 */
export function cellTypeLabel(text, dotSize = 20) {
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<BR/>');
  return `<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2"><TR><TD><FONT COLOR="${CELL_TYPE_DOT_COLOR}" POINT-SIZE="${dotSize}">&#9679;</FONT></TD><TD>${safe}</TD></TR></TABLE>>`;
}

const PARTIAL_ORDER_EDGE_COLOR = '#9299a3'; // lighter dark gray
export const CANDIDATE_EDGE_COLOR = '#b8860b';
const END_ORGAN_CLUSTER_COLOR = '#cc6600'; // dark orange - matches the Sensory Terminal node border

const PARTIAL_ORDER_STYLE_BY_TYPE = {
  hasSomaLocation: 'soma',
  hasAxonLocation: 'axon',
  hasAxonLeadingToSensoryTerminal: 'axon',
  hasAxonTerminalLocation: 'axonTerminal',
  hasSensoryAxonTerminalLocation: 'sensoryTerminal',
};

function escapeDot(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeAttrString({ label, styleKey, iri, extraTooltip, id, link: withLink = true }) {
  const link = resolveNodeLink(iri);
  const tooltipParts = [label];
  if (link.curie) tooltipParts.push(`(${link.curie})`);
  if (extraTooltip) tooltipParts.push(extraTooltip);
  const attrs = [
    styleKey === 'cellType' ? `label=${cellTypeLabel(label)}` : `label="${escapeDot(label)}"`,
    NODE_STYLE[styleKey],
    `tooltip="${escapeDot(tooltipParts.join(' '))}"`,
  ];
  if (id) attrs.push(`id="${id}"`);
  if (withLink && link.url) {
    attrs.push(`URL="${escapeDot(link.url)}"`, 'target="_blank"');
  }
  return attrs.join(', ');
}

/**
 * @param {string} neuronIri - the selected/primary neuron; only its own rows
 *   contribute to `somaIris` (and therefore candidate-match edges) even when
 *   `partialOrderRows` spans a multi-synaptic chain (see below).
 * @param {Object} options
 * @param {Array<Object>} options.partialOrderRows - rows from drg-partial-order.json
 *   for this neuron, plus any chained downstream/relay neurons' rows (see
 *   data/partialOrderChain.js) when the primary neuron's pathway continues
 *   through a synapse into another neuron rather than ending there.
 * @param {Array<Object>} options.candidateRows - rows for this neuron from drg-organ-innervation.json (View A) or candidate-mapping.json (View B)
 * @param {'LR'|'TB'} [options.rankdir]
 * @param {'projection'|'signal'} [options.pathwayMode] - edge direction of the
 *   partial order (see pathwayDirection.js); defaults to the stored soma-outward
 *   "projection" direction
 * @param {string} [options.endOrganLabel] - label for the dotted "End organ" cluster box
 *   around the sensory-terminal (peripheral end-organ) nodes, e.g. "kidney"
 * @param {(row: Object) => string} [options.buildEdgeTooltip] - composes the
 *   hover tooltip for a candidate-match edge from its evidence row; defaults
 *   to View A's isCompatibleWith field set (Species/Gene_Label/Circuit_Role/
 *   End_Organ) - View B passes its own since candidate-mapping.json rows
 *   carry a different field set.
 */
export function buildPopulationDot(
  neuronIri,
  {
    partialOrderRows,
    candidateRows,
    rankdir = 'LR',
    pathwayMode = DEFAULT_PATHWAY_MODE,
    endOrganLabel,
    buildEdgeTooltip = candidateEdgeTooltip,
  }
) {
  const dotIdByIri = new Map();
  const idFor = (iri) => {
    if (!dotIdByIri.has(iri)) dotIdByIri.set(iri, `n${dotIdByIri.size}`);
    return dotIdByIri.get(iri);
  };

  // Any node that is ever a V2 of type hasAxonTerminalLocation AND flagged as
  // a synapse becomes the downstream population's soma - render it with the
  // double-border "Synapse Location" style instead of the terminal style.
  const synapseIris = new Set(
    partialOrderRows.filter((r) => r.V2_Type === 'hasAxonTerminalLocation' && r.IsSynapse === 'YES').map((r) => r.V2_ID)
  );

  const nodeMeta = new Map(); // iri -> { label, type }
  const somaIris = new Set();
  const sensoryTerminalIris = new Set();
  const edgeKeys = new Set();
  const edgeLines = [];

  for (const row of partialOrderRows) {
    nodeMeta.set(row.V1_ID, { label: row.V1, type: row.V1_Type });
    nodeMeta.set(row.V2_ID, { label: row.V2, type: row.V2_Type });
    // Restricted to the selected (primary) neuron's own rows: a chained
    // downstream/relay neuron's "hasSomaLocation" is really just the
    // upstream synapse location (see partialOrderChain.js), not a true
    // sensory-neuron soma that should ever get a candidate-match edge.
    if (row.V1_Type === 'hasSomaLocation' && row.Neuron_Connected === neuronIri) somaIris.add(row.V1_ID);
    if (row.V2_Type === 'hasSensoryAxonTerminalLocation') sensoryTerminalIris.add(row.V2_ID);

    const [fromId, toId] = orientPathwayEdge(row, pathwayMode);
    const key = `${fromId}|${toId}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edgeLines.push(`  ${idFor(fromId)} -> ${idFor(toId)} [color="${PARTIAL_ORDER_EDGE_COLOR}"];`);
    }
  }

  const nodeLines = [];
  for (const [iri, meta] of nodeMeta) {
    const styleKey = synapseIris.has(iri) ? 'synapse' : PARTIAL_ORDER_STYLE_BY_TYPE[meta.type] ?? 'axon';
    nodeLines.push(`  ${idFor(iri)} [${nodeAttrString({ label: meta.label, styleKey, iri })}];`);
  }

  // Group every sensory-terminal (peripheral end-organ) node into a dotted
  // "End organ" cluster box, per the reference layout.
  const clusterLines = [];
  if (sensoryTerminalIris.size > 0) {
    clusterLines.push('  subgraph cluster_end_organ {');
    clusterLines.push('    style=dotted;');
    clusterLines.push(`    color="${END_ORGAN_CLUSTER_COLOR}";`);
    clusterLines.push('    fontname="Segoe UI, Helvetica, Arial, sans-serif";');
    clusterLines.push('    fontsize=11;');
    clusterLines.push('    fontcolor="#5b6673";');
    clusterLines.push(`    label="End organ: ${escapeDot(endOrganLabel ?? 'unspecified')}";`);
    clusterLines.push('    labelloc="t";');
    clusterLines.push('    labeljust="l";');
    for (const iri of sensoryTerminalIris) {
      clusterLines.push(`    ${idFor(iri)};`);
    }
    clusterLines.push('  }');
  }

  // Dotted RDF-star-style cross edges: every soma node of this population to
  // every candidate PRECISION cell type, annotated with the stored evidence.
  const edgeAnnotations = new Map(); // dot edge id -> { row, somaIri, cellTypeIri }
  const cellTypeNodeIds = new Map(); // dot node id (SVG element id) -> cell type IRI
  const cellTypeIris = new Set(candidateRows.map((r) => r.Cell_Type));

  // Cell type nodes don't link out; clicking one (like clicking a dotted
  // candidate-match edge) opens its candidate match evidence instead.
  for (const cellTypeIri of cellTypeIris) {
    const row = candidateRows.find((r) => r.Cell_Type === cellTypeIri);
    const nodeId = `ct_${idFor(cellTypeIri)}`;
    cellTypeNodeIds.set(nodeId, cellTypeIri);
    nodeLines.push(
      `  ${idFor(cellTypeIri)} [${nodeAttrString({
        label: row.Cell_Type_Label,
        styleKey: 'cellType',
        iri: cellTypeIri,
        extraTooltip: 'PRECISION candidate cell type - click for candidate match evidence',
        id: nodeId,
        link: false,
      })}];`
    );
  }

  let candidateEdgeCounter = 0;
  for (const somaIri of somaIris) {
    for (const row of candidateRows) {
      const edgeId = `cm_${idFor(somaIri)}_${idFor(row.Cell_Type)}_${candidateEdgeCounter++}`;
      edgeAnnotations.set(edgeId, { row, somaIri, cellTypeIri: row.Cell_Type });
      edgeLines.push(
        `  ${idFor(somaIri)} -> ${idFor(row.Cell_Type)} [id="${edgeId}", style=dotted, color="${CANDIDATE_EDGE_COLOR}", ` +
          `arrowhead=none, penwidth=2.2, constraint=false, ` +
          `tooltip="${escapeDot(buildEdgeTooltip(row))}"];`
      );
    }
  }

  // In signal direction the soma sits mid-diagram, but cell types have no
  // ordering edges of their own and would be laid out in the first rank,
  // far from their dotted edges. Keep them level with the somas instead.
  const rankLines = [];
  if (pathwayMode === PATHWAY_MODES.SIGNAL && somaIris.size > 0 && cellTypeIris.size > 0) {
    const sameRank = [...somaIris, ...cellTypeIris].map((iri) => `${idFor(iri)};`).join(' ');
    rankLines.push(`  { rank=same; ${sameRank} }`);
  }

  const dot = [
    'digraph PartialOrder {',
    `  rankdir=${rankdir};`,
    '  graph [fontname="Segoe UI, Helvetica, Arial, sans-serif", bgcolor=transparent];',
    '  node [fontname="Segoe UI, Helvetica, Arial, sans-serif", fontsize=11, margin="0.18,0.1"];',
    '  edge [fontname="Segoe UI, Helvetica, Arial, sans-serif", fontsize=9];',
    ...nodeLines,
    ...clusterLines,
    ...rankLines,
    ...edgeLines,
    '}',
  ].join('\n');

  return { dot, edgeAnnotations, cellTypeNodeIds, somaIris, cellTypeIris };
}

function candidateEdgeTooltip(row) {
  const parts = ['Candidate match (isCompatibleWith)'];
  if (row.Species) parts.push(`Species: ${row.Species}`);
  if (row.Gene_Label) parts.push(`Marker gene: ${row.Gene_Label}`);
  if (row.Circuit_Role) parts.push(`Circuit role: ${row.Circuit_Role}`);
  if (row.End_Organ) parts.push(`End organ: ${row.End_Organ}`);
  return parts.join(' | ');
}
