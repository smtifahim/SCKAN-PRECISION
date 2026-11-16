// Candidate cell type rows for the SCKAN population panel, shared by View (A)
// and View (B): the count pill on its own row, then 2 chips per row. When the
// chips need more than MAX_VISIBLE_LINES rendered
// lines (long names wrap), everything past that sits behind a "See more" /
// "Show less" toggle. Line counts come from the rendered layout, so
// refreshCandidateCollapse() must run after the panel is rendered and again
// whenever its width changes (observeCandidateCollapse does the latter).

const CHIPS_PER_ROW = 2;
export const MAX_VISIBLE_LINES = 3; // the pill's own row plus two rows of chips
const LINE_TOLERANCE_PX = 6; // chips of different heights sit a few px apart on the same line

/**
 * @param {string} pill - HTML for the "N candidates" count pill
 * @param {string[]} chips - HTML for each candidate cell type chip
 * @returns {string} HTML for the whole candidates cell
 */
export function buildCandidateRows(pill, chips) {
  const rows = [`<div class="candidate-row">${pill}</div>`];
  for (let i = 0; i < chips.length; i += CHIPS_PER_ROW) {
    rows.push(`<div class="candidate-row">${chips.slice(i, i + CHIPS_PER_ROW).join('')}</div>`);
  }
  return `<div class="population-candidates">${rows.join('')}</div>`;
}

function collapseCandidates(container) {
  container.classList.remove('is-collapsed');
  container.querySelectorAll('.is-extra').forEach((el) => el.classList.remove('is-extra'));
  container.querySelector('.candidate-toggle')?.remove();
  if (!container.offsetParent) return; // not laid out (e.g. hidden tab): nothing to measure

  const items = [...container.querySelectorAll('.candidate-row > *')];
  const tops = items.map((el) => el.getBoundingClientRect().top);
  const lineTops = [];
  for (const top of [...tops].sort((a, b) => a - b)) {
    if (lineTops.length === 0 || top - lineTops[lineTops.length - 1] > LINE_TOLERANCE_PX) lineTops.push(top);
  }
  if (lineTops.length <= MAX_VISIBLE_LINES) return;

  const lastVisibleLineTop = lineTops[MAX_VISIBLE_LINES - 1];
  let hiddenChipCount = 0;
  items.forEach((el, i) => {
    if (tops[i] - lastVisibleLineTop > LINE_TOLERANCE_PX) {
      el.classList.add('is-extra');
      if (el.classList.contains('candidate-chip')) hiddenChipCount += 1;
    }
  });
  container.querySelectorAll('.candidate-row').forEach((row) => {
    if ([...row.children].every((el) => el.classList.contains('is-extra'))) row.classList.add('is-extra');
  });

  const expanded = container.dataset.expanded === 'true';
  const moreLabel = `See more (+${hiddenChipCount})`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'candidate-toggle';
  toggle.dataset.moreLabel = moreLabel;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? 'Show less' : moreLabel;
  container.append(toggle);
  container.classList.toggle('is-collapsed', !expanded);
}

/** Re-measure every candidates cell under `root` and add/remove its toggle. */
export function refreshCandidateCollapse(root) {
  root.querySelectorAll('.population-candidates').forEach(collapseCandidates);
}

/**
 * Re-run refreshCandidateCollapse whenever `root`'s width changes (window
 * resize, ...) and whenever its tab panel is shown (the `panel-shown` event
 * app.js dispatches - a hidden panel can't be measured), then call
 * `onRefresh` so the caller can re-measure things that depend on the
 * collapsed row heights (e.g. the panel's default height).
 * @param {HTMLElement} root
 * @param {() => void} [onRefresh]
 */
export function observeCandidateCollapse(root, onRefresh) {
  let lastWidth = 0;
  const run = () => {
    lastWidth = Math.round(root.getBoundingClientRect().width);
    refreshCandidateCollapse(root);
    if (lastWidth > 0) onRefresh?.();
  };
  new ResizeObserver(() => {
    if (Math.round(root.getBoundingClientRect().width) !== lastWidth) run();
  }).observe(root);
  root.closest('.app-panel')?.addEventListener('panel-shown', run);
}

/**
 * Click-handler helper: if the click landed on a "See more" / "Show less"
 * toggle, flip it and report that the click was handled.
 * @param {EventTarget} target - event.target of the click
 * @returns {boolean} true if the click was on a toggle (caller should stop)
 */
export function handleCandidateToggleClick(target) {
  const toggle = target.closest?.('.candidate-toggle');
  if (!toggle) return false;
  const container = toggle.closest('.population-candidates');
  const expanded = container.dataset.expanded !== 'true';
  container.dataset.expanded = String(expanded);
  container.classList.toggle('is-collapsed', !expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? 'Show less' : toggle.dataset.moreLabel;
  return true;
}
