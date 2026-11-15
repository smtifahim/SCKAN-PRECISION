// Orchestrates View (B): candidate PRECISION cell type mapping via
// ilxtr:hasCandidateCellType (see resource/sparql/candidate-mapping.rq).
// Structurally identical to View (A) - same cascading filters, partial-order
// diagram with dotted candidate-match edges, population caption table,
// evidence panel and alternative table view - just pointed at
// candidate-mapping.json's different field set (required soma location +
// circuit role + axon type; optional species/gene/functional/threshold/
// neurotransmitter/neural-circuit phenotype evidence instead - no End
// Organ on the mapping itself, that only exists in drg-end-organs.json).

import { loadViewBModel } from '../data/viewBModel.js';
import { createEmptyFilterState, computeFacetState, computePopulationList } from '../filters/cascadeB.js';
import { createAutocomplete } from '../filters/autocomplete.js';
import { createFiberTypeSelect } from '../filters/fiberTypeSelect.js';
import { createFacetSearch } from '../filters/facetSearch.js';
import { buildPopulationDot } from '../diagram/graphBuilder.js';
import { buildLegendDot } from '../diagram/legendDiagram.js';
import { renderDotInto } from '../diagram/render.js';
import { getInitialPathwayMode } from '../diagram/pathwayDirection.js';
import { clearZoomControls } from '../diagram/zoomPan.js';
import { renderEdgeLegend } from '../diagram/legendB.js';
import { exportDiagramPng } from '../diagram/exportPng.js';
import { renderTableView } from './tableViewB.js';
import { exportTableAsExcel } from './exportExcel.js';
import { makeResizable, makeVerticallyResizable } from './resizablePanel.js';
import { resolveNodeLink } from '../data/curie.js';
import { collectPartialOrderChain } from '../data/partialOrderChain.js';
import { OPTIONAL_PHENOTYPE_FIELDS, scoreCandidateRow } from '../data/candidateMatchScore.js';
import { mergeCandidateRowsByCellType } from '../data/mergeCandidateRows.js';
import { linkTo, escapeHtml } from '../shared/html.js';
import { buildCandidateRows, handleCandidateToggleClick, observeCandidateCollapse, refreshCandidateCollapse } from '../shared/candidateRows.js';

// One edge/row per candidate cell type: a cell type backed by several marker
// genes (etc.) is merged, with those values listed together.
const MERGED_FIELDS = OPTIONAL_PHENOTYPE_FIELDS.map((f) => ({ key: f.key, iriKey: `${f.key}_IRI` }));

function candidateEdgeTooltip(row) {
  const parts = ['Candidate match (hasCandidateCellType)'];
  if (row.Circuit_Role) parts.push(`Circuit role: ${row.Circuit_Role}`);
  if (row.Axon_Type) parts.push(`Axon / fiber type: ${row.Axon_Type}`);
  if (row.Species) parts.push(`Species: ${row.Species}`);
  if (row.Gene_Phenotype) parts.push(`Gene phenotype: ${row.Gene_Phenotype}`);
  parts.push(`Match score: ${scoreCandidateRow(row)}/${OPTIONAL_PHENOTYPE_FIELDS.length}`);
  return parts.join(' | ');
}

