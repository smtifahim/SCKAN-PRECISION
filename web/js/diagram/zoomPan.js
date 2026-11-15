// Zoom and pan for a rendered diagram. The SVG is wrapped in a layer that is
// moved/scaled with a CSS transform inside a clipping viewport, so the SVG's
// own viewBox (which the PNG export reads) is never touched.
//
//   - "+" / "-" buttons zoom around the centre; the percentage resets to 100%
//   - Ctrl/Cmd + mouse wheel (or a trackpad pinch) zooms around the pointer
//   - drag to pan once zoomed; clicks on links/edges still work (a drag that
//     moved is not treated as a click)

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const BUTTON_STEP = 1.25;
const WHEEL_SENSITIVITY = 0.003; // one mouse-wheel notch (deltaY 100) is about 1.35x; pinch deltas are small
const DRAG_THRESHOLD_PX = 4;
const KEEP_VISIBLE_PX = 60; // how much of the diagram must stay in view when panning

/**
 * Remove a diagram's zoom controls from the toolbar slot; call this before
 * replacing the diagram with a plain message so no stale controls remain.
 * @param {HTMLElement} container
 */
export function clearZoomControls(container) {
  container.closest('.diagram-box')?.querySelector('.diagram-zoom-slot')?.replaceChildren();
}

/**
 * Wraps `svgEl` (already inside `container`) in a zoomable viewport and adds
 * the zoom controls.
 * @param {HTMLElement} container
 * @param {SVGElement} svgEl
 */
export function makeZoomable(container, svgEl) {
  const viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';
  const layer = document.createElement('div');
  layer.className = 'diagram-zoom-layer';
  layer.append(svgEl);
  viewport.append(layer);

  const controls = document.createElement('div');
  controls.className = 'diagram-zoom-controls';
  controls.innerHTML = `
    <button type="button" class="btn" data-zoom="out" title="Zoom out" aria-label="Zoom out">&minus;</button>
    <button type="button" class="btn" data-zoom="reset" title="Reset zoom (Ctrl/Cmd + scroll to zoom, drag to pan)">100%</button>
    <button type="button" class="btn" data-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>`;
  const resetBtn = controls.querySelector('[data-zoom="reset"]');

  // The controls live in the diagram box's persistent toolbar (next to the
  // pathway toggle) when there is one, otherwise inside the container.
  const slot = container.closest('.diagram-box')?.querySelector('.diagram-zoom-slot');
  if (slot) {
    slot.replaceChildren(controls);
    container.replaceChildren(viewport);
  } else {
    container.replaceChildren(viewport, controls);
  }

  let scale = 1;
  let x = 0;
  let y = 0;

  function clampPan() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const lw = layer.offsetWidth * scale;
    const lh = layer.offsetHeight * scale;
    x = Math.min(vw - KEEP_VISIBLE_PX, Math.max(KEEP_VISIBLE_PX - lw, x));
    y = Math.min(vh - KEEP_VISIBLE_PX, Math.max(KEEP_VISIBLE_PX - lh, y));
  }

  function apply() {
    if (scale === 1) {
      x = 0;
      y = 0;
    } else {
      clampPan();
    }
    layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    resetBtn.textContent = `${Math.round(scale * 100)}%`;
    viewport.classList.toggle('is-zoomed', scale !== 1);
  }

  // Zoom so the point (cx, cy), in viewport coordinates, stays under the cursor.
  function zoomAt(factor, cx, cy) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    if (next === scale) return;
    const ratio = next / scale;
    x = cx - (cx - x) * ratio;
    y = cy - (cy - y) * ratio;
    scale = next;
    apply();
  }

  controls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!action) return;
    if (action === 'reset') {
      scale = 1;
      apply();
      return;
    }
    zoomAt(action === 'in' ? BUTTON_STEP : 1 / BUTTON_STEP, viewport.clientWidth / 2, viewport.clientHeight / 2);
  });

  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return; // plain scrolling keeps scrolling the page
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * WHEEL_SENSITIVITY), event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false }
  );

  let drag = null;
  let suppressNextClick = false;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || scale === 1) return;
    drag = { startX: event.clientX, startY: event.clientY, originX: x, originY: y, moved: false, pointerId: event.pointerId };
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      viewport.setPointerCapture(drag.pointerId);
      viewport.classList.add('is-panning');
    }
    x = drag.originX + dx;
    y = drag.originY + dy;
    apply();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      suppressNextClick = true;
      viewport.classList.remove('is-panning');
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
    drag = null;
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener(
    'click',
    (event) => {
      if (!suppressNextClick) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true
  );
}
