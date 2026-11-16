// Orchestrates View (C): Neural Circuits & Function. Same filters as View (B)
// (cascadeB.js), applied to candidate-mapping-test.json; everything is shown
// on load and each filter change regenerates the pathway diagram
// (Neuron -> myelinated / unmyelinated -> [peptidergic / non-peptidergic C] -> cell-type groups).

import { loadViewCModel } from '../data/viewCModel.js';
import { createEmptyFilterState, computeFacetState } from '../filters/cascadeB.js';
import { createAutocomplete } from '../filters/autocomplete.js';
import { createFiberTypeSelect } from '../filters/fiberTypeSelect.js';
import { createFacetSearch } from '../filters/facetSearch.js';
import {
  buildPathwayModel,
  buildNeuralCircuitDot,
  generatePathwayCaption,
  generatePathwayNote,
  selectionKey,
  CELL_HREF_PREFIX,
} from '../diagram/neuralCircuitBuilder.js';
import { renderDetails, indexRows, buildExportTable } from '../diagram/legendC.js';
import { renderDotInto } from '../diagram/render.js';
import { exportDiagramPng } from '../diagram/exportPng.js';
import { clearZoomControls } from '../diagram/zoomPan.js';
import { makeResizable } from './resizablePanel.js';
import { exportTableAsExcel } from './exportExcel.js';

