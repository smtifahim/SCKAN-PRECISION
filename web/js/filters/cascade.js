// Smart ("faceted search") filtering for View (A): every dropdown's
// available options are recomputed from the rows that satisfy every *other*
// currently-active filter, so picking a value never leaves the user staring
// at an option that would yield zero results, while a facet's own current
// selection always stays visible in its own list.

import { distinctByIri } from '../data/util.js';

/**
 * @typedef {Object} ViewAFilterState
 * @property {string|null} endOrganIri
 * @property {string|null} speciesIri
 * @property {string|null} geneIri
 * @property {string|null} axonTypeIri  - IRI of the selected fiber-type node
 *   (its full descendant closure is used for matching, not just this IRI)
 * @property {string|null} circuitRoleIri
 */

/** @returns {ViewAFilterState} */
export function createEmptyFilterState(defaultEndOrganIri = null) {
  return {
    endOrganIri: defaultEndOrganIri,
    speciesIri: null,
    geneIri: null,
    axonTypeIri: null,
    circuitRoleIri: null,
  };
}

const SIMPLE_FACETS = [
  { stateKey: 'speciesIri', rowField: 'Species_IRI' },
  { stateKey: 'geneIri', rowField: 'Gene_IRI' },
  { stateKey: 'circuitRoleIri', rowField: 'Circuit_Role_IRI' },
];

function matchesFacets(row, state, fiberHierarchy, excludeKeys) {
  if (!excludeKeys.has('endOrganIri') && state.endOrganIri && row.End_Organ_IRI !== state.endOrganIri) {
    return false;
  }
  for (const facet of SIMPLE_FACETS) {
    if (excludeKeys.has(facet.stateKey)) continue;
    if (state[facet.stateKey] && row[facet.rowField] !== state[facet.stateKey]) {
      return false;
    }
  }
  if (!excludeKeys.has('axonTypeIri') && state.axonTypeIri) {
    const closure = fiberHierarchy.descendantsOf(state.axonTypeIri);
    if (!closure.has(row.Axon_Type_IRI)) return false;
  }
  return true;
}

function applyFacets(rows, state, fiberHierarchy, excludeKey) {
  const excludeKeys = new Set(excludeKey ? [excludeKey] : []);
  return rows.filter((row) => matchesFacets(row, state, fiberHierarchy, excludeKeys));
}

/**
 * Recompute the filtered compatibility rows plus every facet's available
 * option set, given the current filter selections.
 * @param {ReturnType<import('../data/viewAModel.js').loadViewAModel> extends Promise<infer T> ? T : never} model
 * @param {ViewAFilterState} state
 */
export function computeFacetState(model, state) {
  const { innervationRows, fiberHierarchy } = model;

  const filteredRows = applyFacets(innervationRows, state, fiberHierarchy, null);
  const forSpecies = applyFacets(innervationRows, state, fiberHierarchy, 'speciesIri');
  const forGene = applyFacets(innervationRows, state, fiberHierarchy, 'geneIri');
  const forCircuitRole = applyFacets(innervationRows, state, fiberHierarchy, 'circuitRoleIri');
  const forAxonType = applyFacets(innervationRows, state, fiberHierarchy, 'axonTypeIri');

  return {
    filteredRows,
    matchingNeuronIris: new Set(filteredRows.map((r) => r.Neuron_Connected)),
    availableSpecies: distinctByIri(forSpecies, 'Species_IRI', 'Species'),
    availableGenes: distinctByIri(forGene, 'Gene_IRI', 'Gene_Label'),
    availableCircuitRoles: distinctByIri(forCircuitRole, 'Circuit_Role_IRI', 'Circuit_Role'),
    availableAxonTypeIris: new Set(forAxonType.map((r) => r.Axon_Type_IRI)),
  };
}

/**
 * The population list for the sidebar/table: every SCKAN population for the
 * selected end organ, annotated with whether it currently has any candidate
 * PRECISION cell-type match under the active secondary filters.
 */
export function computePopulationList(model, state, facetState) {
  const population = model.populationsByEndOrgan.get(state.endOrganIri);
  if (!population) return [];

  const secondaryFiltersActive = Boolean(
    state.speciesIri || state.geneIri || state.axonTypeIri || state.circuitRoleIri
  );

  const results = [];
  for (const entry of population.values()) {
    const hasAnyCandidates = (model.innervationByNeuron.get(entry.iri) ?? []).length > 0;
    const matchesActiveFilters = facetState.matchingNeuronIris.has(entry.iri);
    if (secondaryFiltersActive && !matchesActiveFilters) continue;
    const matchedRows = (facetState.filteredRows ?? []).filter((r) => r.Neuron_Connected === entry.iri);
    const matchedCandidatesByIri = new Map();
    for (const row of matchedRows) {
      if (!matchedCandidatesByIri.has(row.Cell_Type)) {
        matchedCandidatesByIri.set(row.Cell_Type, { iri: row.Cell_Type, label: row.Cell_Type_Label });
      }
    }
    results.push({
      ...entry,
      hasAnyCandidates,
      matchedCandidateCount: matchedCandidatesByIri.size,
      matchedCandidates: [...matchedCandidatesByIri.values()],
    });
  }
  // Populations with candidate matches sort first (alphabetically among
  // themselves); "no candidates yet" populations are pushed to the end.
  results.sort((a, b) => {
    if (a.hasAnyCandidates !== b.hasAnyCandidates) return a.hasAnyCandidates ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return results;
}
