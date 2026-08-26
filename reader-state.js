(function initReaderState(root) {
  "use strict";

  const MAX_POSITIONS = 100;

  function validPostId(value) {
    const id = String(value || "");
    return /^\d+$/.test(id) ? id : "";
  }

  function normalizePositions(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).flatMap(([rawId, rawState]) => {
      const id = validPostId(rawId);
      const scrollY = Number(rawState?.scrollY);
      const updatedAt = Number(rawState?.updatedAt);
      if (!id || !Number.isFinite(scrollY) || scrollY < 0) return [];
      return [[id, {
        scrollY: Math.min(Math.round(scrollY), 10_000_000),
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
      }]];
    });
    return Object.fromEntries(entries
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_POSITIONS));
  }

  function updatePosition(value, postId, scrollY, now = Date.now()) {
    const id = validPostId(postId);
    const position = Number(scrollY);
    const positions = normalizePositions(value);
    if (!id || !Number.isFinite(position) || position < 0) return positions;
    positions[id] = {
      scrollY: Math.min(Math.round(position), 10_000_000),
      updatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    };
    return normalizePositions(positions);
  }

  function positionFor(value, postId) {
    const id = validPostId(postId);
    if (!id) return 0;
    return normalizePositions(value)[id]?.scrollY || 0;
  }

  const api = { MAX_POSITIONS, normalizePositions, updatePosition, positionFor };
  root.XDG_READER_STATE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