export async function initViewB(root) {
  const model = await loadViewBModel();

  const state = createEmptyFilterState(model.defaultEndOrganIri);
  let rankdir = 'LR';
  let pathwayMode = getInitialPathwayMode(); // 'projection' (default) or 'signal'; ?pathway= sets the initial one
  let activeView = 'diagram'; // 'diagram' | 'table'
  let selectedNeuronIri = null;
  let selectedCandidateRow = null; // the candidate match currently shown in the evidence panel
  let currentChainNeuronIris = []; // selected neuron + any downstream/relay neurons chained via Target_Neuron

  const els = {
    endOrgan: root.querySelector('#filter-end-organ-b'),
    species: root.querySelector('#filter-species-b'),
    gene: root.querySelector('#filter-gene-b'),
    axonType: root.querySelector('#filter-axon-type-b'),
    functionalPhenotype: root.querySelector('#filter-functional-phenotype-b'),
    thresholdPhenotype: root.querySelector('#filter-threshold-phenotype-b'),
    neurotransmitterPhenotype: root.querySelector('#filter-neurotransmitter-phenotype-b'),
    neuralCircuit: root.querySelector('#filter-neural-circuit-b'),
    resetBtn: root.querySelector('#btn-reset-b'),
    layoutToggle: root.querySelector('#layout-toggle-b'),
    pathwayToggle: root.querySelector('#pathway-toggle-b'),
    viewToggle: root.querySelector('#view-toggle-b'),
    exportPngBtn: root.querySelector('#btn-export-png-b'),
    exportExcelBtn: root.querySelector('#btn-export-excel-b'),
    topLegend: root.querySelector('#top-legend-b'),
    diagramContainer: root.querySelector('#diagram-container-b'),
    diagramCaption: root.querySelector('#diagram-caption-b'),
    tableContainer: root.querySelector('#table-container-b'),
    edgeLegend: root.querySelector('#edge-legend-b'),
    evidencePanel: root.querySelector('#evidence-panel-b'),
    resizeHandle: root.querySelector('#resize-handle-b'),
    populationCaptionTable: root.querySelector('#population-caption-table-b'),
    populationResizeHandle: root.querySelector('#population-resize-handle-b'),
  };

  renderEdgeLegend(els.edgeLegend, null);
  makeResizable({ handle: els.resizeHandle, panel: els.evidencePanel, minWidth: 260, maxRatio: 0.35 });
  makeVerticallyResizable({
    handle: els.populationResizeHandle,
    scrollEl: els.populationCaptionTable,
    minHeight: 48,
    maxRatio: 0.5,
  });
  await renderDotInto(els.topLegend, buildLegendDot());

  const endOrganSearch = createFacetSearch(model.endOrganOptions, model.synonymIndexes.organ);
  const endOrganField = createAutocomplete({
    container: els.endOrgan,
    label: 'End organ',
    placeholder: 'e.g. skin of body',
    search: endOrganSearch,
    onChange: (entry) => {
      state.endOrganIri = entry?.iri ?? model.defaultEndOrganIri;
      selectedNeuronIri = null;
      selectedCandidateRow = null;
      refresh();
    },
  });
  endOrganField.setValue(model.endOrganOptions.find((o) => o.iri === model.defaultEndOrganIri) ?? null);

  const speciesField = createAutocomplete({
    container: els.species,
    label: 'Species',
    placeholder: 'e.g. human, mouse…',
    search: (q) => createFacetSearch(currentFacetState.availableSpecies, model.synonymIndexes.species)(q),
    onChange: (entry) => {
      state.speciesIri = entry?.iri ?? null;
      refresh();
    },
  });

  const geneField = createAutocomplete({
    container: els.gene,
    label: 'Marker gene',
    placeholder: 'e.g. PIEZO2…',
    search: (q) => createFacetSearch(currentFacetState.availableGenes, model.synonymIndexes.gene)(q),
    onChange: (entry) => {
      state.geneIri = entry?.iri ?? null;
      refresh();
    },
  });

  const axonTypeField = createFiberTypeSelect({
    container: els.axonType,
    label: 'Axon / fiber type',
    fiberHierarchy: model.fiberHierarchy,
    onChange: (entry) => {
      state.axonTypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const functionalPhenotypeField = createAutocomplete({
    container: els.functionalPhenotype,
    label: 'Functional phenotype',
    placeholder: 'e.g. mechanosensitive…',
    search: (q) => createFacetSearch(currentFacetState.availableFunctionalPhenotypes)(q),
    onChange: (entry) => {
      state.functionalPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const thresholdPhenotypeField = createAutocomplete({
    container: els.thresholdPhenotype,
    label: 'Threshold phenotype',
    placeholder: 'e.g. low-threshold…',
    search: (q) => createFacetSearch(currentFacetState.availableThresholdPhenotypes)(q),
    onChange: (entry) => {
      state.thresholdPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const neurotransmitterPhenotypeField = createAutocomplete({
    container: els.neurotransmitterPhenotype,
    label: 'Neurotransmitter',
    placeholder: 'e.g. peptide…',
    search: (q) => createFacetSearch(currentFacetState.availableNeurotransmitterPhenotypes)(q),
    onChange: (entry) => {
      state.neurotransmitterPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const neuralCircuitField = createAutocomplete({
    container: els.neuralCircuit,
    label: 'Neural circuit',
    placeholder: 'e.g. nociceptive…',
    search: (q) => createFacetSearch(currentFacetState.availableNeuralCircuits)(q),
    onChange: (entry) => {
      state.neuralCircuitIri = entry?.iri ?? null;
      refresh();
    },
  });

  els.resetBtn.addEventListener('click', () => {
    Object.assign(state, createEmptyFilterState(model.defaultEndOrganIri));
    selectedNeuronIri = null;
    selectedCandidateRow = null;
    endOrganField.setValue(model.endOrganOptions.find((o) => o.iri === model.defaultEndOrganIri) ?? null);
    speciesField.clear();
    geneField.clear();
    axonTypeField.clear();
    functionalPhenotypeField.clear();
    thresholdPhenotypeField.clear();
    neurotransmitterPhenotypeField.clear();
    neuralCircuitField.clear();
    refresh();
  });

  els.layoutToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-rankdir]');
    if (!btn) return;
    rankdir = btn.dataset.rankdir;
    [...els.layoutToggle.querySelectorAll('button')].forEach((b) => b.classList.toggle('is-active', b === btn));
    renderDiagram();
  });

  function syncPathwayToggle() {
    [...els.pathwayToggle.querySelectorAll('button')].forEach((b) =>
      b.classList.toggle('is-active', b.dataset.pathway === pathwayMode)
    );
  }
  syncPathwayToggle();
  els.pathwayToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-pathway]');
    if (!btn || btn.dataset.pathway === pathwayMode) return;
    pathwayMode = btn.dataset.pathway;
    syncPathwayToggle();
    renderDiagram();
  });

  els.viewToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-view]');
    if (!btn) return;
    activeView = btn.dataset.view;
    [...els.viewToggle.querySelectorAll('button')].forEach((b) => b.classList.toggle('is-active', b === btn));
    syncViewVisibility();
  });

  els.exportPngBtn.addEventListener('click', () => {
    const legendSvgEl = els.topLegend.querySelector('svg');
    const diagramSvgEl = els.diagramContainer.querySelector('svg');
    if (!legendSvgEl || !diagramSvgEl || !selectedNeuronIri) return;
    const captionRows = currentChainNeuronIris.map((iri) => {
      const link = resolveNodeLink(iri);
      return { curie: link.curie ?? iri, label: model.neuronLabelByIri.get(iri) ?? iri };
    });
    const safeCurie = (captionRows[0]?.curie ?? 'diagram').replace(/[^a-z0-9_-]+/gi, '-');
    exportDiagramPng({
      legendSvgEl,
      diagramSvgEl,
      captionRows,
      filename: `sckan-precision-candidate-${safeCurie}.png`,
    }).catch((err) => console.error('Failed to export diagram PNG', err));
  });

  els.exportExcelBtn.addEventListener('click', () => {
    const tableEl = els.tableContainer.querySelector('#candidate-mapping-table-b');
    if (!tableEl) return;
    exportTableAsExcel(tableEl, 'sckan-precision-candidate-mappings-b.xls');
  });

  let currentFacetState = computeFacetState(model, state);

  function refresh() {
    currentFacetState = computeFacetState(model, state);
    axonTypeField.setAvailableIris(currentFacetState.availableAxonTypeIris);

    const populationList = computePopulationList(model, state, currentFacetState);
    renderPopulationCaption(populationList);

    if (!populationList.some((p) => p.iri === selectedNeuronIri)) {
      selectedNeuronIri = populationList[0]?.iri ?? null;
      selectedCandidateRow = null;
    }

    renderDiagram();
    renderTableView(els.tableContainer, populationList, currentFacetState.filteredRows);
  }

  function buildCandidatesCell(p) {
    if (!p.hasAnyCandidates) {
      return '<span class="population-badge population-badge-none">no candidates yet</span>';
    }
    const pill = `<span class="population-badge population-badge-match">${p.matchedCandidateCount} candidate${p.matchedCandidateCount === 1 ? '' : 's'}</span>`;
    // Already sorted strongest-match-first by cascadeB.js; show each
    // candidate's phenotype-overlap score alongside its label.
    const chips = p.matchedCandidates.map(
      (c) => `<span class="candidate-chip">${linkTo(c.label, c.iri)} <span class="candidate-chip-score">${c.score}/${OPTIONAL_PHENOTYPE_FIELDS.length}</span></span>`
    );
    return buildCandidateRows(pill, chips);
  }

  let userResizedPopulationPanel = false;
  els.populationResizeHandle.addEventListener('pointerdown', () => {
    userResizedPopulationPanel = true;
  });

  function renderPopulationCaption(populationList) {
    if (populationList.length === 0) {
      els.populationCaptionTable.innerHTML = '<p class="population-empty">No SCKAN populations match the current filters.</p>';
      return;
    }
    const rows = populationList
      .map((p) => {
        const link = resolveNodeLink(p.iri);
        const active = p.iri === selectedNeuronIri ? ' is-active' : '';
        return `
          <tr class="population-row${active}" data-iri="${encodeURIComponent(p.iri)}">
            <td class="population-curie-cell">
              <a href="${link.url}" target="_blank" rel="noopener" class="population-curie-link">${link.curie ?? p.iri}</a>
            </td>
            <td class="population-label-cell">${escapeHtml(p.label)}</td>
            <td class="population-count-cell">${buildCandidatesCell(p)}</td>
          </tr>`;
      })
      .join('');

    els.populationCaptionTable.innerHTML = `
      <table class="population-caption-table">
        <thead>
          <tr>
            <th class="col-population">SCKAN Population</th>
            <th class="col-connectivity">Neural Connectivity</th>
            <th class="col-candidates">Candidate Cell Types</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Collapse overflowing candidate lists first, so the auto-sizing below
    // measures the rows at their collapsed height.
    refreshCandidateCollapse(els.populationCaptionTable);

    // Default to showing just the header plus the first two rows; scrolling
    // reveals the rest. Skip this once the user has manually resized the
    // panel, so their choice persists across filter changes.
    autoSizePopulationPanel();
  }

  function autoSizePopulationPanel() {
    if (userResizedPopulationPanel) return;
    const el = els.populationCaptionTable;

    // Measure with the scroller's own max-height/overflow constraints
    // suspended: if the table's natural content is already taller than the
    // panel's CSS max-height (50vh), a scrollbar would otherwise appear
    // *during this very measurement*, narrowing the columns, wrapping text
    // further, and inflating the row heights we're about to measure.
    const previousMaxHeight = el.style.maxHeight;
    const previousOverflow = el.style.overflowY;
    el.style.maxHeight = 'none';
    el.style.overflowY = 'visible';

    const theadEl = el.querySelector('thead');
    const bodyRows = [...el.querySelectorAll('tbody tr')].slice(0, 2);
    const visibleHeight = (theadEl?.getBoundingClientRect().height ?? 0)
      + bodyRows.reduce((sum, r) => sum + r.getBoundingClientRect().height, 0);

    el.style.maxHeight = previousMaxHeight;
    el.style.overflowY = previousOverflow;
    if (visibleHeight > 0) {
      el.style.height = `${Math.ceil(visibleHeight)}px`;
    }
  }

  observeCandidateCollapse(els.populationCaptionTable, autoSizePopulationPanel);

  els.populationCaptionTable.addEventListener('click', (event) => {
    if (handleCandidateToggleClick(event.target)) return; // expand/collapse only, don't select the population
    if (event.target.closest('.population-curie-link')) return; // let the external link navigate normally
    const row = event.target.closest('.population-row');
    if (!row) return;
    selectedNeuronIri = decodeURIComponent(row.dataset.iri);
    selectedCandidateRow = null;
    [...els.populationCaptionTable.querySelectorAll('.population-row')].forEach((r) =>
      r.classList.toggle('is-active', r === row)
    );
    renderDiagram();
  });

  let renderToken = 0;

  function renderDiagram() {
    const token = ++renderToken;
    if (!selectedNeuronIri) {
      clearZoomControls(els.diagramContainer);
      els.diagramContainer.innerHTML = '<p class="diagram-empty">Select a SCKAN population below to view its route diagram.</p>';
      els.diagramCaption.innerHTML = '';
      currentChainNeuronIris = [];
      return;
    }
    // Follow the Target_Neuron chain: a primary afferent's pathway can
    // continue past a synapse into a second (relay/projection) neuron's own
    // partial order - render and caption both as one continuous pathway.
    const { rows: partialOrderRows, chainNeuronIris } = collectPartialOrderChain(
      selectedNeuronIri,
      model.partialOrderByNeuron
    );
    currentChainNeuronIris = chainNeuronIris;
    const candidateRows = mergeCandidateRowsByCellType(
      currentFacetState.filteredRows.filter((r) => r.Neuron_Connected === selectedNeuronIri),
      MERGED_FIELDS
    );
    const endOrganLabel = model.endOrganOptions.find((o) => o.iri === state.endOrganIri)?.label;
    els.diagramCaption.innerHTML = chainNeuronIris
      .map((iri) => {
        const label = model.neuronLabelByIri.get(iri) ?? iri;
        return `<div><strong>${linkTo(resolveNodeLink(iri).curie ?? iri, iri)}</strong> ${escapeHtml(label)}</div>`;
      })
      .join('');

    const { dot, edgeAnnotations, cellTypeNodeIds } = buildPopulationDot(selectedNeuronIri, {
      partialOrderRows,
      candidateRows,
      rankdir,
      pathwayMode,
      endOrganLabel,
      buildEdgeTooltip: candidateEdgeTooltip,
    });

    // Keep the evidence panel's current selection across re-renders (layout
    // toggle, filter changes) as long as that candidate cell type is still
    // among this population's current candidates (re-resolved so it reflects
    // the current merged values); otherwise fall back to the empty state.
    if (selectedCandidateRow) {
      selectedCandidateRow = candidateRows.find((r) => r.Cell_Type === selectedCandidateRow.Cell_Type) ?? null;
    }

    function showEdgeLegend(row) {
      selectedCandidateRow = row;
      renderEdgeLegend(els.edgeLegend, {
        annotation: { row },
        allRows: candidateRows,
        onSelectRow: showEdgeLegend,
      });
    }

    if (selectedCandidateRow) {
      showEdgeLegend(selectedCandidateRow);
    } else {
      renderEdgeLegend(els.edgeLegend, null);
    }

    renderDotInto(els.diagramContainer, dot, {
      zoomable: true,
      onCandidateEdgeClick: (edgeId) => {
        const annotation = edgeAnnotations.get(edgeId);
        if (annotation) showEdgeLegend(annotation.row);
      },
      onCellTypeNodeClick: (nodeId) => {
        const row = candidateRows.find((r) => r.Cell_Type === cellTypeNodeIds.get(nodeId));
        if (row) showEdgeLegend(row);
      },
    }).catch((err) => {
      if (token !== renderToken) return;
      console.error('Failed to render diagram', err);
      clearZoomControls(els.diagramContainer);
      els.diagramContainer.innerHTML = '<p class="diagram-empty">Could not render this diagram. See console for details.</p>';
    });
  }

  function syncViewVisibility() {
    els.diagramContainer.closest('.diagram-panel').hidden = activeView !== 'diagram';
    els.tableContainer.closest('.table-panel').hidden = activeView !== 'table';
    els.evidencePanel.hidden = activeView !== 'diagram';
    els.resizeHandle.hidden = activeView !== 'diagram';
    els.topLegend.closest('.legend-panel-row').hidden = activeView !== 'diagram';
    els.populationCaptionTable.closest('.population-panel-box').hidden = activeView !== 'diagram';
  }

  syncViewVisibility();
  refresh();

  // Row heights (and therefore the auto-sized "2 rows visible" default) can
  // shift once web fonts finish loading, since the fallback font used for
  // the very first paint usually wraps text differently. Re-measure once
  // fonts are ready, as long as the user hasn't already resized the panel.
  document.fonts?.ready?.then(autoSizePopulationPanel);
}
