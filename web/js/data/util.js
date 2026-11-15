// Small shared helpers used across the data-indexing modules.

export function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

/**
 * Distinct `{iri, label}` pairs for an IRI/label column pair, sorted by label.
 * Rows with no IRI bound (e.g. an OPTIONAL that didn't match) are skipped.
 */
export function distinctByIri(rows, iriField, labelField) {
  const map = new Map();
  for (const row of rows) {
    const iri = row[iriField];
    if (!iri) continue;
    if (!map.has(iri)) {
      map.set(iri, { iri, label: row[labelField] ?? iri });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
