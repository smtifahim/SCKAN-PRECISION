// View (B) match-strength scoring: candidate-mapping.json rows always carry
// the three required ilxtr:hasCandidateCellType criteria (soma location,
// circuit role, axon type - see resource/sparql/candidate-mapping.rq), but
// differ in how many of the optional phenotype annotations are also
// populated for a given (Neuron, Cell Type) pairing. Counting those gives a
// simple, explainable "how many phenotype values are actually shared"
// signal to rank candidates by, per the user's request: prefer candidates
// with the maximum number of matching phenotype values.

export const OPTIONAL_PHENOTYPE_FIELDS = [
  { key: 'Species', label: 'Species' },
  { key: 'Gene_Phenotype', label: 'Gene phenotype' },
  { key: 'Functional_Phenotype', label: 'Functional phenotype' },
  { key: 'Threshold_Phenotype', label: 'Threshold phenotype' },
  { key: 'Neurotransmitter_Phenotype', label: 'Neurotransmitter phenotype' },
  { key: 'Neural_Circuit', label: 'Neural circuit membership' },
];

/** @returns {number} how many of the 6 optional phenotype fields this row has populated (0-6) */
export function scoreCandidateRow(row) {
  return OPTIONAL_PHENOTYPE_FIELDS.reduce((count, f) => count + (row[f.key] ? 1 : 0), 0);
}

// View (B) only keeps candidate mappings that share at least this many of the
// 6 optional phenotype fields (i.e. a score of 3/6 or better).
export const MIN_CANDIDATE_SCORE = 3;

/** Labels of the optional phenotype fields this row has populated, for a "matched on: ..." hint. */
export function matchedPhenotypeLabels(row) {
  return OPTIONAL_PHENOTYPE_FIELDS.filter((f) => row[f.key]).map((f) => f.label);
}

/**
 * Reduce a neuron's candidate rows down to one best-scoring representative
 * row per distinct Cell_Type, sorted by score descending (ties broken
 * alphabetically by label) - used everywhere a single row stands in for
 * "this candidate cell type" (population caption chips, evidence panel,
 * table view ordering).
 * @param {Array<Object>} rows
 * @returns {Array<Object>} one row per distinct Cell_Type, best score first
 */
export function rankCandidatesByScore(rows) {
  const bestByType = new Map();
  for (const row of rows) {
    const score = scoreCandidateRow(row);
    const existing = bestByType.get(row.Cell_Type);
    if (!existing || score > existing.score) {
      bestByType.set(row.Cell_Type, { row, score });
    }
  }
  return [...bestByType.values()]
    .sort((a, b) => b.score - a.score || a.row.Cell_Type_Label.localeCompare(b.row.Cell_Type_Label))
    .map(({ row, score }) => ({ ...row, matchScore: score }));
}
