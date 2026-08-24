const test = require("node:test");
const assert = require("node:assert/strict");
const geometry = require("../ui-geometry.js");

test("centers Explain below a selection when there is room", () => {
  assert.deepEqual(
    geometry.positionNearSelection(
      { left: 120, top: 100, bottom: 120, width: 40 },
      { width: 100, height: 42 },
      { width: 360, height: 600 },
    ),
    { left: 90, top: 128, placement: "below" },
  );
});

test("flips Explain above the selection and clamps horizontal edges", () => {
  assert.deepEqual(
    geometry.positionNearSelection(
      { left: 340, top: 540, bottom: 560, width: 20 },
      { width: 120, height: 42 },
      { width: 360, height: 600 },
    ),
    { left: 232, top: 490, placement: "above" },
  );
});
