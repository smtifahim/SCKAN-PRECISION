// Shared across View (A) and View (B): the "which SCKAN populations exist
// under each end organ, and what's each one's preferred label" indexing
// logic. Both views drive their end-organ filter and population caption
// table/diagram from this same shape, built from the same two universal
// files (drg-end-organs.json + drg-partial-order.json); only which rows
// have candidate matches (innervation vs. candidate-mapping) differs per view.

import { distinctByIri } from './util.js';

/**
 * @param {Object} options
 * @param {Array<Object>} options.endOrgans - flattened drg-end-organs.json rows
 * @param {Array<Object>} options.partialOrder - flattened drg-partial-order.json rows
 */
export function buildSharedPopulationModel({ endOrgans, partialOrder }) {
  const endOrganOptions = distinctByIri(endOrgans, 'End_Organ_IRI', 'End_Organ');

  const neuronLabelByIri = new Map();
  // Prefer the partial-order label (always present, one per neuron); fall
  // back to the end-organs label for any neuron partial-order doesn't cover.
  for (const row of partialOrder) {
    if (row.Neuron_Connected && row.Neuron_Label && !neuronLabelByIri.has(row.Neuron_Connected)) {
      neuronLabelByIri.set(row.Neuron_Connected, row.Neuron_Label);
    }
  }
  for (const row of endOrgans) {
    if (row.Neuron_Connected && row.Neuron_Label && !neuronLabelByIri.has(row.Neuron_Connected)) {
      neuronLabelByIri.set(row.Neuron_Connected, row.Neuron_Label);
    }
  }

  // Map<End_Organ_IRI, Map<Neuron_Connected, {iri, label}>>
  const populationsByEndOrgan = new Map();
  for (const row of endOrgans) {
    if (!row.End_Organ_IRI || !row.Neuron_Connected) continue; // skip "Other (not in list)" rows
    if (!populationsByEndOrgan.has(row.End_Organ_IRI)) {
      populationsByEndOrgan.set(row.End_Organ_IRI, new Map());
    }
    const population = populationsByEndOrgan.get(row.End_Organ_IRI);
    if (!population.has(row.Neuron_Connected)) {
      population.set(row.Neuron_Connected, {
        iri: row.Neuron_Connected,
        label: neuronLabelByIri.get(row.Neuron_Connected) ?? row.Neuron_Label,
      });
    }
  }

  return { endOrganOptions, neuronLabelByIri, populationsByEndOrgan };
}

/**
 * Pick a default end-organ IRI, preferring `preferredLabel` (case-insensitive)
 * if present among the options, else the first option alphabetically.
 * @param {Array<{iri:string,label:string}>} endOrganOptions
 * @param {string} preferredLabel
 */
export function pickDefaultEndOrgan(endOrganOptions, preferredLabel) {
  const preferred = endOrganOptions.find((o) => o.label.toLowerCase() === preferredLabel.toLowerCase());
  return preferred?.iri ?? endOrganOptions[0]?.iri ?? null;
}
