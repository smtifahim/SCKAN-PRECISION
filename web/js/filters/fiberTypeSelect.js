// Hierarchical fiber/axon-type selector driven by
// resource/json/fiber-type-hierarchy.json. Selecting any node (parent or
// leaf) matches that node's IRI plus every descendant IRI (the closure is
// computed once in data/fiberHierarchy.js). Nodes whose closure has zero
// overlap with the current cascade-available IRIs are dimmed, not hidden -
// they stay pickable so the tree remains fully navigable.

export function createFiberTypeSelect({ container, label, fiberHierarchy, onChange }) {
  let currentIri = null;
  let availableIris = null; // null = no restriction yet
  let filterText = '';
  let isOpen = false;

  container.classList.add('ft-field');
  container.innerHTML = `
    <label class="ac-label">${label}</label>
    <button type="button" class="ft-trigger">
      <span class="ft-trigger-text">Any fiber type</span>
      <span class="ft-trigger-arrow">▾</span>
    </button>
    <div class="ft-panel" hidden>
      <input type="text" class="ft-search" placeholder="Filter fiber types…" autocomplete="off" />
      <div class="ft-tree-scroll"><ul class="ft-tree"></ul></div>
      <button type="button" class="ft-clear">Clear selection</button>
    </div>
  `;

  const triggerEl = container.querySelector('.ft-trigger');
  const triggerTextEl = container.querySelector('.ft-trigger-text');
  const panelEl = container.querySelector('.ft-panel');
  const searchEl = container.querySelector('.ft-search');
  const treeEl = container.querySelector('.ft-tree');
  const clearEl = container.querySelector('.ft-clear');

  function nodeHasOverlap(node) {
    if (!availableIris) return true;
    const closure = fiberHierarchy.descendantsOf(node.iri);
    for (const iri of closure) {
      if (availableIris.has(iri)) return true;
    }
    return false;
  }

  function nodeMatchesFilter(node) {
    if (!filterText) return true;
    if (node.label.toLowerCase().includes(filterText)) return true;
    return node.children.some(nodeMatchesFilter);
  }

  function renderNode(node) {
    const visible = nodeMatchesFilter(node);
    if (!visible) return '';
    const dim = nodeHasOverlap(node) ? '' : ' is-unavailable';
    const selected = node.iri === currentIri ? ' is-selected' : '';
    const childrenHtml = node.children.map(renderNode).join('');
    const hasChildren = node.children.length > 0;
    return `
      <li class="ft-node${dim}${selected}" data-iri="${encodeURIComponent(node.iri)}">
        <div class="ft-row">
          ${hasChildren ? '<span class="ft-toggle">▸</span>' : '<span class="ft-toggle ft-toggle-leaf"></span>'}
          <span class="ft-node-label">${node.label}</span>
        </div>
        ${hasChildren ? `<ul class="ft-children">${childrenHtml}</ul>` : ''}
      </li>
    `;
  }

  function render() {
    treeEl.innerHTML = fiberHierarchy.roots.map(renderNode).join('');
    // Auto-expand every branch while the user is actively filtering.
    if (filterText) {
      treeEl.querySelectorAll('.ft-node').forEach((li) => li.classList.add('is-expanded'));
    }
  }

  triggerEl.addEventListener('click', () => {
    isOpen = !isOpen;
    panelEl.hidden = !isOpen;
    if (isOpen) searchEl.focus();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) {
      isOpen = false;
      panelEl.hidden = true;
    }
  });

  searchEl.addEventListener('input', () => {
    filterText = searchEl.value.trim().toLowerCase();
    render();
  });

  treeEl.addEventListener('click', (event) => {
    const toggle = event.target.closest('.ft-toggle:not(.ft-toggle-leaf)');
    const row = event.target.closest('.ft-row');
    const li = event.target.closest('.ft-node');
    if (!li) return;

    if (toggle) {
      li.classList.toggle('is-expanded');
      return;
    }
    if (row) {
      const iri = decodeURIComponent(li.dataset.iri);
      selectIri(iri === currentIri ? null : iri);
    }
  });

  clearEl.addEventListener('click', () => selectIri(null));

  function findNodeLabel(iri) {
    return fiberHierarchy.nodesByIri.get(iri)?.label ?? null;
  }

  function selectIri(iri) {
    currentIri = iri;
    triggerTextEl.textContent = iri ? findNodeLabel(iri) : 'Any fiber type';
    container.classList.toggle('has-value', Boolean(iri));
    render();
    onChange(iri ? { iri, label: findNodeLabel(iri) } : null);
  }

  render();

  return {
    element: container,
    getValue: () => (currentIri ? { iri: currentIri, label: findNodeLabel(currentIri) } : null),
    setValue(entry) {
      currentIri = entry?.iri ?? null;
      triggerTextEl.textContent = entry ? entry.label : 'Any fiber type';
      container.classList.toggle('has-value', Boolean(entry));
      render();
    },
    clear() {
      selectIri(null);
    },
    /** Restrict which nodes are highlighted as "available" under the active cascade; dims, never hides. */
    setAvailableIris(iriSet) {
      availableIris = iriSet;
      render();
    },
  };
}