export async function initViewC(root) {
  const model = await loadViewCModel();
  const { fiberHierarchy } = model;

  const state = createEmptyFilterState(null); // no default end organ: show everything
  let rankdir = 'LR';
  let renderToken = 0;
  let selection = null; // { kind, key } shown in the details panel
  let pathway = buildPathwayModel([], fiberHierarchy);
  let rowIndex = indexRows([]);
  let targets = new Map(); // diagram node id -> what clicking it selects

  const els = {
    endOrgan: root.querySelector('#filter-end-organ-c'),
    species: root.querySelector('#filter-species-c'),
    gene: root.querySelector('#filter-gene-c'),
    axonType: root.querySelector('#filter-axon-type-c'),
    functionalPhenotype: root.querySelector('#filter-functional-phenotype-c'),
    thresholdPhenotype: root.querySelector('#filter-threshold-phenotype-c'),
    neurotransmitterPhenotype: root.querySelector('#filter-neurotransmitter-phenotype-c'),
    neuralCircuit: root.querySelector('#filter-neural-circuit-c'),
    resetBtn: root.querySelector('#btn-reset-c'),
    layoutToggle: root.querySelector('#layout-toggle-c'),
    exportPngBtn: root.querySelector('#btn-export-png-c'),
    diagramContainer: root.querySelector('#diagram-container-c'),
    diagramCaption: root.querySelector('#diagram-caption-c'),
    diagramNote: root.querySelector('#diagram-note-c'),
    resizeHandle: root.querySelector('#resize-handle-c'),
    evidencePanel: root.querySelector('#evidence-panel-c'),
    details: root.querySelector('#details-c'),
  };

  makeResizable({ handle: els.resizeHandle, panel: els.evidencePanel, minWidth: 260, maxRatio: 0.35 });

  // The end organ isn't a column on the mapping rows; it scopes which SCKAN
  // neurons are in play (via drg-end-organs.json), so it is applied before
  // the other facets are cascaded.
  const neuronsWithCandidates = new Set(model.candidateMappingRows.map((r) => r.Neuron_Connected));
  const endOrganOptions = model.endOrganOptions.filter((organ) =>
    [...(model.populationsByEndOrgan.get(organ.iri)?.keys() ?? [])].some((iri) => neuronsWithCandidates.has(iri))
  );

  function scopedModel() {
    const population = state.endOrganIri ? model.populationsByEndOrgan.get(state.endOrganIri) : null;
    if (!population) return model;
    return {
      ...model,
      candidateMappingRows: model.candidateMappingRows.filter((r) => population.has(r.Neuron_Connected)),
    };
  }

  let facetState = computeFacetState(model, state);

  const endOrganField = createAutocomplete({
    container: els.endOrgan,
    label: 'End organ',
    placeholder: 'e.g. skin of body',
    search: createFacetSearch(endOrganOptions, model.synonymIndexes.organ),
    onChange: (entry) => {
      state.endOrganIri = entry?.iri ?? null;
      refresh();
    },
  });

  const lazySearch = (getOptions, synonymIndex = null) => (q) => createFacetSearch(getOptions(), synonymIndex)(q);

  const speciesField = createAutocomplete({
    container: els.species,
    label: 'Species',
    placeholder: 'e.g. human, mouse…',
    search: lazySearch(() => facetState.availableSpecies, model.synonymIndexes.species),
    onChange: (entry) => {
      state.speciesIri = entry?.iri ?? null;
      refresh();
    },
  });

  const geneField = createAutocomplete({
    container: els.gene,
    label: 'Marker gene',
    placeholder: 'e.g. PIEZO2…',
    search: lazySearch(() => facetState.availableGenes, model.synonymIndexes.gene),
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
    search: lazySearch(() => facetState.availableFunctionalPhenotypes),
    onChange: (entry) => {
      state.functionalPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const thresholdPhenotypeField = createAutocomplete({
    container: els.thresholdPhenotype,
    label: 'Threshold phenotype',
    placeholder: 'e.g. low-threshold…',
    search: lazySearch(() => facetState.availableThresholdPhenotypes),
    onChange: (entry) => {
      state.thresholdPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const neurotransmitterPhenotypeField = createAutocomplete({
    container: els.neurotransmitterPhenotype,
    label: 'Neurotransmitter',
    placeholder: 'e.g. peptide…',
    search: lazySearch(() => facetState.availableNeurotransmitterPhenotypes),
    onChange: (entry) => {
      state.neurotransmitterPhenotypeIri = entry?.iri ?? null;
      refresh();
    },
  });

  const neuralCircuitField = createAutocomplete({
    container: els.neuralCircuit,
    label: 'Neural circuit',
    placeholder: 'e.g. nociceptive…',
    search: lazySearch(() => facetState.availableNeuralCircuits),
    onChange: (entry) => {
      state.neuralCircuitIri = entry?.iri ?? null;
      refresh();
    },
  });

  els.resetBtn.addEventListener('click', () => {
    Object.assign(state, createEmptyFilterState(null));
    [
      endOrganField,
      speciesField,
      geneField,
      axonTypeField,
      functionalPhenotypeField,
      thresholdPhenotypeField,
      neurotransmitterPhenotypeField,
      neuralCircuitField,
    ].forEach((field) => field.clear());
    refresh();
  });

  els.layoutToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-rankdir]');
    if (!btn) return;
    rankdir = btn.dataset.rankdir;
    [...els.layoutToggle.querySelectorAll('button')].forEach((b) => b.classList.toggle('is-active', b === btn));
    renderDiagram();
  });

  els.exportPngBtn.addEventListener('click', () => {
    const diagramSvgEl = els.diagramContainer.querySelector('svg');
    if (!diagramSvgEl) return;
    exportDiagramPng({ diagramSvgEl, filename: 'sckan-precision-neural-circuits.png' }).catch((err) =>
      console.error('Failed to export diagram PNG', err)
    );
  });

  // [name, value] for every filter that is set, shown at the top of the details panel.
  function activeFilters() {
    const text = (el) => el.querySelector('input')?.value.trim() ?? '';
    return [
      state.endOrganIri && ['End organ', text(els.endOrgan)],
      state.speciesIri && ['Species', text(els.species)],
      state.geneIri && ['Marker gene', text(els.gene)],
      state.axonTypeIri && ['Axon / fiber type', els.axonType.querySelector('button span')?.textContent.trim()],
      state.functionalPhenotypeIri && ['Functional phenotype', text(els.functionalPhenotype)],
      state.thresholdPhenotypeIri && ['Threshold phenotype', text(els.thresholdPhenotype)],
      state.neurotransmitterPhenotypeIri && ['Neurotransmitter', text(els.neurotransmitterPhenotype)],
      state.neuralCircuitIri && ['Neural circuit', text(els.neuralCircuit)],
    ].filter((entry) => entry && entry[1]);
  }

  function renderPanel() {
    renderDetails(els.details, { pathway, index: rowIndex, selection, activeFilters: activeFilters() });
  }

  // Outline the diagram node that matches the current selection (a cell type
  // highlights the group box it sits in).
  function highlightSelection() {
    els.diagramContainer.querySelectorAll('g.node.is-selected').forEach((g) => g.classList.remove('is-selected'));
    if (!selection) return;
    const shown =
      selection.kind === 'cell'
        ? pathway.groups.find((g) => g.cellTypes.some((c) => c.iri === selection.key))
        : null;
    const wanted = shown ? selectionKey({ kind: 'group', key: shown.key }) : selectionKey(selection);
    for (const [nodeId, target] of targets) {
      if (selectionKey(target) !== wanted) continue;
      for (const g of els.diagramContainer.querySelectorAll('g.node')) {
        if (g.querySelector('title')?.textContent === nodeId) g.classList.add('is-selected');
      }
    }
  }

  function select(next) {
    selection = next;
    renderPanel();
    highlightSelection();
  }

  els.diagramContainer.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    const href = anchor?.getAttribute('xlink:href') ?? anchor?.getAttribute('href') ?? '';
    if (href.startsWith(CELL_HREF_PREFIX)) {
      event.preventDefault();
      select({ kind: 'cell', key: decodeURIComponent(href.slice(CELL_HREF_PREFIX.length)) });
      return;
    }
    const nodeId = event.target.closest('g.node')?.querySelector('title')?.textContent;
    if (nodeId && targets.has(nodeId)) select(targets.get(nodeId));
  });

  els.details.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="export"]')) {
      exportTableAsExcel(buildExportTable(pathway, rowIndex), 'sckan-precision-neural-circuits.xlsx');
      return;
    }
    const item = event.target.closest('[data-kind]');
    if (item) select({ kind: item.dataset.kind, key: decodeURIComponent(item.dataset.key) });
  });

  function refresh() {
    facetState = computeFacetState(scopedModel(), state);
    axonTypeField.setAvailableIris(facetState.availableAxonTypeIris);
    renderDiagram();
  }

  async function renderDiagram() {
    const token = ++renderToken;
    pathway = buildPathwayModel(facetState.filteredRows, fiberHierarchy);
    rowIndex = indexRows(facetState.filteredRows);
    targets = new Map();
    renderPanel();
    els.diagramCaption.textContent = generatePathwayCaption(pathway);
    els.diagramNote.textContent = generatePathwayNote(pathway);

    if (pathway.neurons.length === 0) {
      clearZoomControls(els.diagramContainer);
      els.diagramContainer.innerHTML = '<p class="diagram-empty">No pathways match the current filters.</p>';
      return;
    }

    try {
      await renderDotInto(els.diagramContainer, buildNeuralCircuitDot(pathway, rankdir, targets), { zoomable: true });
      if (token !== renderToken) return;
      els.diagramContainer.querySelectorAll('g.node').forEach((g) => {
        if (targets.has(g.querySelector('title')?.textContent)) g.classList.add('candidate-node');
      });
      highlightSelection();
    } catch (err) {
      if (token !== renderToken) return;
      console.error('Failed to render neural circuits diagram', err);
      clearZoomControls(els.diagramContainer);
      els.diagramContainer.innerHTML = '<p class="diagram-empty">Could not render this diagram. See console for details.</p>';
    }
  }

  refresh();
}
