// Builds View (C)'s single `strict digraph`:
//   Neuron_Connected -> myelinated / unmyelinated -> fiber type -> cell-type group
// The hierarchy is two levels, all fiber types being direct children of their
// class (resource/json/fiber-type-hierarchy.json supplies the class
// membership):
//   myelinated   - type A, type Aβ, type Aδ
//   unmyelinated - type C, peptidergic type C, non-peptidergic type C
// The last two are artificial sub-types of type C. A cell type goes to
// peptidergic / non-peptidergic by its neurotransmitter phenotype when it has
// one, otherwise by a PEP / NP token in its name; anything else stays on the
// plain type C node. A group node holds every cell type of one fiber type
// that shares the same functional + threshold phenotype. Node borders are
// coloured by specific fiber type (Aδ / Aβ / C);
// edges follow the colour of the fiber type they lead to, so the shared class
// nodes can still be traced to the right groups. Fiber-type nodes with no cell
// types under them are not drawn.

import { resolveNodeLink } from '../data/curie.js';

const MYELINATED_IRI = 'http://purl.obolibrary.org/obo/UBERON_0006135';
const UNMYELINATED_IRI = 'http://purl.obolibrary.org/obo/UBERON_0006136';
const TYPE_A_IRI = 'http://uri.interlex.org/base/ilx_0796510';
const TYPE_A_BETA_IRI = 'http://uri.interlex.org/base/ilx_0796512';
const TYPE_A_DELTA_IRI = 'http://uri.interlex.org/base/ilx_0796514';
const TYPE_C_IRI = 'http://uri.interlex.org/base/ilx_0796516';
const PEPTIDERGIC_KEY = `${TYPE_C_IRI}|peptidergic`;
const NON_PEPTIDERGIC_KEY = `${TYPE_C_IRI}|non-peptidergic`;

const SUBTYPE_LABEL = {
  peptidergic: 'peptidergic type C nerve',
  nonPeptidergic: 'non-peptidergic type C nerve',
};
const PEPTIDE = 'peptide';
// PEP / NP as a whole token in a cell-type name: "PEP1.4", "C-PEP.TAC1", "hPEP.TRPV1", "NP2.1", "C-NP.SST", "hNP1".
const PEP_NAME = /(^|[^A-Za-z])h?PEP(?![A-Za-z])/;
const NP_NAME = /(^|[^A-Za-z])h?NP(?![A-Za-z])/;

// The fiber-type nodes under each class. `colorLabel` names the entry of
// FIBER_COLORS that colours the node - every specific fiber type, including the
// two artificial C sub-types, has its own colour.
const TYPE_C_LABEL = 'type C nerve fiber';
const CLASS_LEAVES = new Map([
  [
    MYELINATED_IRI,
    [
      { key: TYPE_A_IRI, label: 'type A nerve fiber', colorLabel: 'type A nerve fiber' },
      { key: TYPE_A_BETA_IRI, label: 'type A\u03b2 nerve fiber', colorLabel: 'type A\u03b2 nerve fiber' },
      { key: TYPE_A_DELTA_IRI, label: 'type A\u03b4 nerve fiber', colorLabel: 'type A\u03b4 nerve fiber' },
    ],
  ],
  [
    UNMYELINATED_IRI,
    [
      { key: TYPE_C_IRI, label: TYPE_C_LABEL, colorLabel: TYPE_C_LABEL },
      { key: PEPTIDERGIC_KEY, label: SUBTYPE_LABEL.peptidergic, colorLabel: SUBTYPE_LABEL.peptidergic },
      { key: NON_PEPTIDERGIC_KEY, label: SUBTYPE_LABEL.nonPeptidergic, colorLabel: SUBTYPE_LABEL.nonPeptidergic },
    ],
  ],
]);

// Hues are kept well apart so neighbouring fiber types read as different at a
// glance: type C (magenta) and its two sub-types (orange, violet) in
// particular must not look alike.
const FIBER_COLORS = {
  'type A nerve fiber': '#0e8f9c',
  'type A\u03b2 nerve fiber': '#1e9e5a',
  'type A\u03b4 nerve fiber': '#1d6fb8',
  'type A\u03b1 nerve fiber': '#8d6e00',
  [TYPE_C_LABEL]: '#d81b8a',
  [SUBTYPE_LABEL.peptidergic]: '#e65100',
  [SUBTYPE_LABEL.nonPeptidergic]: '#6d28d9',
};
const FALLBACK_COLORS = ['#5c6b7a', '#7f5539', '#455a64', '#a0522d'];
const CLASS_FILL = '#33414e';
const TEXT_COLOR = '#1f2933';
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

