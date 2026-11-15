// IRI -> CURIE -> external-viewer-URL rules.
//
// These rules were derived by inspecting the actual IRI patterns present in
// resource/json/*.json (no prefix-map file exists in the repo):
//   - SCKAN populations:
//       .../composer/uris/set/{ns}/{id}            -> curie "{ns}:{id}"
//       .../readable/sparc-nlp/{ns}/{id}            -> curie "{ns}:{id}"
//     e.g. http://uri.interlex.org/composer/uris/set/kidney/158 -> "kidney:158"
//   - PRECISION cell types:
//       .../npo/uris/neurons/{id}                   -> curie "npokb:{id}"
//     e.g. http://uri.interlex.org/npo/uris/neurons/1022 -> "npokb:1022"
//     opened at https://nervosensus.netlify.app/?view=cards&cell=npokb:1022
//   - Everything else (UBERON, NCBITaxon, NCBI gene, ILX phenotype IRIs, ...)
//     keeps its own IRI as the link target.

const SCKAN_EXPLORER_BASE = 'https://sckan-explorer.netlify.app/?neuron=';
const PRECISION_VIEWER_BASE = 'https://nervosensus.netlify.app/?view=cards&cell=';

const SCKAN_POPULATION_PATTERNS = [
  /\/composer\/uris\/set\/([^/]+)\/([^/]+)$/,
  /\/readable\/sparc-nlp\/([^/]+)\/([^/]+)$/,
];

const PRECISION_CELL_TYPE_PATTERN = /\/npo\/uris\/neurons\/([^/]+)$/;

// A handful of composer-drafted populations need a distinguishing curie
// prefix on SCKAN Explorer's side (their plain "kidney:" numeric id would
// otherwise collide with an unrelated, already-published population).
const CURIE_OVERRIDES = {
  'http://uri.interlex.org/composer/uris/set/kidney/158': 'kidney1:158',
  'http://uri.interlex.org/composer/uris/set/kidney/159': 'kidney1:159',
};

export const NODE_KIND = {
  SCKAN_POPULATION: 'sckan-population',
  PRECISION_CELL_TYPE: 'precision-cell-type',
  OTHER: 'other',
};

/**
 * Classify an IRI and work out the CURIE + external URL that should back a
 * clickable diagram/table node.
 * @param {string} iri
 * @returns {{kind: string, curie: string|null, url: string}}
 */
export function resolveNodeLink(iri) {
  if (!iri) {
    return { kind: NODE_KIND.OTHER, curie: null, url: '' };
  }

  for (const pattern of SCKAN_POPULATION_PATTERNS) {
    const match = iri.match(pattern);
    if (match) {
      const curie = CURIE_OVERRIDES[iri] ?? `${match[1]}:${match[2]}`;
      return { kind: NODE_KIND.SCKAN_POPULATION, curie, url: `${SCKAN_EXPLORER_BASE}${curie}` };
    }
  }

  const precisionMatch = iri.match(PRECISION_CELL_TYPE_PATTERN);
  if (precisionMatch) {
    const curie = `npokb:${precisionMatch[1]}`;
    return { kind: NODE_KIND.PRECISION_CELL_TYPE, curie, url: `${PRECISION_VIEWER_BASE}${curie}` };
  }

  return { kind: NODE_KIND.OTHER, curie: null, url: iri };
}
