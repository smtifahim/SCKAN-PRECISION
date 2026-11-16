// View (C)'s "selection details" panel. Clicking a neuron, a fiber-type node,
// a cell-type group box or a single cell type in the diagram (or a chip /
// cell type in this panel) shows what lies behind it: the counts, the linked
// neurons and cell types, and for one cell type the same six-phenotype
// checklist View (B) uses. The panel is always topped by a summary of the
// filters and counts the diagram currently reflects.

import { linkTo, escapeHtml } from '../shared/html.js';
import { OPTIONAL_PHENOTYPE_FIELDS } from '../data/candidateMatchScore.js';
import { fiberTypeColor } from './neuralCircuitBuilder.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Index the (filtered) mapping rows by cell type: which neurons map to it and
 * every distinct label/IRI it carries per optional phenotype field.
 * @param {Array<Object>} rows
 */
export function indexRows(rows) {
  const cells = new Map();
  for (const row of rows) {
    if (!cells.has(row.Cell_Type)) {
      cells.set(row.Cell_Type, {
        iri: row.Cell_Type,
        label: row.Cell_Type_Label ?? row.Cell_Type,
        localLabel: row.Cell_Type_Orig_Label ?? row.Cell_Type_Label ?? row.Cell_Type,
        axonLabel: row.Axon_Type,
        axonIri: row.Axon_Type_IRI,
        neurons: new Set(),
        values: Object.fromEntries(OPTIONAL_PHENOTYPE_FIELDS.map((f) => [f.key, new Map()])),
      });
    }
    const cell = cells.get(row.Cell_Type);
    cell.neurons.add(row.Neuron_Connected);
    for (const f of OPTIONAL_PHENOTYPE_FIELDS) {
      if (row[f.key] && !cell.values[f.key].has(row[f.key])) cell.values[f.key].set(row[f.key], row[`${f.key}_IRI`]);
    }
  }
  return { cells };
}

const linkValues = (map) => [...map].map(([label, iri]) => linkTo(label, iri)).join(', ');
const plainValues = (map) => [...map.keys()].map(escapeHtml).join(', ');

function chip(kind, key, label, color) {
  return `<button type="button" class="detail-chip" data-kind="${kind}" data-key="${encodeURIComponent(key)}" style="--chip:${color}">${escapeHtml(label)}</button>`;
}

const dot = (color) => `<span class="detail-dot" style="background:${color}"></span>`;

function neuronChips(neurons) {
  return neurons.map((n) => chip('neuron', n.iri, n.label, fiberTypeColor(n.axonLabel))).join('');
}

function neuronDetails(neuron, pathway, index) {
  const cellIris = [...index.cells.values()].filter((c) => c.neurons.has(neuron.iri));
  const leafRows = neuron.leaves
    .map(
      (leaf) =>
        `<li>${dot(fiberTypeColor(leaf.colorLabel))}${escapeHtml(leaf.label)} <span class="detail-meta">${plural(leaf.cellTypeCount, 'cell type')}</span></li>`
    )
    .join('');
  return `
    <h4 class="legend-subtitle">${linkTo(neuron.label, neuron.iri)} <span class="detail-meta">(SCKAN neuron)</span></h4>
    <table class="legend-evidence-table">
      <tbody>
        <tr><th>Axon / fiber type</th><td>${escapeHtml(neuron.axonLabel)}</td></tr>
        <tr><th>Fiber class</th><td>${escapeHtml(neuron.classLabel)}</td></tr>
        <tr><th>Neuron neurotransmitter</th><td>${neuron.neurotransmitters.length ? escapeHtml(neuron.neurotransmitters.join(', ')) : '<span class="detail-meta">not annotated in SCKAN</span>'}</td></tr>
        <tr><th>Candidate cell types</th><td>${cellIris.length}</td></tr>
      </tbody>
    </table>
    <h4 class="legend-subtitle">Cell types by fiber-type group</h4>
    <ul class="detail-list">${leafRows}</ul>`;
}

function groupsUnder(pathway, predicate) {
  return pathway.groups.filter(predicate);
}

