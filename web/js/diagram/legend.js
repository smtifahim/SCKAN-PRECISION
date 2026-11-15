// Renders the "candidate match evidence" panel shown when a user clicks a
// dotted candidate-match edge, listing the RDF-star-stored matched evidence
// plus candidate phenotypes the cell type suggests could be added to the
// SCKAN population. (The style legend itself is rendered as a Graphviz
// diagram - see diagram/legendDiagram.js - so its text sits inside the
// shapes and it composes losslessly with the main diagram on PNG export.)

import { linkTo, linkToValues, formatCitation } from '../shared/html.js';
import { resolveNodeLink } from '../data/curie.js';

const CANDIDATE_PHENOTYPE_FIELDS = [
  { key: 'Axon_Type', iriKey: 'Axon_Type_IRI', label: 'Axon / fiber type' },
  { key: 'Functional_Phenotype', iriKey: 'Functional_Phenotype_IRI', label: 'Functional phenotype' },
  { key: 'Threshold_Phenotype', iriKey: 'Threshold_Phenotype_IRI', label: 'Threshold phenotype' },
  { key: 'Neurotransmitter_Phenotype', iriKey: 'Neurotransmitter_Phenotype_IRI', label: 'Neurotransmitter phenotype' },
  { key: 'Neural_Circuit', iriKey: 'Neural_Circuit_IRI', label: 'Neural circuit membership' },
];

/**
 * Renders one candidate match's full evidence block (subtitle line, data
 * table, and suggested-phenotype list) - used for both the currently
 * selected match and every entry in "Other cell type matches" so they're
 * visually identical except for the highlight styling.
 */
function renderMatchBlock(row) {
  const suggested = CANDIDATE_PHENOTYPE_FIELDS.filter((f) => row[f.key]);
  const neuronCurie = resolveNodeLink(row.Neuron_Connected).curie ?? row.Neuron_Connected;

  return `
    <p class="legend-subtitle">${linkTo(neuronCurie, row.Neuron_Connected)} (SCKAN)
      <span class="legend-arrow">⇢</span>
      ${linkTo(row.Cell_Type_Label, row.Cell_Type)}</p>
    <table class="legend-evidence-table">
      <tbody>
        <tr><th>Local label</th><td>${linkTo(row.Cell_Type_Orig_Label, row.Cell_Type)}</td></tr>
        <tr><th>Soma</th><td>${linkTo(row.Origin, row.Origin_Structure)}</td></tr>
        <tr><th>Species</th><td>${linkToValues(row, 'Species', 'Species_IRI')}</td></tr>
        <tr><th>Marker gene</th><td>${linkToValues(row, 'Gene_Label', 'Gene_IRI')}</td></tr>
        <tr><th>Circuit role</th><td>${linkTo(row.Circuit_Role, row.Circuit_Role_IRI)}</td></tr>
        <tr><th>End organ</th><td>${linkTo(row.End_Organ, row.End_Organ_IRI)}</td></tr>
        ${row.Literature_Citation ? `<tr><th>Citation</th><td>${formatCitation(row.Literature_Citation)}</td></tr>` : ''}
      </tbody>
    </table>
    ${
      suggested.length
        ? `
      <h4 class="legend-subtitle">Candidate phenotypes to consider adding to this SCKAN population</h4>
      <ul class="legend-suggested-list">
        ${suggested
          .map((f) => `<li><strong>${f.label}:</strong> ${linkToValues(row, f.key, f.iriKey)}</li>`)
          .join('')}
      </ul>`
        : ''
    }
  `;
}

/**
 * @param {HTMLElement} container
 * @param {{annotation: {row: Object, somaIri: string, cellTypeIri: string}, allRows: Object[], onSelectRow: (row: Object) => void}|null} context
 */
export function renderEdgeLegend(container, context) {
  if (!context) {
    container.innerHTML = `
      <h3 class="legend-title">Candidate match evidence</h3>
      <p class="legend-empty">Click a dotted edge or a PRECISION cell type in the diagram to see what was matched between the SCKAN population and the candidate PRECISION cell type.</p>
    `;
    return;
  }

  const { annotation, allRows, onSelectRow } = context;
  const { row } = annotation;

  // De-duplicate the candidate rows for this population down to one
  // representative row per distinct PRECISION cell type, so "Other cell
  // type matches" lists each candidate once regardless of how many soma
  // nodes point to it in the diagram.
  const byCellType = new Map();
  for (const r of allRows ?? []) {
    if (!byCellType.has(r.Cell_Type)) byCellType.set(r.Cell_Type, r);
  }
  byCellType.set(row.Cell_Type, row); // the selected row always wins for its own entry
  const others = [...byCellType.values()].filter((r) => r.Cell_Type !== row.Cell_Type);

  container.innerHTML = `
    <h3 class="legend-title">Candidate match evidence</h3>
    <div class="legend-selected-match">${renderMatchBlock(row)}</div>
    ${
      others.length
        ? `
      <h4 class="legend-subtitle legend-other-header">Other cell type matches</h4>
      <div class="legend-other-list">
        ${others
          .map(
            (r) => `
          <div class="legend-match-card" data-cell-type="${encodeURIComponent(r.Cell_Type)}">${renderMatchBlock(r)}</div>`
          )
          .join('')}
      </div>`
        : ''
    }
  `;

  if (onSelectRow) {
    container.querySelectorAll('.legend-match-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('a')) return; // let links navigate normally instead of selecting the card
        const cellTypeIri = decodeURIComponent(card.dataset.cellType);
        const nextRow = byCellType.get(cellTypeIri);
        if (nextRow) onSelectRow(nextRow);
      });
    });
  }
}
