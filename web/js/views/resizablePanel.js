// Drag-to-resize behaviors used by View (A): a horizontal resizer for the
// right-hand "candidate match evidence" panel, and a vertical resizer for
// the SCKAN Populations panel's own scroll area.

/**
 * Dragging the handle left/right changes the panel's width, clamped between
 * a sensible minimum and `maxRatio` of the current viewport width.
 * @param {Object} options
 * @param {HTMLElement} options.handle - the draggable divider element
 * @param {HTMLElement} options.panel - the panel whose width is being resized
 * @param {number} [options.minWidth] - minimum panel width in px
 * @param {number} [options.maxRatio] - maximum panel width as a fraction of window width
 */
export function makeResizable({ handle, panel, minWidth = 260, maxRatio = 0.35 }) {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerMove(event) {
    if (!dragging) return;
    // The handle sits on the panel's left edge: dragging left (negative dx)
    // should widen the panel, dragging right should narrow it.
    const dx = event.clientX - startX;
    const maxWidth = window.innerWidth * maxRatio;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - dx));
    panel.style.width = `${nextWidth}px`;
  }

  function stopDragging() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
  }

  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    event.preventDefault();
  });
}

/**
 * Dragging the handle up/down changes the scrollable element's height,
 * clamped between a minimum and `maxRatio` of the current viewport height
 * (so the panel can never grow to swallow more than, e.g., half the screen).
 * @param {Object} options
 * @param {HTMLElement} options.handle - the draggable divider element, sitting on the panel's bottom edge
 * @param {HTMLElement} options.scrollEl - the element whose height (and scrolling) is being resized
 * @param {number} [options.minHeight] - minimum height in px
 * @param {number} [options.maxRatio] - maximum height as a fraction of window height
 */
export function makeVerticallyResizable({ handle, scrollEl, minHeight = 60, maxRatio = 0.5 }) {
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  function onPointerMove(event) {
    if (!dragging) return;
    const dy = event.clientY - startY;
    const maxHeight = window.innerHeight * maxRatio;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy));
    scrollEl.style.height = `${nextHeight}px`;
  }

  function stopDragging() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-resizing-vertical');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
  }

  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    startY = event.clientY;
    startHeight = scrollEl.getBoundingClientRect().height;
    document.body.classList.add('is-resizing-vertical');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    event.preventDefault();
  });
}
