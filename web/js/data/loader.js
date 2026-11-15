// Loads SPARQL-results-style JSON files (the `{ head: { vars }, results: { bindings } }`
// shape produced by Stardog / script/npo-query.py) and flattens each binding row into a
// plain object of `{ Var: "value" }` pairs so the rest of the app never has to deal with
// the `{ type, value }` SPARQL JSON wrapper.

const cache = new Map();

/**
 * Fetch a SPARQL-results JSON file and return its rows as plain objects.
 * Results are cached per path so multiple views can share one fetch.
 * @param {string} path
 * @returns {Promise<Array<Object>>}
 */
export async function loadSparqlJson(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }

  const promise = fetch(path)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then((json) => flattenBindings(json));

  cache.set(path, promise);
  return promise;
}

/**
 * Flatten SPARQL JSON `results.bindings` into plain `{ Var: value }` rows.
 * Unbound (OPTIONAL, not matched) variables are simply omitted from the row.
 * @param {{results:{bindings:Array<Object>}}} json
 */
function flattenBindings(json) {
  const bindings = json?.results?.bindings ?? [];
  return bindings.map((binding) => {
    const row = {};
    for (const key of Object.keys(binding)) {
      row[key] = binding[key].value;
    }
    return row;
  });
}