function nodeDetails(title, color, groups, pathway, index, neuronFilter, extra = '') {
  const neurons = pathway.neurons.filter(neuronFilter);
  const cellCount = groups.reduce((sum, g) => sum + g.cellTypes.length, 0);
  const groupRows = groups
    .map((g) => {
      const phenotype = [g.functional, g.threshold].filter(Boolean).join(', ') || 'Unassigned Function, Unassigned Threshold';
      return `<li>${chip('group', g.key, phenotype, fiberTypeColor(g.colorLabel))} <span class="detail-meta">${plural(g.cellTypes.length, 'cell type')}</span></li>`;
    })
    .join('');
  return `
    <h4 class="legend-subtitle">${dot(color)}${escapeHtml(title)}</h4>
    <table class="legend-evidence-table">
      <tbody>
        <tr><th>SCKAN neurons</th><td>${neurons.length}</td></tr>
        <tr><th>Candidate cell types</th><td>${cellCount}</td></tr>
        <tr><th>Phenotype groups</th><td>${groups.length}</td></tr>
      </tbody>
    </table>
    ${extra}
    ${neurons.length ? `<h4 class="legend-subtitle">Neurons</h4><div class="detail-chips">${neuronChips(neurons)}</div>` : ''}
    <h4 class="legend-subtitle">Phenotype groups</h4>
    <ul class="detail-list">${groupRows}</ul>`;
}

const HEURISTIC_NOTE =
  '<p class="legend-hint">The peptidergic / non-peptidergic split of type C is a heuristic, not specified by PRECISION or SCKAN.</p>';

function groupDetails(group, pathway, index) {
  const color = fiberTypeColor(group.colorLabel);
  const neuronIris = new Set();
  const cellRows = group.cellTypes
    .map((cell) => {
      const info = index.cells.get(cell.iri);
      info?.neurons.forEach((n) => neuronIris.add(n));
      const meta = info
        ? [plainValues(info.values.Species), plainValues(info.values.Gene_Phenotype)].filter(Boolean).join(' · ')
        : '';
      return `<li><button type="button" class="detail-link" data-kind="cell" data-key="${encodeURIComponent(cell.iri)}">${escapeHtml(cell.label)}</button>${meta ? ` <span class="detail-meta">${meta}</span>` : ''}</li>`;
    })
    .join('');
  const neurons = pathway.neurons.filter((n) => neuronIris.has(n.iri));
  const nt = new Set(group.cellTypes.flatMap((c) => [...c.neurotransmitters]));
  return `
    <h4 class="legend-subtitle">${dot(color)}${escapeHtml(group.leafLabel)}</h4>
    <table class="legend-evidence-table">
      <tbody>
        <tr><th>Functional phenotype</th><td>${escapeHtml(group.functional || 'not annotated')}</td></tr>
        <tr><th>Threshold phenotype</th><td>${escapeHtml(group.threshold || 'not annotated')}</td></tr>
        <tr><th>Neurotransmitter</th><td>${nt.size ? escapeHtml([...nt].join(', ')) : 'not annotated'}</td></tr>
        <tr><th>Fiber class</th><td>${escapeHtml(group.classLabel)}</td></tr>
      </tbody>
    </table>
    <h4 class="legend-subtitle">Cell types (${group.cellTypes.length})</h4>
    <ul class="detail-list">${cellRows}</ul>
    <h4 class="legend-subtitle">SCKAN neurons (${neurons.length})</h4>
    <div class="detail-chips">${neuronChips(neurons)}</div>`;
}

function cellDetails(cellIri, pathway, index) {
  const info = index.cells.get(cellIri);
  if (!info) return '';
  const group = pathway.groups.find((g) => g.cellTypes.some((c) => c.iri === cellIri));
  const color = fiberTypeColor(group?.colorLabel ?? info.axonLabel);
  const neurons = pathway.neurons.filter((n) => info.neurons.has(n.iri));
  const annotated = OPTIONAL_PHENOTYPE_FIELDS.filter((f) => info.values[f.key].size).length;
  const checklist = OPTIONAL_PHENOTYPE_FIELDS.map((f) =>
    info.values[f.key].size
      ? `<tr class="phenotype-on"><th><span class="phenotype-mark">✓</span> ${f.label}</th><td>${linkValues(info.values[f.key])}</td></tr>`
      : `<tr class="phenotype-off"><th><span class="phenotype-mark">○</span> ${f.label}</th><td>not annotated</td></tr>`
  ).join('');
  return `
    <h4 class="legend-subtitle">${dot(color)}${linkTo(info.label, info.iri)}
      <span class="legend-match-score">${annotated}/${OPTIONAL_PHENOTYPE_FIELDS.length} supporting phenotypes</span></h4>
    <table class="legend-evidence-table legend-common-table">
      <tbody>
        <tr><th>Local label</th><td>${linkTo(info.localLabel, info.iri)}</td></tr>
        <tr><th>Axon / fiber type</th><td>${linkTo(info.axonLabel, info.axonIri)}</td></tr>
        ${group ? `<tr><th>Fiber-type group</th><td>${escapeHtml(group.leafLabel)}</td></tr>` : ''}
      </tbody>
    </table>
    <table class="legend-evidence-table"><tbody>${checklist}</tbody></table>
    <h4 class="legend-subtitle">SCKAN neurons (${neurons.length})</h4>
    <div class="detail-chips">${neuronChips(neurons)}</div>`;
}

