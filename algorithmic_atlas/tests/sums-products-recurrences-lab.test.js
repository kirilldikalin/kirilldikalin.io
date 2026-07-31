const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/sums-products-recurrences-core.js");

test("the binary linear recurrence has equal work on every complete level", () => {
  const model = core.treeModel("binary-linear", 1024, 8);
  model.levels.forEach((level) => assert.equal(level.levelCost, 1024));
  assert.equal(model.cumulativeCost, 9 * 1024);
  assert.equal(model.master.case, 2);
});

test("Master theorem is rejected when its structural assumptions fail", () => {
  assert.equal(core.masterCase("mixed-linear").applicable, false);
  assert.equal(core.masterCase("decrement-linear").applicable, false);
  assert.equal(core.masterCase("triple-linear").case, 3);
});

test("large levels aggregate their visible geometry without losing totals", () => {
  const model = core.treeModel("triple-linear", 4096, 10);
  const last = model.levels.at(-1);
  assert.equal(last.nodeCount, 59049n);
  assert.equal(last.visibleSizes.length, core.MAX_VISIBLE_NODES);
  assert.equal(last.aggregated, true);
  assert.ok(last.omittedNodes > 0);
});

test("playback reveals one level at a time", () => {
  let state = core.createState("binary-constant", 64, 6);
  while (!core.isFinished(state)) state = core.step(state);
  assert.equal(state.visibleLevel, 6);
  assert.throws(() => core.treeModel("binary-linear", 10, core.MAX_DEPTH + 1), /от 0/);
});
