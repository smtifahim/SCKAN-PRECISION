// Central place for the JSON data file locations. Paths are relative to
// web/index.html; serve the app from the repository root (e.g.
// `python3 -m http.server` run at the repo root, then open
// /web/index.html) so that ../resource/json/... resolves correctly.

export const DATA_PATHS = {
  drgEndOrgans: '../resource/json/drg-end-organs.json',
  drgOrganInnervation: '../resource/json/drg-organ-innervation.json',
  drgPartialOrder: '../resource/json/drg-partial-order.json',
  candidateMapping: '../resource/json/candidate-mapping.json',
  fiberTypeHierarchy: '../resource/json/fiber-type-hierarchy.json',
  synonymsGene: '../resource/json/synonyms-gene.json',
  synonymsOrgans: '../resource/json/synonyms-organs.json',
  synonymsSpecies: '../resource/json/synonyms-species.json',
};
