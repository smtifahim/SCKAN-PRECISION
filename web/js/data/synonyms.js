// Generic builder for the autocomplete-by-label-or-synonym indices driven by
// resource/json/synonyms-gene.json, synonyms-organs.json and
// synonyms-species.json. All three files share the same flat shape:
//   { <X>_IRI, <X>_Label, <X>_Synonym }
// with one row per (IRI, synonym) pair, so a single IRI can have many rows.

/**
 * @typedef {Object} SynonymEntry
 * @property {string} iri
 * @property {string} label
 * @property {string[]} synonyms
 */

/**
 * @param {Array<Object>} rows flattened synonym JSON rows
 * @param {{iri: string, label: string, synonym: string}} fields the SPARQL
 *   variable names for this file, e.g. { iri: 'Gene_IRI', label: 'Gene_Label',
 *   synonym: 'Gene_Synonym' }
 */
export function buildSynonymIndex(rows, fields) {
  const byIri = new Map();

  for (const row of rows) {
    const iri = row[fields.iri];
    const label = row[fields.label];
    const synonym = row[fields.synonym];
    if (!iri || !label) continue;

    let entry = byIri.get(iri);
    if (!entry) {
      entry = { iri, label, synonyms: new Set() };
      byIri.set(iri, entry);
    }
    if (synonym && synonym.toLowerCase() !== label.toLowerCase()) {
      entry.synonyms.add(synonym);
    }
  }

  const entries = [...byIri.values()].map((e) => ({ ...e, synonyms: [...e.synonyms] }));
  entries.sort((a, b) => a.label.localeCompare(b.label));

  return {
    /** @returns {SynonymEntry[]} every known entry, sorted by label */
    all() {
      return entries;
    },
    byIri(iri) {
      return byIri.get(iri) ? { ...byIri.get(iri), synonyms: [...byIri.get(iri).synonyms] } : null;
    },
    /**
     * Restrict the searchable universe to a subset of IRIs (used so facet
     * suggestions only ever list values that actually occur in the current,
     * cascade-filtered dataset) and return matches for a free-text query
     * against each entry's label and synonyms.
     * @param {string} query
     * @param {Set<string>|null} allowedIris
     */
    search(query, allowedIris = null) {
      const q = query.trim().toLowerCase();
      const pool = allowedIris ? entries.filter((e) => allowedIris.has(e.iri)) : entries;
      if (!q) return pool;

      const results = [];
      for (const entry of pool) {
        if (entry.label.toLowerCase().includes(q)) {
          results.push({ ...entry, matchedOn: 'label' });
          continue;
        }
        const matchedSynonym = entry.synonyms.find((s) => s.toLowerCase().includes(q));
        if (matchedSynonym) {
          results.push({ ...entry, matchedOn: 'synonym', matchedSynonym });
        }
      }
      return results;
    },
  };
}
