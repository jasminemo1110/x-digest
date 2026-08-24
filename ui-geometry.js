(function initUiGeometry(root) {
  "use strict";

  function finite(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function positionNearSelection(selectionRect, toolbarRect, viewport, options = {}) {
    const margin = finite(options.margin) || 8;
    const gap = finite(options.gap) || 8;
    const viewportWidth = finite(viewport?.width);
    const viewportHeight = finite(viewport?.height);
    const toolbarWidth = finite(toolbarRect?.width);
    const toolbarHeight = finite(toolbarRect?.height);
    const selectionLeft = finite(selectionRect?.left);
    const selectionTop = finite(selectionRect?.top);
    const selectionBottom = finite(selectionRect?.bottom);
    const selectionWidth = finite(selectionRect?.width);

    const preferredLeft = selectionLeft + (selectionWidth / 2) - (toolbarWidth / 2);
    const maxLeft = Math.max(margin, viewportWidth - toolbarWidth - margin);
    const left = Math.max(margin, Math.min(maxLeft, preferredLeft));
    const below = selectionBottom + gap;
    const above = selectionTop - toolbarHeight - gap;
    const fitsBelow = below + toolbarHeight <= viewportHeight - margin;
    const top = fitsBelow
      ? below
      : Math.max(margin, Math.min(viewportHeight - toolbarHeight - margin, above));

    return { left, top, placement: fitsBelow ? "below" : "above" };
  }

  const api = { positionNearSelection };
  root.XDG_UI_GEOMETRY = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
