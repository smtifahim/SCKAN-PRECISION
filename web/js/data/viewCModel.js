// Builds the data model for View (C) (Neural Circuits & Function). Same
// field set and filters as View (B), but indexes candidate-mapping-test.json
// without the minimum-match-score cut-off so every row is shown by default.

import { loadSparqlJson } from './loader.js';
import { DATA_PATHS } from './config.js';
import { buildFiberHierarchy } from './fiberHierarchy.js';
import { buildSynonymIndex } from './synonyms.js';
import { buildSharedPopulationModel } from './sharedPopulationModel.js';

export async function loadViewCModel() {
  const [endOrgans, candidateMapping, partialOrder, fiberRows, geneRows, organRows, speciesRows] = await Promise.all([
    loadSparqlJson(DATA_PATHS.drgEndOrgans),
    loadSparqlJson(DATA_PATHS.candidateMappingTest),
    loadSparqlJson(DATA_PATHS.drgPartialOrder),
    loadSparqlJson(DATA_PATHS.fiberTypeHierarchy),
    loadSparqlJson(DATA_PATHS.synonymsGene),
    loadSparqlJson(DATA_PATHS.synonymsOrgans),
    loadSparqlJson(DATA_PATHS.synonymsSpecies),
  ]);

  const { endOrganOptions, populationsByEndOrgan } = buildSharedPopulationModel({ endOrgans, partialOrder });

  return {
    endOrganOptions,
    populationsByEndOrgan,
    candidateMappingRows: candidateMapping,
    fiberHierarchy: buildFiberHierarchy(fiberRows),
    synonymIndexes: {
      gene: buildSynonymIndex(geneRows, { iri: 'Gene_IRI', label: 'Gene_Label', synonym: 'Gene_Synonym' }),
      organ: buildSynonymIndex(organRows, { iri: 'Organ_IRI', label: 'Organ_Label', synonym: 'Organ_Synonym' }),
      species: buildSynonymIndex(speciesRows, {
        iri: 'Species_IRI',
        label: 'Species_Label',
        synonym: 'Species_Synonym',
      }),
    },
  };
}
