// Builds the complete, pre-indexed data model that View (B) (candidate
// PRECISION cell type mapping, via ilxtr:hasCandidateCellType) runs on.
// Shares the end-organ / partial-order indexing with View (A) - see
// sharedPopulationModel.js - but indexes its own candidate rows from
// candidate-mapping.json instead of drg-organ-innervation.json, and those
// rows carry a different field set (no Circuit_Role or End_Organ, but
// Gene_Phenotype/Functional/Threshold/Neurotransmitter/Neural_Circuit
// instead - see resource/sparql/candidate-mapping.rq).

import { loadSparqlJson } from './loader.js';
import { DATA_PATHS } from './config.js';
import { buildFiberHierarchy } from './fiberHierarchy.js';
import { buildSynonymIndex } from './synonyms.js';
import { buildSharedPopulationModel, pickDefaultEndOrgan } from './sharedPopulationModel.js';
import { groupBy } from './util.js';
import { MIN_CANDIDATE_SCORE, scoreCandidateRow } from './candidateMatchScore.js';

export async function loadViewBModel() {
  const [endOrgans, candidateMapping, partialOrder, fiberRows, geneRows, organRows, speciesRows] =
    await Promise.all([
      loadSparqlJson(DATA_PATHS.drgEndOrgans),
      loadSparqlJson(DATA_PATHS.candidateMapping),
      loadSparqlJson(DATA_PATHS.drgPartialOrder),
      loadSparqlJson(DATA_PATHS.fiberTypeHierarchy),
      loadSparqlJson(DATA_PATHS.synonymsGene),
      loadSparqlJson(DATA_PATHS.synonymsOrgans),
      loadSparqlJson(DATA_PATHS.synonymsSpecies),
    ]);

  return buildViewBModel({ endOrgans, candidateMapping, partialOrder, fiberRows, geneRows, organRows, speciesRows });
}

function buildViewBModel({ endOrgans, candidateMapping: allCandidateMapping, partialOrder, fiberRows, geneRows, organRows, speciesRows }) {
  const candidateMapping = allCandidateMapping.filter((row) => scoreCandidateRow(row) >= MIN_CANDIDATE_SCORE);
  const { endOrganOptions, neuronLabelByIri, populationsByEndOrgan } = buildSharedPopulationModel({
    endOrgans,
    partialOrder,
  });

  const candidateMappingByNeuron = groupBy(candidateMapping, 'Neuron_Connected');
  const partialOrderByNeuron = groupBy(partialOrder, 'Neuron_Connected');

  const fiberHierarchy = buildFiberHierarchy(fiberRows);

  const synonymIndexes = {
    gene: buildSynonymIndex(geneRows, { iri: 'Gene_IRI', label: 'Gene_Label', synonym: 'Gene_Synonym' }),
    organ: buildSynonymIndex(organRows, { iri: 'Organ_IRI', label: 'Organ_Label', synonym: 'Organ_Synonym' }),
    species: buildSynonymIndex(speciesRows, {
      iri: 'Species_IRI',
      label: 'Species_Label',
      synonym: 'Species_Synonym',
    }),
  };

  // "kidney" has no candidate mappings in this dataset (it's scoped to pain1/
  // pain2 DRG populations over skin/muscle/membrane/trunk/etc.) - "skin of
  // body" is the end organ with the most candidate-bearing populations.
  const defaultEndOrganIri = pickDefaultEndOrgan(endOrganOptions, 'skin of body');

  return {
    endOrganOptions,
    defaultEndOrganIri,
    populationsByEndOrgan,
    candidateMappingRows: candidateMapping,
    candidateMappingByNeuron,
    partialOrderByNeuron,
    neuronLabelByIri,
    fiberHierarchy,
    synonymIndexes,
  };
}
