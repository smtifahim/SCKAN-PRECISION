// Builds a navigable tree + descendant-closure index from
// resource/json/fiber-type-hierarchy.json (a flat Parent_IRI -> Child_IRI
// edge list). Selecting a parent fiber type in the UI must match every
// descendant's IRI as well as its own, so the important output here is
// `descendantsOf(iri)` (a Set including the node itself).

/**
 * @typedef {Object} FiberNode
 * @property {string} iri
 * @property {string} label
 * @property {FiberNode[]} children
 */

/**
 * @param {Array<Object>} rows flattened fiber-type-hierarchy.json rows
 */
export function buildFiberHierarchy(rows) {
  const nodesByIri = new Map();

  const ensureNode = (iri, label) => {
    let node = nodesByIri.get(iri);
    if (!node) {
      node = { iri, label: label ?? iri, children: [] };
      nodesByIri.set(iri, node);
    } else if (label && node.label === node.iri) {
      node.label = label;
    }
    return node;
  };

  const childIris = new Set();

  for (const row of rows) {
    const parent = ensureNode(row.Parent_IRI, row.Parent_Label);
    const child = ensureNode(row.Child_IRI, row.Child_Label);
    if (!parent.children.some((c) => c.iri === child.iri)) {
      parent.children.push(child);
    }
    childIris.add(child.iri);
  }

  // Roots are parents that never appear as someone else's child.
  const roots = [...nodesByIri.values()].filter((node) => !childIris.has(node.iri));

  // Precompute the descendant-IRI closure (including self) for every node so
  // facet filtering is a single Set.has() lookup at query time.
  const descendants = new Map();
  const computeDescendants = (node) => {
    if (descendants.has(node.iri)) {
      return descendants.get(node.iri);
    }
    const set = new Set([node.iri]);
    for (const child of node.children) {
      for (const iri of computeDescendants(child)) {
        set.add(iri);
      }
    }
    descendants.set(node.iri, set);
    return set;
  };
  for (const node of nodesByIri.values()) {
    computeDescendants(node);
  }

  return {
    roots,
    nodesByIri,
    /** @returns {Set<string>} the IRI itself plus every descendant IRI */
    descendantsOf(iri) {
      return descendants.get(iri) ?? new Set([iri]);
    },
    /** Flat list of every node, useful for a searchable autocomplete. */
    flatten() {
      return [...nodesByIri.values()];
    },
  };
}
