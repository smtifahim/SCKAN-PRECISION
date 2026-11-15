// Wraps a facet's current "available options" (already cascade-filtered by
// cascade.js) with optional synonym-aware text matching, so the dropdown
// list itself is always exactly the valid/available IRIs, while typing can
// still match a synonym even when the synonym file doesn't cover every IRI.

/**
 * @param {Array<{iri:string,label:string}>} options
 * @param {ReturnType<import('../data/synonyms.js').buildSynonymIndex>|null} synonymIndex
 */
export function createFacetSearch(options, synonymIndex = null) {
  return function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      if (opt.label.toLowerCase().includes(q)) return true;
      const entry = synonymIndex?.byIri(opt.iri);
      return entry?.synonyms.some((s) => s.toLowerCase().includes(q)) ?? false;
    });
  };
}
