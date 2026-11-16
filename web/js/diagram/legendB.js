// View (B)'s "candidate match evidence" panel - same interaction pattern as
// legend.js (View A): a highlighted selected match plus a plain "Other cell
// type matches" list below it, click-to-promote. Field set differs because
// candidate-mapping.json's ilxtr:hasCandidateCellType mapping stores
// different annotations than View A's ilxtr:isCompatibleWith mapping (see
// resource/sparql/candidate-mapping.rq): required soma/origin + circuit role
// + axon type, optional species/gene phenotype/functional/threshold/
// neurotransmitter phenotype/neural circuit - all rendered as the match's
// own evidence here (there's no "suggested phenotypes to add" distinction
// for View B). Each match is badged with how many of the 6 optional
// phenotype fields it actually shares (see data/candidateMatchScore.js) -
// "Other cell type matches" lists the strongest matches first.

import { linkTo, linkToValues } from '../shared/html.js';
import { resolveNodeLink } from '../data/curie.js';
import { OPTIONAL_PHENOTYPE_FIELDS, scoreCandidateRow, rankCandidatesByScore } from '../data/candidateMatchScore.js';

/**
 * Renders one candidate match's full evidence block (subtitle line + data
 * table) - used for both the currently selected match and every entry in
 * "Other cell type matches" so they're visually identical except for the
 * highlight styling.
 */
function renderMatchBlock(row, common) {
  const neuronCurie = resolveNodeLink(row.Neuron_Connected).curie ?? row.Neuron_Connected;
  const score = scoreCandidateRow(row);
  // The required criteria (soma, circuit role, axon type) are shown once at
  // the top; only repeat one for a match that differs from it.
  const somaRow =
    row.Origin === common.Origin
      ? ''
      : `<tr><th>Soma</th><td>${linkTo(row.Origin, row.Origin_IRI)}</td></tr>`;
  const roleRow =
    row.Circuit_Role === common.Circuit_Role
      ? ''
      : `<tr><th>Circuit role</th><td>${linkTo(row.Circuit_Role, row.Circuit_Role_IRI)}</td></tr>`;
  const axonRow =
    row.Axon_Type === common.Axon_Type
      ? ''
      : `<tr><th>Axon / fiber type</th><td>${linkTo(row.Axon_Type, row.Axon_Type_IRI)}</td></tr>`;
  // Fixed-order checklist: annotated phenotypes show their values, the rest are dimmed.
  const phenotypeRows = OPTIONAL_PHENOTYPE_FIELDS.map((f) =>
    row[f.key]
      ? `<tr class="phenotype-on"><th><span class="phenotype-mark">✓</span> ${f.label}</th><td>${linkToValues(row, f.key, `${f.key}_IRI`)}</td></tr>`
      : `<tr class="phenotype-off"><th><span class="phenotype-mark">○</span> ${f.label}</th><td>not annotated</td></tr>`
  ).join('');

  return `
    <p class="legend-subtitle">${linkTo(neuronCurie, row.Neuron_Connected)} (SCKAN)
      <span class="legend-arrow">⇢</span>
      ${linkTo(row.Cell_Type_Label, row.Cell_Type)}
      <span class="legend-match-score" title="${score} of ${OPTIONAL_PHENOTYPE_FIELDS.length} optional phenotypes are annotated on this cell type">${score}/${OPTIONAL_PHENOTYPE_FIELDS.length} supporting phenotypes</span></p>
    <table class="legend-evidence-table">
      <tbody>
        <tr><th>Local label</th><td>${linkTo(row.Cell_Type_Orig_Label, row.Cell_Type)}</td></tr>
        ${somaRow}
        ${roleRow}
        ${axonRow}
        ${phenotypeRows}
      </tbody>
    </table>
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

  // Best-scoring representative row per distinct PRECISION cell type (so
  // "Other cell type matches" lists each candidate once, strongest match
  // first), minus whichever cell type is currently selected above.
  const byCellType = new Map(rankCandidatesByScore(allRows ?? []).map((r) => [r.Cell_Type, r]));
  byCellType.set(row.Cell_Type, row); // the selected row always wins for its own entry
  const others = [...byCellType.values()]
    .filter((r) => r.Cell_Type !== row.Cell_Type)
    .sort((a, b) => scoreCandidateRow(b) - scoreCandidateRow(a) || a.Cell_Type_Label.localeCompare(b.Cell_Type_Label));

  container.innerHTML = `
    <h3 class="legend-title">Candidate match evidence</h3>
    <h4 class="legend-subtitle legend-common-title">Matched on (all candidates)</h4>
    <table class="legend-evidence-table legend-common-table">
      <tbody>
        <tr><th>Soma</th><td>${linkTo(row.Origin, row.Origin_IRI)}</td></tr>
        <tr><th>Circuit role</th><td>${linkTo(row.Circuit_Role, row.Circuit_Role_IRI)}</td></tr>
        <tr><th>Axon / fiber type</th><td>${linkTo(row.Axon_Type, row.Axon_Type_IRI)}</td></tr>
      </tbody>
    </table>
    <div class="legend-selected-match">${renderMatchBlock(row, row)}</div>
    ${
      others.length
        ? `
      <h4 class="legend-subtitle legend-other-header">Other cell type matches</h4>
      <div class="legend-other-list">
        ${others
          .map(
            (r) => `
          <div class="legend-match-card" data-cell-type="${encodeURIComponent(r.Cell_Type)}">${renderMatchBlock(r, row)}</div>`
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
