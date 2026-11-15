// Collapses a population's candidate rows down to one row per PRECISION cell
// type. Each row in candidate-mapping.json / drg-organ-innervation.json
// carries a single value per annotation, so one cell type that is supported
// by several marker genes shows up as several rows that differ only in that
// gene. Drawing one dotted edge per row made the same match look like many
// different ones; merged rows let the diagram draw a single edge per
// (soma, cell type) and the evidence panel list every value together.

/**
 * @typedef {Object} MultiValueField
 * @property {string} key - row field holding the label, e.g. 'Gene_Phenotype'
 * @property {string} iriKey - row field holding that label's IRI, e.g. 'Gene_Phenotype_IRI'
 */

/**
 * @param {Array<Object>} rows
 * @param {MultiValueField[]} multiValueFields - annotation fields whose values
 *   are combined across the merged rows
 * @returns {Array<Object>} one row per distinct Cell_Type, in first-seen order.
 *   Where a field has more than one distinct value, `row[key]` is those labels
 *   joined with ", " (so tooltips and plain-text uses read naturally) and
 *   `row.multiValues[key]` holds the individual `{ label, iri }` pairs so they
 *   can still be linked one by one.
 */
export function mergeCandidateRowsByCellType(rows, multiValueFields) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.Cell_Type)) groups.set(row.Cell_Type, []);
    groups.get(row.Cell_Type).push(row);
  }

  return [...groups.values()].map((group) => {
    const merged = { ...group[0], multiValues: {} };
    for (const { key, iriKey } of multiValueFields) {
      const valuesByLabel = new Map();
      for (const row of group) {
        if (row[key] && !valuesByLabel.has(row[key])) valuesByLabel.set(row[key], row[iriKey]);
      }
      if (valuesByLabel.size > 1) {
        merged.multiValues[key] = [...valuesByLabel].map(([label, iri]) => ({ label, iri }));
        merged[key] = [...valuesByLabel.keys()].join(', ');
      }
    }
    return merged;
  });
}
