// Smart ("faceted search") filtering for View (B). Same cascading-filter
// approach as cascade.js (View A), adapted to candidate-mapping.json's
// field set: the "marker gene" facet matches Gene_Phenotype_IRI instead of
// Gene_IRI. Circuit_Role is one of the three required match criteria (see
// resource/sparql/candidate-mapping.rq) but every row currently shares the
// same value ("Sensory phenotype" - all DRG/TG populations are sensory), so
// it isn't offered as a filter here (no discriminating power); it's still
// shown as required match evidence in diagram/legendB.js. The remaining
// optional evidence fields (Functional/Threshold/Neurotransmitter Phenotype,
// Neural Circuit) *are* offered as filters, since they do vary.

import { distinctByIri } from '../data/util.js';
import { rankCandidatesByScore, phenotypeFlags } from '../data/candidateMatchScore.js';

/**
 * @typedef {Object} ViewBFilterState
 * @property {string|null} endOrganIri
 * @property {string|null} speciesIri
 * @property {string|null} geneIri
 * @property {string|null} axonTypeIri  - IRI of the selected fiber-type node
 *   (its full descendant closure is used for matching, not just this IRI)
 * @property {string|null} functionalPhenotypeIri
 * @property {string|null} thresholdPhenotypeIri
 * @property {string|null} neurotransmitterPhenotypeIri
 * @property {string|null} neuralCircuitIri
 */

/** @returns {ViewBFilterState} */
export function createEmptyFilterState(defaultEndOrganIri = null) {
  return {
    endOrganIri: defaultEndOrganIri,
    speciesIri: null,
    geneIri: null,
    axonTypeIri: null,
    functionalPhenotypeIri: null,
    thresholdPhenotypeIri: null,
    neurotransmitterPhenotypeIri: null,
    neuralCircuitIri: null,
  };
}

const SIMPLE_FACETS = [
  { stateKey: 'speciesIri', rowField: 'Species_IRI' },
  { stateKey: 'geneIri', rowField: 'Gene_Phenotype_IRI' },
  { stateKey: 'functionalPhenotypeIri', rowField: 'Functional_Phenotype_IRI' },
  { stateKey: 'thresholdPhenotypeIri', rowField: 'Threshold_Phenotype_IRI' },
  { stateKey: 'neurotransmitterPhenotypeIri', rowField: 'Neurotransmitter_Phenotype_IRI' },
  { stateKey: 'neuralCircuitIri', rowField: 'Neural_Circuit_IRI' },
];

function matchesFacets(row, state, fiberHierarchy, excludeKeys) {
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
 * Recompute the filtered candidate-mapping rows plus every facet's
 * available option set, given the current filter selections. Unlike View
 * (A), the end organ isn't a field on the candidate rows themselves (it
 * only exists in drg-end-organs.json) - population scoping by end organ is
 * handled entirely in computePopulationList() below via populationsByEndOrgan.
 * @param {ReturnType<import('../data/viewBModel.js').loadViewBModel> extends Promise<infer T> ? T : never} model
 * @param {ViewBFilterState} state
 */
export function computeFacetState(model, state) {
  const { candidateMappingRows, fiberHierarchy } = model;

  const filteredRows = applyFacets(candidateMappingRows, state, fiberHierarchy, null);
  const forSpecies = applyFacets(candidateMappingRows, state, fiberHierarchy, 'speciesIri');
  const forGene = applyFacets(candidateMappingRows, state, fiberHierarchy, 'geneIri');
  const forAxonType = applyFacets(candidateMappingRows, state, fiberHierarchy, 'axonTypeIri');
  const forFunctionalPhenotype = applyFacets(candidateMappingRows, state, fiberHierarchy, 'functionalPhenotypeIri');
  const forThresholdPhenotype = applyFacets(candidateMappingRows, state, fiberHierarchy, 'thresholdPhenotypeIri');
  const forNeurotransmitterPhenotype = applyFacets(
    candidateMappingRows,
    state,
    fiberHierarchy,
    'neurotransmitterPhenotypeIri'
  );
  const forNeuralCircuit = applyFacets(candidateMappingRows, state, fiberHierarchy, 'neuralCircuitIri');

  return {
    filteredRows,
    matchingNeuronIris: new Set(filteredRows.map((r) => r.Neuron_Connected)),
    availableSpecies: distinctByIri(forSpecies, 'Species_IRI', 'Species'),
    availableGenes: distinctByIri(forGene, 'Gene_Phenotype_IRI', 'Gene_Phenotype'),
    availableAxonTypeIris: new Set(forAxonType.map((r) => r.Axon_Type_IRI)),
    availableFunctionalPhenotypes: distinctByIri(forFunctionalPhenotype, 'Functional_Phenotype_IRI', 'Functional_Phenotype'),
    availableThresholdPhenotypes: distinctByIri(forThresholdPhenotype, 'Threshold_Phenotype_IRI', 'Threshold_Phenotype'),
    availableNeurotransmitterPhenotypes: distinctByIri(
      forNeurotransmitterPhenotype,
      'Neurotransmitter_Phenotype_IRI',
      'Neurotransmitter_Phenotype'
    ),
    availableNeuralCircuits: distinctByIri(forNeuralCircuit, 'Neural_Circuit_IRI', 'Neural_Circuit'),
  };
}

/**
 * The population list for the caption panel/table: every SCKAN population
 * for the selected end organ, annotated with whether it currently has any
 * candidate PRECISION cell-type match under the active secondary filters.
 */
export function computePopulationList(model, state, facetState) {
  const population = model.populationsByEndOrgan.get(state.endOrganIri);
  if (!population) return [];

  const secondaryFiltersActive = Boolean(
    state.speciesIri ||
      state.geneIri ||
      state.axonTypeIri ||
      state.functionalPhenotypeIri ||
      state.thresholdPhenotypeIri ||
      state.neurotransmitterPhenotypeIri ||
      state.neuralCircuitIri
  );

  const results = [];
  for (const entry of population.values()) {
    const hasAnyCandidates = (model.candidateMappingByNeuron.get(entry.iri) ?? []).length > 0;
    const matchesActiveFilters = facetState.matchingNeuronIris.has(entry.iri);
    if (secondaryFiltersActive && !matchesActiveFilters) continue;
    const matchedRows = (facetState.filteredRows ?? []).filter((r) => r.Neuron_Connected === entry.iri);
    // Best (highest phenotype-overlap score) row per distinct candidate cell
    // type, strongest match first - see data/candidateMatchScore.js.
    const rankedCandidates = rankCandidatesByScore(matchedRows);
    results.push({
      ...entry,
      hasAnyCandidates,
      matchedCandidateCount: rankedCandidates.length,
      matchedCandidates: rankedCandidates.map((r) => ({
        iri: r.Cell_Type,
        label: r.Cell_Type_Label,
        score: r.matchScore,
        flags: phenotypeFlags(r),
      })),
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
