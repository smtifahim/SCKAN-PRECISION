// Generic typeahead/autocomplete control used for every facet dropdown
// (End Organ, Species, Gene, Circuit Role) plus the fiber-type tree search box.
// It knows nothing about SCKAN/PRECISION data directly - callers supply a
// `search(query)` function that returns `{iri, label, subtitle?}` candidates,
// and the widget always resolves a selection down to an IRI.

let instanceCounter = 0;

/**
 * @param {Object} options
 * @param {HTMLElement} options.container - element the control is mounted into
 * @param {string} options.label - visible field label
 * @param {string} [options.placeholder]
 * @param {(query: string) => Array<{iri:string, label:string, subtitle?:string}>} options.search
 * @param {(entry: {iri:string,label:string}|null) => void} options.onChange
 */
export function createAutocomplete({ container, label, placeholder = 'Type to search…', search, onChange }) {
  const id = `ac-${instanceCounter++}`;
  let currentValue = null;
  let suggestions = [];
  let activeIndex = -1;

  container.classList.add('ac-field');
  container.innerHTML = `
    <label class="ac-label" for="${id}">${label}</label>
    <div class="ac-input-wrap">
      <input class="ac-input" id="${id}" type="text" placeholder="${placeholder}"
             autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" />
      <button type="button" class="ac-clear" title="Clear ${label}" aria-label="Clear ${label}">×</button>
    </div>
    <ul class="ac-suggestions" role="listbox" hidden></ul>
  `;

  const inputEl = container.querySelector('.ac-input');
  const clearEl = container.querySelector('.ac-clear');
  const listEl = container.querySelector('.ac-suggestions');

  function renderSuggestions() {
    if (suggestions.length === 0) {
      listEl.hidden = true;
      listEl.innerHTML = '';
      inputEl.setAttribute('aria-expanded', 'false');
      return;
    }
    listEl.hidden = false;
    inputEl.setAttribute('aria-expanded', 'true');
    listEl.innerHTML = suggestions
      .map((entry, i) => {
        const active = i === activeIndex ? ' is-active' : '';
        const subtitle = entry.subtitle ? `<span class="ac-subtitle">${entry.subtitle}</span>` : '';
        return `<li class="ac-option${active}" role="option" data-index="${i}">${entry.label}${subtitle}</li>`;
      })
      .join('');
  }

  function openSuggestionsFor(query) {
    suggestions = search(query ?? '').slice(0, 30);
    activeIndex = -1;
    renderSuggestions();
  }

  function closeSuggestions() {
    suggestions = [];
    activeIndex = -1;
    renderSuggestions();
  }

  function selectEntry(entry) {
    currentValue = entry;
    inputEl.value = entry ? entry.label : '';
    container.classList.toggle('has-value', Boolean(entry));
    closeSuggestions();
    onChange(entry);
  }

  inputEl.addEventListener('input', () => openSuggestionsFor(inputEl.value));
  inputEl.addEventListener('focus', () => openSuggestionsFor(inputEl.value));

  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestions.length === 0) openSuggestionsFor(inputEl.value);
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
      renderSuggestions();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderSuggestions();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectEntry(suggestions[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      closeSuggestions();
      inputEl.blur();
    }
  });

  listEl.addEventListener('mousedown', (event) => {
    const li = event.target.closest('.ac-option');
    if (!li) return;
    event.preventDefault();
    const entry = suggestions[Number(li.dataset.index)];
    if (entry) selectEntry(entry);
  });

  clearEl.addEventListener('click', () => selectEntry(null));

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) closeSuggestions();
  });

  return {
    element: container,
    getValue: () => currentValue,
    setValue(entry) {
      currentValue = entry;
      inputEl.value = entry ? entry.label : '';
      container.classList.toggle('has-value', Boolean(entry));
    },
    clear() {
      selectEntry(null);
    },
    setDisabled(disabled) {
      inputEl.disabled = disabled;
      container.classList.toggle('is-disabled', disabled);
    },
  };
}
