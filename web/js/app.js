// Application bootstrap: tab switching between View (A) and View (B), and
// kicking off both views' initialization.

import { initViewA } from './views/viewA.js';
import { initViewB } from './views/viewB.js';

function initTabs() {
  const tabButtons = document.querySelectorAll('.app-tab');
  const panels = document.querySelectorAll('.app-panel');
  const viewAChrome = document.querySelector('#view-a-chrome');
  const viewBChrome = document.querySelector('#view-b-chrome');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      panels.forEach((p) => {
        p.hidden = p.id !== btn.dataset.panel;
      });
      // Each view's filter bar only applies while its own panel is active.
      viewAChrome.hidden = btn.dataset.panel !== 'panel-view-a';
      viewBChrome.hidden = btn.dataset.panel !== 'panel-view-b';
      // Content in a hidden panel can't be measured, so let the newly shown panel re-fit itself.
      document.getElementById(btn.dataset.panel).dispatchEvent(new CustomEvent('panel-shown'));
    });
  });
}

async function main() {
  initTabs();
  const viewARoot = document.querySelector('#panel-view-a');
  try {
    // The top chrome (filter bar + toolbar) for View (A) lives outside
    // #panel-view-a, so View (A) needs to query the whole document rather
    // than just its own panel subtree.
    await initViewA(document);
  } catch (err) {
    console.error('Failed to initialize View (A)', err);
    viewARoot.querySelector('#diagram-container').innerHTML =
      '<p class="diagram-empty">Failed to load data. Check the console - this app must be served over HTTP (not opened as a file://) from the repository root.</p>';
  }

  const viewBRoot = document.querySelector('#panel-view-b');
  try {
    await initViewB(document);
  } catch (err) {
    console.error('Failed to initialize View (B)', err);
    viewBRoot.querySelector('#diagram-container-b').innerHTML =
      '<p class="diagram-empty">Failed to load data. Check the console - this app must be served over HTTP (not opened as a file://) from the repository root.</p>';
  }
}

main();
