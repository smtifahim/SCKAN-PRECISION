// Builds the complete, pre-indexed data model that View (A) (DRG afferents of
// the kidney / SCKAN-compatible PRECISION cell types) runs on. All cross-
// referencing between files happens here, once, at load time, keyed by IRI
// (never by label) so facet filtering stays cheap Set/Map lookups at query time.

import { loadSparqlJson } from './loader.js';
import { DATA_PATHS } from './config.js';
import { buildFiberHierarchy } from './fiberHierarchy.js';
import { buildSynonymIndex } from './synonyms.js';
import { buildSharedPopulationModel, pickDefaultEndOrgan } from './sharedPopulationModel.js';
import { groupBy } from './util.js';

export async function loadViewAModel() {
  const [endOrgans, innervation, partialOrder, fiberRows, geneRows, organRows, speciesRows] =
    await Promise.all([
      loadSparqlJson(DATA_PATHS.drgEndOrgans),
      loadSparqlJson(DATA_PATHS.drgOrganInnervation),
      loadSparqlJson(DATA_PATHS.drgPartialOrder),
      loadSparqlJson(DATA_PATHS.fiberTypeHierarchy),
      loadSparqlJson(DATA_PATHS.synonymsGene),
      loadSparqlJson(DATA_PATHS.synonymsOrgans),
      loadSparqlJson(DATA_PATHS.synonymsSpecies),
    ]);

  return buildViewAModel({ endOrgans, innervation, partialOrder, fiberRows, geneRows, organRows, speciesRows });
}

function buildViewAModel({ endOrgans, innervation, partialOrder, fiberRows, geneRows, organRows, speciesRows }) {
  const { endOrganOptions, neuronLabelByIri, populationsByEndOrgan } = buildSharedPopulationModel({
    endOrgans,
    partialOrder,
  });

  const innervationByNeuron = groupBy(innervation, 'Neuron_Connected');
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

  const defaultEndOrganIri = pickDefaultEndOrgan(endOrganOptions, 'kidney');

  return {
    endOrganOptions,
    defaultEndOrganIri,
    populationsByEndOrgan,
    innervationRows: innervation,
    innervationByNeuron,
    partialOrderByNeuron,
    neuronLabelByIri,
    fiberHierarchy,
    synonymIndexes,
  };
}


