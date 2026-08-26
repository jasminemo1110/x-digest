const test = require("node:test");
const assert = require("node:assert/strict");

const state = require("../reader-state.js");

test("stores independent bounded reader positions by X status ID", () => {
  let positions = state.updatePosition({}, "123", 427.5, 10);
  positions = state.updatePosition(positions, "456", 91, 20);
  assert.equal(state.positionFor(positions, "123"), 428);
  assert.equal(state.positionFor(positions, "456"), 91);
  assert.equal(state.positionFor(positions, "789"), 0);
  assert.deepEqual(state.updatePosition(positions, "not-an-id", 20, 30), positions);
});

test("drops invalid positions and keeps only the most recently updated 100", () => {
  let positions = { broken: { scrollY: -1, updatedAt: 9999 } };
  for (let index = 1; index <= 105; index += 1) {
    positions = state.updatePosition(positions, String(index), index * 10, index);
  }
  assert.equal(Object.keys(positions).length, state.MAX_POSITIONS);
  assert.equal(state.positionFor(positions, "1"), 0);
  assert.equal(state.positionFor(positions, "105"), 1050);
});
