// Alternative grid/table view: one row per (SCKAN population × candidate
// PRECISION cell type) pair for the currently filtered dataset, so the user
// gets a flat, sortable overview instead of browsing diagrams one at a time.
// Populations with no stored candidate yet still get a row, so the table
// also doubles as a coverage checklist.

import { linkTo, formatCitation, escapeHtml } from '../shared/html.js';
import { resolveNodeLink } from '../data/curie.js';

const DATA_COLUMN_COUNT = 9; // species, gene, circuit role, cell type, axon type, threshold, neurotransmitter, neural circuit, citation

/**
 * @param {HTMLElement} container
 * @param {Array<{iri:string,label:string,hasAnyCandidates:boolean}>} populationList
 * @param {Array<Object>} filteredRows - rows from computeFacetState().filteredRows
 */
export function renderTableView(container, populationList, filteredRows) {
  const rowsByNeuron = new Map();
  for (const row of filteredRows) {
    if (!rowsByNeuron.has(row.Neuron_Connected)) rowsByNeuron.set(row.Neuron_Connected, []);
    rowsByNeuron.get(row.Neuron_Connected).push(row);
  }

  const bodyRows = [];
  for (const population of populationList) {
    const matches = rowsByNeuron.get(population.iri) ?? [];
    const curie = resolveNodeLink(population.iri).curie ?? population.iri;
    if (matches.length === 0) {
      bodyRows.push(`
        <tr class="table-row-empty">
          <td>${linkTo(curie, population.iri)}</td>
          <td>${escapeHtml(population.label)}</td>
          <td colspan="${DATA_COLUMN_COUNT}" class="table-empty-cell">${
            population.hasAnyCandidates ? 'No match under current filters' : 'No PRECISION candidates yet'
          }</td>
        </tr>`);
      continue;
    }
    for (const row of matches) {
      bodyRows.push(`
        <tr>
          <td>${linkTo(curie, population.iri)}</td>
          <td>${escapeHtml(population.label)}</td>
          <td>${linkTo(row.Species, row.Species_IRI)}</td>
          <td>${linkTo(row.Gene_Label, row.Gene_IRI)}</td>
          <td>${linkTo(row.Circuit_Role, row.Circuit_Role_IRI)}</td>
          <td>${linkTo(row.Cell_Type_Label, row.Cell_Type)}</td>
          <td>${linkTo(row.Axon_Type, row.Axon_Type_IRI)}</td>
          <td>${linkTo(row.Threshold_Phenotype, row.Threshold_Phenotype_IRI)}</td>
          <td>${linkTo(row.Neurotransmitter_Phenotype, row.Neurotransmitter_Phenotype_IRI)}</td>
          <td>${linkTo(row.Neural_Circuit, row.Neural_Circuit_IRI)}</td>
          <td>${formatCitation(row.Literature_Citation)}</td>
        </tr>`);
    }
  }

  container.innerHTML = `
    <table id="candidate-mapping-table" class="data-table">
      <thead>
        <tr>
          <th>SCKAN Population</th>
          <th>Preferred Label</th>
          <th>Species</th>
          <th>Marker Gene</th>
          <th>Circuit Role</th>
          <th>Candidate Cell Type</th>
          <th>Axon Type</th>
          <th>Threshold Phenotype</th>
          <th>Neurotransmitter Phenotype</th>
          <th>Neural Circuit Membership</th>
          <th>Citation</th>
        </tr>
      </thead>
      <tbody>${bodyRows.join('') || `<tr><td colspan="${DATA_COLUMN_COUNT + 2}" class="table-empty-cell">No populations match the current filters.</td></tr>`}</tbody>
    </table>
  `;
}