/** The "N neurons -> N cell types -> N groups" counts plus the active filters. */
function summaryBlock(pathway, activeFilters) {
  const cellCount = pathway.groups.reduce((sum, g) => sum + g.cellTypes.length, 0);
  const counts = `${plural(pathway.neurons.length, 'neuron')} → ${plural(cellCount, 'cell type')} → ${plural(pathway.groups.length, 'group')}`;
  const filters = activeFilters.length
    ? activeFilters.map(([name, value]) => `<span class="detail-filter"><strong>${escapeHtml(name)}:</strong> ${escapeHtml(value)}</span>`).join('')
    : '<span class="detail-meta">No filters - showing everything</span>';
  return `
    <div class="detail-summary">
      <div class="detail-counts">${counts}</div>
      <div class="detail-filters">${filters}</div>
    </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {Object} ctx
 * @param {ReturnType<import('./neuralCircuitBuilder.js').buildPathwayModel>} ctx.pathway
 * @param {ReturnType<typeof indexRows>} ctx.index
 * @param {{kind: string, key: string}|null} ctx.selection
 * @param {Array<[string, string]>} ctx.activeFilters - [filter name, selected value] pairs
 */
export function renderDetails(container, { pathway, index, selection, activeFilters }) {
  const header = `
    <div class="detail-header">
      <h3 class="legend-title">Selection details</h3>
      <button type="button" class="btn" data-action="export">Export to Excel</button>
    </div>
    ${summaryBlock(pathway, activeFilters)}`;

  let body = '';
  const { kind, key } = selection ?? {};
  if (kind === 'neuron') {
    const neuron = pathway.neurons.find((n) => n.iri === key);
    if (neuron) body = neuronDetails(neuron, pathway, index);
  } else if (kind === 'group') {
    const group = pathway.groups.find((g) => g.key === key);
    if (group) body = groupDetails(group, pathway, index);
  } else if (kind === 'cell') {
    body = cellDetails(key, pathway, index);
  } else if (kind === 'leaf' || kind === 'class') {
    const [classKey, leafKey] = key.split('|');
    const isLeaf = kind === 'leaf';
    const groups = groupsUnder(pathway, (g) => g.classKey === classKey && (!isLeaf || g.leafKey === leafKey));
    if (groups.length) {
      const label = isLeaf ? groups[0].leafLabel : groups[0].classLabel;
      const color = fiberTypeColor(isLeaf ? groups[0].colorLabel : groups[0].classLabel);
      const heuristic = isLeaf && /peptidergic/.test(label) ? HEURISTIC_NOTE : '';
      body = nodeDetails(
        label,
        color,
        groups,
        pathway,
        index,
        (n) => n.classKey === classKey && (!isLeaf || n.leaves.some((l) => l.key === leafKey)),
        heuristic
      );
    }
  }

  if (!body) {
    body = '<p class="legend-empty">Click a neuron, a fiber type, a cell-type group or a cell type in the diagram to see its details.</p>';
  }
  container.innerHTML = header + body;
}

/** An HTML <table> of every neuron -> cell type mapping currently drawn, for the Excel export. */
export function buildExportTable(pathway, index) {
  const groupOf = new Map();
  for (const group of pathway.groups) group.cellTypes.forEach((c) => groupOf.set(c.iri, group));
  const header = [
    'SCKAN neuron',
    'Axon / fiber type',
    'Fiber class',
    'Fiber-type group',
    'Functional phenotype',
    'Threshold phenotype',
    'Cell type',
    'Local label',
    'Species',
    'Marker genes',
    'Neurotransmitter',
    'Neural circuit',
  ];
  const rows = [];
  for (const neuron of pathway.neurons) {
    for (const cell of index.cells.values()) {
      if (!cell.neurons.has(neuron.iri)) continue;
      const group = groupOf.get(cell.iri);
      rows.push([
        linkTo(neuron.label, neuron.iri),
        escapeHtml(neuron.axonLabel),
        escapeHtml(neuron.classLabel),
        escapeHtml(group?.leafLabel ?? ''),
        escapeHtml(group?.functional ?? ''),
        escapeHtml(group?.threshold ?? ''),
        linkTo(cell.label, cell.iri),
        escapeHtml(cell.localLabel),
        linkValues(cell.values.Species),
        linkValues(cell.values.Gene_Phenotype),
        linkValues(cell.values.Neurotransmitter_Phenotype),
        linkValues(cell.values.Neural_Circuit),
      ]);
    }
  }
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return table;
}