// Cell-type lines wrap to a fixed text width (points); widths are estimated
// from the character count, as Graphviz can't wrap HTML-like label text.
const LINE_WIDTH = 330;
const BOLD_CHAR_WIDTH = 6.6;
const NAME_PADDING = 8;

const UNASSIGNED = {
  functional: 'Unassigned Function',
  threshold: 'Unassigned Threshold',
};

// Display-only shortenings; filters and data keep the full values.
const LABEL_SHORTENINGS = new Map([['low-threshold mechanosensitivity (LTM) phenotype', 'LTM phenotype']]);
const shorten = (value) => LABEL_SHORTENINGS.get(value) ?? value;

export function fiberTypeColor(axonType) {
  if (FIBER_COLORS[axonType]) return FIBER_COLORS[axonType];
  let hash = 0;
  for (const ch of axonType ?? '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** Blend a #rrggbb colour toward `target` (white tints, black shades) by `amount` 0..1. */
function mixColor(hex, target, amount) {
  const channels = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const [from, to] = [channels(hex), channels(target)];
  const mixed = from.map((c, i) => Math.round(c + (to[i] - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
const tint = (hex, amount = 0.88) => mixColor(hex, '#ffffff', amount);
const shade = (hex, amount = 0.3) => mixColor(hex, '#000000', amount);

/** Cell-type cells in a group box link to `${CELL_HREF_PREFIX}<encoded IRI>`; the view intercepts these clicks. */
export const CELL_HREF_PREFIX = '#ct|';

/** A stable string for a `{ kind, key }` selection (neuron / class / leaf / group / cell). */
export const selectionKey = (selection) => `${selection.kind}|${selection.key}`;

const escapeDot = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sortedValues = (set) => [...set].sort((a, b) => a.localeCompare(b));
const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });

/** Greedily pack items into lines no wider than LINE_WIDTH, never splitting an item. */
function wrapLines(items, textOf) {
  const lines = [];
  let current = [];
  let width = 0;
  for (const item of items) {
    const itemWidth = textOf(item).length * BOLD_CHAR_WIDTH + NAME_PADDING;
    if (current.length && width + itemWidth > LINE_WIDTH) {
      lines.push(current);
      current = [];
      width = 0;
    }
    current.push(item);
    width += itemWidth;
  }
  if (current.length) lines.push(current);
  return lines;
}

/** The myelinated / unmyelinated class an axon type falls under (else the axon type itself). */
function classifyFiber(axonIri, axonLabel, fiberHierarchy) {
  for (const [iri, fallback] of [
    [MYELINATED_IRI, 'myelinated nerve fiber'],
    [UNMYELINATED_IRI, 'unmyelinated nerve fiber'],
  ]) {
    if (fiberHierarchy.descendantsOf(iri).has(axonIri)) {
      return { key: iri, label: fiberHierarchy.nodesByIri.get(iri)?.label ?? fallback };
    }
  }
  return { key: axonIri, label: axonLabel };
}

// One entry per candidate cell type: rows differ only by the individual
// phenotype value, so those are merged into sets.
function mergeCellTypes(rows) {
  const cellTypes = new Map();
  for (const row of rows) {
    if (!cellTypes.has(row.Cell_Type)) {
      cellTypes.set(row.Cell_Type, {
        iri: row.Cell_Type,
        label: row.Cell_Type_Orig_Label ?? row.Cell_Type_Label ?? row.Cell_Type,
        fullLabel: row.Cell_Type_Label ?? row.Cell_Type,
        axonIri: row.Axon_Type_IRI,
        axonLabel: row.Axon_Type,
        functional: new Set(),
        threshold: new Set(),
        neurotransmitters: new Set(),
      });
    }
    const entry = cellTypes.get(row.Cell_Type);
    if (row.Functional_Phenotype) entry.functional.add(shorten(row.Functional_Phenotype));
    if (row.Threshold_Phenotype) entry.threshold.add(shorten(row.Threshold_Phenotype));
    if (row.Neurotransmitter_Phenotype) entry.neurotransmitters.add(row.Neurotransmitter_Phenotype.toLowerCase());
  }
  return cellTypes;
}

/**
 * The fiber-type node a cell type sits under. Type C is split into
 * peptidergic / non-peptidergic / plain type C: an annotated neurotransmitter
 * phenotype decides first ("peptide" -> peptidergic, any other value ->
 * non-peptidergic); the many cell types without one are then classified by
 * a PEP / NP token in their name (e.g. "C-PEP.TAC1", "PEP1.4", "hNP1").
 */
function fiberLeafOf(cell) {
  if (cell.axonIri !== TYPE_C_IRI) return { key: cell.axonIri, label: cell.axonLabel, colorLabel: cell.axonLabel };
  const peptidergic = { key: PEPTIDERGIC_KEY, label: SUBTYPE_LABEL.peptidergic, colorLabel: SUBTYPE_LABEL.peptidergic };
  const nonPeptidergic = {
    key: NON_PEPTIDERGIC_KEY,
    label: SUBTYPE_LABEL.nonPeptidergic,
    colorLabel: SUBTYPE_LABEL.nonPeptidergic,
  };

  if (cell.neurotransmitters.has(PEPTIDE)) return peptidergic;
  if (cell.neurotransmitters.size) return nonPeptidergic;
  if (PEP_NAME.test(cell.label)) return peptidergic;
  if (NP_NAME.test(cell.label)) return nonPeptidergic;
  return { key: TYPE_C_IRI, label: TYPE_C_LABEL, colorLabel: TYPE_C_LABEL };
}

/**
 * Reduce the (filtered) candidate-mapping rows to the neurons, fiber classes
 * and cell-type groups the diagram draws.
 * @param {Array<Object>} rows
 * @param {ReturnType<import('../data/fiberHierarchy.js').buildFiberHierarchy>} fiberHierarchy
 */
export function buildPathwayModel(rows, fiberHierarchy) {
  const cellTypes = mergeCellTypes(rows);
  const leafOfCell = new Map([...cellTypes].map(([iri, cell]) => [iri, fiberLeafOf(cell)]));

  // One entry per neuron, with the fiber-type nodes (and so the colours) of
  // the cell types it maps to; the diagram draws one edge per fiber-type node.
  const found = new Map(); // neuron IRI -> { ...neuron, leaves: Map(leaf key -> { leaf, cellTypeIris }) }
  for (const row of rows) {
    if (!found.has(row.Neuron_Connected)) {
      const fiberClass = classifyFiber(row.Axon_Type_IRI, row.Axon_Type, fiberHierarchy);
      const link = resolveNodeLink(row.Neuron_Connected);
      found.set(row.Neuron_Connected, {
        iri: row.Neuron_Connected,
        label: link.curie ?? row.Neuron_Connected,
        url: link.url,
        axonLabel: row.Axon_Type,
        classKey: fiberClass.key,
        classLabel: fiberClass.label,
        neurotransmitters: new Set(),
        leaves: new Map(),
      });
    }
    // The neuron's own neurotransmitter (SCKAN), distinct from the cell type's.
    if (row.Neuron_Neurotransmitter_IRI) {
      found.get(row.Neuron_Connected).neurotransmitters.add(
        row.Neuron_Neurotransmitter || row.Neuron_Neurotransmitter_IRI.split(/[/_#]/).pop()
      );
    }
    const leaf = leafOfCell.get(row.Cell_Type);
    const { leaves } = found.get(row.Neuron_Connected);
    if (!leaves.has(leaf.key)) leaves.set(leaf.key, { leaf, cellTypeIris: new Set() });
    leaves.get(leaf.key).cellTypeIris.add(row.Cell_Type);
  }
  const colorOrder = Object.keys(FIBER_COLORS);
  const neurons = [...found.values()]
    .map((neuron) => ({
      ...neuron,
      neurotransmitters: sortedValues(neuron.neurotransmitters),
      leaves: [...neuron.leaves.values()]
        .map(({ leaf, cellTypeIris }) => ({ ...leaf, cellTypeCount: cellTypeIris.size }))
        .sort((a, b) => colorOrder.indexOf(a.colorLabel) - colorOrder.indexOf(b.colorLabel)),
    }))
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel) || byLabel(a, b));

  const groups = new Map();
  for (const cell of cellTypes.values()) {
    const fiberClass = classifyFiber(cell.axonIri, cell.axonLabel, fiberHierarchy);
    const leaf = fiberLeafOf(cell);

    const functional = cell.functional.size ? sortedValues(cell.functional).join(', ') : '';
    const threshold = cell.threshold.size ? sortedValues(cell.threshold).join(', ') : '';
    const key = [fiberClass.key, leaf.key, functional, threshold].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        classKey: fiberClass.key,
        classLabel: fiberClass.label,
        axonLabel: cell.axonLabel,
        leafKey: leaf.key,
        leafLabel: leaf.label,
        colorLabel: leaf.colorLabel,
        functional,
        threshold,
        cellTypes: [],
      });
    }
    groups.get(key).cellTypes.push(cell);
  }

  const groupList = [...groups.values()].sort(
    (a, b) =>
      a.classLabel.localeCompare(b.classLabel) ||
      a.leafLabel.localeCompare(b.leafLabel) ||
      a.functional.localeCompare(b.functional) ||
      a.threshold.localeCompare(b.threshold)
  );
  groupList.forEach((group) => group.cellTypes.sort(byLabel));

  // The hierarchy actually drawn: each class that has a neuron or a group,
  // with its declared fiber-type nodes plus any other fiber type found in the data.
  const hierarchy = new Map();
  const classEntry = (key, label) => {
    if (!hierarchy.has(key)) {
      const declared = (CLASS_LEAVES.get(key) ?? []).map((leaf) => ({
        ...leaf,
        label: fiberHierarchy.nodesByIri.get(leaf.key)?.label ?? leaf.label,
      }));
      hierarchy.set(key, { key, label, leaves: declared });
    }
    return hierarchy.get(key);
  };
  for (const neuron of neurons) classEntry(neuron.classKey, neuron.classLabel);
  for (const group of groupList) {
    const entry = classEntry(group.classKey, group.classLabel);
    if (group.leafKey !== group.classKey && !entry.leaves.some((leaf) => leaf.key === group.leafKey)) {
      entry.leaves.push({ key: group.leafKey, label: group.leafLabel, colorLabel: group.axonLabel });
    }
  }

  return {
    neurons,
    groups: groupList,
    hierarchy: [...hierarchy.values()].sort(byLabel),
  };
}

function groupLabel(group, color) {
  const phenotypes = [group.functional, group.threshold].filter(Boolean);
  const phenotypeText = phenotypes.length ? phenotypes.join(', ') : `${UNASSIGNED.functional}, ${UNASSIGNED.threshold}`;

  const rows = [
    `<TR><TD WIDTH="${LINE_WIDTH}"><FONT COLOR="${shade(color, 0.25)}"><I>${escapeHtml(phenotypeText)}</I></FONT></TD></TR>`,
    '<HR/>',
  ];

  // Each cell type is its own table cell so it can link to PRECISION; every
  // wrapped line is a nested one-row table, centred in the fixed-width cell.
  const lastCell = group.cellTypes.at(-1);
  const textOf = (cell) => cell.label + (cell === lastCell ? '' : ',');
  for (const line of wrapLines(group.cellTypes, textOf)) {
    const cells = line.map((cell) => {
      // An in-page link: the view opens this cell type's details instead of navigating.
      const href = ` HREF="${CELL_HREF_PREFIX}${escapeHtml(encodeURIComponent(cell.iri))}"`;
      return `<TD${href} TOOLTIP="${escapeHtml(cell.fullLabel)}"><FONT COLOR="${TEXT_COLOR}"><B>${escapeHtml(textOf(cell))}</B></FONT></TD>`;
    });
    rows.push(
      `<TR><TD><TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2"><TR>${cells.join('')}</TR></TABLE></TD></TR>`
    );
  }

  return `<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4" COLOR="${color}">${rows.join('')}</TABLE>>`;
}

/**
 * @param {ReturnType<typeof buildPathwayModel>} model
 * @param {'LR'|'TB'} [rankdir]
 * @param {Map<string, {kind: string, key: string}>} [targets] - filled with node id -> what clicking it selects
 * @returns {string} Graphviz DOT
 */
export function buildNeuralCircuitDot(model, rankdir = 'LR', targets = new Map()) {
  const nodeLines = [];
  const edgeLines = [];
  const seenNodes = new Set();
  const seenEdges = new Set();
  const ids = new Map();
  const idFor = (key) => {
    if (!ids.has(key)) ids.set(key, `n${ids.size}`);
    return ids.get(key);
  };

  const addNode = (key, attrs, target) => {
    const id = idFor(key);
    if (!seenNodes.has(key)) {
      seenNodes.add(key);
      nodeLines.push(`  ${id} [${attrs.join(', ')}];`);
      if (target) targets.set(id, target);
    }
    return id;
  };
  const addEdge = (from, to, color) => {
    const key = `${from}|${to}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edgeLines.push(`  ${from} -> ${to} [color="${color}"];`);
  };

  const classNode = (classKey, classLabel) =>
    addNode(`class|${classKey}`, [
      `label="${escapeDot(classLabel)}"`,
      `fillcolor="${CLASS_FILL}"`,
      `color="${CLASS_FILL}"`,
      'fontcolor="#ffffff"',
      `fontname="${FONT_BOLD}"`,
      'fontsize=14',
      'margin="0.22,0.1"',
      `tooltip="${escapeDot(`${classLabel} - click for details`)}"`,
    ], { kind: 'class', key: classKey });

  // One node per neuron, in the colour of its recorded fiber type. The edge to
  // the fiber class is split into parallel lines, one per fiber-type group the
  // neuron maps to, each in that group's colour. The tooltip lists how many
  // cell types it has in each group.
  for (const neuron of model.neurons) {
    const color = fiberTypeColor(neuron.axonLabel);
    const summary =
      neuron.leaves.map((leaf) => `${leaf.label}: ${leaf.cellTypeCount}`).join('; ') +
      (neuron.neurotransmitters.length ? ` - neuron neurotransmitter (SCKAN): ${neuron.neurotransmitters.join(', ')}` : '');
    const id = addNode(`neuron|${neuron.iri}`, [
      `label="${escapeDot(neuron.label)}"`,
      `fillcolor="${color}"`,
      `color="${shade(color, 0.35)}"`,
      'penwidth=1.5',
      'fontcolor="#ffffff"',
      `fontname="${FONT_BOLD}"`,
      'fontsize=10',
      'height=0.3',
      'margin="0.12,0.03"',
      `tooltip="${escapeDot(`SCKAN neuron ${neuron.label} (${neuron.axonLabel}) - cell types by group: ${summary}`)}"`,
    ], { kind: 'neuron', key: neuron.iri });
    const edgeColors = neuron.leaves.map((leaf) => fiberTypeColor(leaf.colorLabel));
    addEdge(id, classNode(neuron.classKey, neuron.classLabel), edgeColors.join(':'));
  }

  // The hierarchy: class -> fiber-type nodes -> groups. Fiber-type nodes that
  // have no cell types are not drawn.
  const leafIds = new Map(); // `${classKey}|${leafKey}` -> node id
  for (const fiberClass of model.hierarchy) {
    const classId = classNode(fiberClass.key, fiberClass.label);
    for (const leaf of fiberClass.leaves) {
      if (!model.groups.some((g) => g.classKey === fiberClass.key && g.leafKey === leaf.key)) continue;
      const color = fiberTypeColor(leaf.colorLabel);
      const leafId = addNode(`leaf|${fiberClass.key}|${leaf.key}`, [
        `label="${escapeDot(leaf.label)}"`,
        `fillcolor="${color}"`,
        `color="${shade(color, 0.25)}"`,
        'fontcolor="#ffffff"',
        `fontname="${FONT_BOLD}"`,
        'fontsize=12',
        'margin="0.3,0.1"',
        `tooltip="${escapeDot(`${leaf.label} - click for details`)}"`,
      ], { kind: 'leaf', key: `${fiberClass.key}|${leaf.key}` });
      leafIds.set(`${fiberClass.key}|${leaf.key}`, leafId);
      addEdge(classId, leafId, color);
    }
  }

  for (const group of model.groups) {
    const color = fiberTypeColor(group.colorLabel);
    // A class that is itself the axon type (not under myelinated/unmyelinated)
    // has no separate fiber-type node.
    const parent = leafIds.get(`${group.classKey}|${group.leafKey}`) ?? classNode(group.classKey, group.classLabel);
    const names = group.cellTypes.map((c) => c.label).join(', ');
    const groupId = addNode(`group|${group.key}`, [
      `label=${groupLabel(group, color)}`,
      `fillcolor="${tint(color, 0.92)}"`,
      `color="${color}"`,
      'penwidth=1.8',
      'margin="0.1,0.06"',
      `tooltip="${escapeDot(`${group.leafLabel}: ${names}`)}"`,
    ], { kind: 'group', key: group.key });
    addEdge(parent, groupId, color);
  }

  return [
    'strict digraph NeuralCircuits {',
    `  rankdir=${rankdir};`,
    '  bgcolor=transparent;',
    // Neurons are drawn once per group, so keep sibling nodes close enough that
    // the neuron column is not taller than the group column.
    `  nodesep=${rankdir === 'TB' ? 0.3 : 0.12};`,
    '  ranksep=1.0;',
    '  pad=0.35;',
    `  node [shape=box, style="rounded,filled", fillcolor="#ffffff", fontname="${FONT}", fontcolor="${TEXT_COLOR}", fontsize=11];`,
    '  edge [style=solid, arrowhead=none, penwidth=2.2];',
    ...nodeLines,
    ...edgeLines,
    '}',
  ].join('\n');
}

/** Concise summary of the diagram currently drawn. */
export function generatePathwayCaption(model) {
  if (model.neurons.length === 0) return 'No pathways match the current filters.';

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const classes = new Map();
  const distinctNeurons = new Set(model.neurons.map((n) => n.iri));
  for (const neuron of model.neurons) {
    if (!classes.has(neuron.classKey)) {
      classes.set(neuron.classKey, { label: neuron.classLabel, neuronIris: new Set(), fibers: new Set(), cells: new Set() });
    }
    const entry = classes.get(neuron.classKey);
    entry.neuronIris.add(neuron.iri);
    entry.fibers.add(neuron.axonLabel);
  }
  for (const group of model.groups) {
    group.cellTypes.forEach((cell) => classes.get(group.classKey)?.cells.add(cell.iri));
  }

  const leafCount = (key) =>
    model.groups.filter((g) => g.leafKey === key).reduce((sum, g) => sum + g.cellTypes.length, 0);
  const typeC = [
    [leafCount(PEPTIDERGIC_KEY), 'peptidergic'],
    [leafCount(NON_PEPTIDERGIC_KEY), 'non-peptidergic'],
    [leafCount(TYPE_C_IRI), 'unspecified'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);

  const parts = [...classes.values()].map((entry) => {
    const fibers = sortedValues(entry.fibers).join(', ');
    let text = `${entry.neuronIris.size} via ${entry.label} (${fibers}) to ${plural(entry.cells.size, 'cell type')}`;
    if (typeC.length && [...entry.fibers].some((f) => /type C/.test(f))) text += `: ${typeC.join(', ')}`;
    return text;
  });

  const cellTypeCount = model.groups.reduce((sum, g) => sum + g.cellTypes.length, 0);
  return (
    `${plural(distinctNeurons.size, 'SCKAN neuron')} map to ${plural(cellTypeCount, 'candidate cell type')} ` +
    `in ${plural(model.groups.length, 'phenotype group')} - ${parts.join('; ')}.`
  );
}

/** Caveat shown under the caption whenever type C cell types are drawn; '' otherwise. */
export function generatePathwayNote(model) {
  const typeCKeys = new Set([TYPE_C_IRI, PEPTIDERGIC_KEY, NON_PEPTIDERGIC_KEY]);
  if (!model.groups.some((group) => typeCKeys.has(group.leafKey))) return '';
  return (
    'Note: the peptidergic / non-peptidergic split of type C is a heuristic (the neurotransmitter phenotype where ' +
    'annotated, otherwise a PEP / NP token in the cell-type name) and is not specified by PRECISION or SCKAN. ' +
    'This diagram suggests candidate populations and cell types; additional phenotypes are required to ' +
    'distinguish type C from non-peptidergic type C.'
  );
}
