// Which way the partial-order edges of a population diagram point.
//
// drg-partial-order.json stores every edge as soma -> outward ("V1 -> V2"):
//   - 'projection': draw edges exactly as stored, so both the peripheral
//     branch (soma -> nerve -> end organ) and the central branch
//     (soma -> posterior root -> dorsal horn) fan out from the soma.
//   - 'signal': draw edges in the direction the sensory signal travels, i.e.
//     end organ -> nerve -> soma -> posterior root -> dorsal horn. Only the
//     peripheral edges are stored against the signal, so only those flip.
//
// Switch with the `pathway` URL parameter (e.g. ?pathway=signal), or pass a
// mode to buildPopulationDot() directly.

export const PATHWAY_MODES = Object.freeze({ PROJECTION: 'projection', SIGNAL: 'signal' });
export const DEFAULT_PATHWAY_MODE = PATHWAY_MODES.PROJECTION;

// Nodes on the peripheral branch: an edge pointing INTO one of these runs
// away from the soma towards the end organ, against the signal.
const PERIPHERAL_NODE_TYPES = new Set(['hasAxonLeadingToSensoryTerminal', 'hasSensoryAxonTerminalLocation']);

/**
 * @param {Object} row - a drg-partial-order.json row
 * @param {string} mode - one of PATHWAY_MODES
 * @returns {[string, string]} the [from, to] node IDs to draw this edge with
 */
export function orientPathwayEdge(row, mode) {
  const reverse = mode === PATHWAY_MODES.SIGNAL && PERIPHERAL_NODE_TYPES.has(row.V2_Type);
  return reverse ? [row.V2_ID, row.V1_ID] : [row.V1_ID, row.V2_ID];
}

/** @returns {string} `value` if it is a known mode, otherwise the default. */
export function resolvePathwayMode(value) {
  return Object.values(PATHWAY_MODES).includes(value) ? value : DEFAULT_PATHWAY_MODE;
}

/** The mode requested by the page URL (?pathway=signal|projection), or the default. */
export function getInitialPathwayMode() {
  return resolvePathwayMode(new URLSearchParams(window.location.search).get('pathway'));
}
