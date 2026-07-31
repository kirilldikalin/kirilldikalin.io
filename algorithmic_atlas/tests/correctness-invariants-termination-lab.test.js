const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/correctness-invariants-termination-core.js");

test("lower-bound search finds the first duplicate and preserves its invariant", () => {
  const run = core.runToEnd(core.createState("1,3,3,3,7,9", "3"));
  assert.equal(run.state.foundIndex, 1);
  run.trace.forEach((state, index) => {
    assert.equal(state.invariant.holds, true);
    if (index > 0) assert.ok(state.variant < run.trace[index - 1].variant);
  });
});

test("empty, single and absent targets terminate correctly", () => {
  assert.equal(core.createState("", "4").foundIndex, -1);
  assert.equal(core.runToEnd(core.createState("4", "4")).state.foundIndex, 0);
  assert.equal(core.runToEnd(core.createState("4", "3")).state.foundIndex, -1);
  assert.equal(core.runToEnd(core.createState("1,4,9", "20")).state.foundIndex, -1);
});

test("unsorted and malformed arrays fail before execution", () => {
  assert.throws(() => core.parseArray("2,1"), /sorted/);
  assert.throws(() => core.parseArray("1,x"), /integers/);
  assert.throws(() => core.parseArray(Array.from({ length: 65 }, (_, i) => i).join(",")), /more than/);
});

test("visual cells agree with the exact interval", () => {
  const state = core.step(core.createState("1,3,5,7,9", "7"));
  const model = core.visualModel(state);
  assert.equal(model.exact, true);
  assert.equal(model.cells.filter(({ isMid }) => isMid).length, 1);
  assert.equal(model.cells.slice(0, model.lo).every(({ status }) => status === "eliminated"), true);
});
