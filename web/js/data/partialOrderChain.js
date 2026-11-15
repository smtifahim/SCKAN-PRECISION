// Some SCKAN partial-order chains represent a multi-synaptic pathway: a
// primary afferent neuron's partial order ends at a synapse location
// (IsSynapse = YES) that is literally the same anatomical node a second
// (relay/projection) neuron's partial order starts from as its own
// "hasSomaLocation". drg-partial-order.json links these via a Target_Neuron
// field on every row of the upstream neuron. Rendering only the selected
// neuron's own rows would stop short at the synapse and omit the rest of
// the pathway (and its own caption) - see the reference diagram for
// pain1:1 -> pain1:10 (DRG soma -> dorsal horn synapse -> spinothalamic
// tract -> thalamus).

/**
 * Follow the Target_Neuron chain starting at `neuronIri`, merging every
 * neuron's partial-order rows into one combined set (they connect into a
 * single graph automatically, since the shared synapse node IDs match) and
 * returning the ordered list of neuron IRIs involved (for multi-row
 * captions). Cycle-safe via a visited set, even though none are expected.
 * @param {string} neuronIri
 * @param {Map<string, Array<Object>>} partialOrderByNeuron
 * @returns {{rows: Array<Object>, chainNeuronIris: string[]}}
 */
export function collectPartialOrderChain(neuronIri, partialOrderByNeuron) {
  const visited = new Set();
  const chainNeuronIris = [];
  const rows = [];
  let current = neuronIri;

  while (current && !visited.has(current)) {
    visited.add(current);
    chainNeuronIris.push(current);
    const neuronRows = partialOrderByNeuron.get(current) ?? [];
    rows.push(...neuronRows);
    current = neuronRows.find((r) => r.Target_Neuron)?.Target_Neuron ?? null;
  }

  return { rows, chainNeuronIris };
}
