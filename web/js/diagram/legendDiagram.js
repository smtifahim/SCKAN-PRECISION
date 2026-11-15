// Builds the compact top-of-diagram legend as an actual Graphviz diagram
// (reusing the exact same NODE_STYLE / edge styling as the main partial-order
// diagram), so the legend text sits inside each shape - matching the
// project's reference legend layout - and so the legend can be losslessly
// composed with the main diagram when exporting to PNG (both are plain SVG
// produced by the same renderer).

import { NODE_STYLE, CANDIDATE_EDGE_COLOR, cellTypeLabel } from './graphBuilder.js';

const LEGEND_ITEMS = [
  { id: 'soma', label: 'Soma\\nLocation', styleKey: 'soma' },
  { id: 'axon', label: 'Axon\\nLocation', styleKey: 'axon' },
  { id: 'axonterm', label: 'Axon\\nTerminal', styleKey: 'axonTerminal' },
  { id: 'sensterm', label: 'Sensory\\nTerminal', styleKey: 'sensoryTerminal' },
  { id: 'synapse', label: 'Synapse\\nLocation', styleKey: 'synapse' },
  { id: 'celltype', label: 'PRECISION\nCell Type', styleKey: 'cellType' },
];

export function buildLegendDot() {
  const nodeLines = LEGEND_ITEMS.map((item) =>
    item.styleKey === 'cellType'
      ? `  ${item.id} [label=${cellTypeLabel(item.label, 13)}, ${NODE_STYLE[item.styleKey]}];`
      : `  ${item.id} [label="${item.label}", ${NODE_STYLE[item.styleKey]}];`
  );
  const chainLines = [];
  for (let i = 0; i < LEGEND_ITEMS.length - 1; i += 1) {
    chainLines.push(`  ${LEGEND_ITEMS[i].id} -> ${LEGEND_ITEMS[i + 1].id} [style=invis];`);
  }

  return [
    'digraph Legend {',
    '  rankdir=LR;',
    '  graph [fontname="Segoe UI, Helvetica, Arial, sans-serif", bgcolor=transparent, nodesep=0.22, ranksep=0.2];',
    '  node [fontname="Segoe UI, Helvetica, Arial, sans-serif", fontsize=9, margin="0.07,0.04"];',
    '  edge [fontname="Segoe UI, Helvetica, Arial, sans-serif", fontsize=8];',
    ...nodeLines,
    ...chainLines,
    '  celltype -> cm_a [style=invis];',
    '  cm_a [shape=point, width=0.01, style=invis];',
    // Plain text node (same font size as the other legend items); the dotted
    // sample line leads into it from the left.
    '  cm_label [shape=plain, label="Candidate\\nMatch"];',
    `  cm_a -> cm_label [style=dotted, color="${CANDIDATE_EDGE_COLOR}", penwidth=2.2, arrowhead=none, minlen=2];`,
    '}',
  ].join('\n');
}
