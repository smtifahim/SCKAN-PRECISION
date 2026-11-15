// Small HTML-rendering helpers shared by the legend panel and the table
// view, so IRI-linking, escaping, and citation/DOI formatting stay
// consistent wherever evidence rows are rendered.

import { resolveNodeLink } from '../data/curie.js';

const URL_PATTERN = /https?:\/\/[^\s)]+/;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Render a label as a link to whatever external viewer its IRI resolves to
 * (SCKAN Explorer, NervoSensus, or the raw IRI). Falls back to plain
 * (escaped) text if no IRI is available.
 */
export function linkTo(label, iri) {
  if (!iri) return escapeHtml(label ?? '—');
  const link = resolveNodeLink(iri);
  return `<a href="${link.url}" target="_blank" rel="noopener">${escapeHtml(label ?? link.curie ?? iri)}</a>`;
}

/**
 * Like linkTo() for one field of a candidate row, but if the row merges
 * several values for that field (see data/mergeCandidateRows.js) renders each
 * as its own link, comma-separated.
 */
export function linkToValues(row, key, iriKey) {
  const values = row.multiValues?.[key];
  if (!values) return linkTo(row[key], row[iriKey]);
  return values.map((v) => linkTo(v.label, v.iri)).join(', ');
}

/**
 * Citations are stored as free text with an inline URL, e.g.
 * "N'Guetta et al. (2024). https://doi.org/10.1016/j.celrep.2024.114860".
 * Replace the inline URL with a compact "[DOI link]" anchor so the citation
 * reads cleanly instead of showing the raw URL.
 */
export function formatCitation(citation) {
  if (!citation) return '—';
  const match = citation.match(URL_PATTERN);
  if (!match) return escapeHtml(citation);

  const url = match[0];
  const before = citation.slice(0, match.index).trimEnd();
  const after = citation.slice(match.index + url.length).trimStart();
  const link = `<a href="${url}" target="_blank" rel="noopener">[DOI link]</a>`;
  return [escapeHtml(before), link, escapeHtml(after)].filter(Boolean).join(' ');
}
