const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/analysis-cases-core.js");

test("the adversary forces linear search to inspect the last cell", () => {
  let state = core.adversaryState(32);
  assert.equal(core.visualModel(state).cells.some(({ targetRevealed }) => targetRevealed), false);
  while (!state.finished) state = core.adversaryStep(state);
  assert.equal(state.tested, 32);
  assert.equal(state.foundAt, 31);
  const visual = core.visualModel(state);
  assert.equal(visual.cost, 32);
  assert.deepEqual(visual.cells.filter(({ targetRevealed }) => targetRevealed).map(({ index }) => index), [31]);
});

test("average-case distribution is normalized and responds to assumptions", () => {
  const uniform = core.searchDistribution(20, 0, 0);
  const absent = core.searchDistribution(20, 1000, 0);
  const frontBiased = core.searchDistribution(20, 0, 1000);
  assert.ok(Math.abs(uniform.totalProbability - 1) < 1e-12);
  assert.ok(Math.abs(absent.totalProbability - 1) < 1e-12);
  assert.equal(absent.expectedCost, 20);
  assert.ok(frontBiased.expectedCost < uniform.expectedCost);
});

test("the potential identity accounts for every dynamic-array push", () => {
  let state = core.dynamicArrayState(257);
  while (!state.finished) {
    const previousPotential = state.potential;
    state = core.dynamicArrayStep(state);
    assert.equal(state.last.amortized, state.last.actual + state.last.deltaPotential);
    assert.equal(state.last.deltaPotential, state.potential - previousPotential);
    assert.ok(state.last.amortized <= 3);
    assert.ok(state.potential >= 0);
  }
  assert.equal(state.amortizedTotal, state.actualTotal + state.potential);
  assert.equal(state.size, 257);
  assert.ok(state.capacity >= state.size);
});

test("all three case-analysis modes terminate and reject invalid sizes", () => {
  for (const [mode, options] of [
    ["adversary", { size: 5 }],
    ["average", { size: 5, absentPermille: 200, biasPermille: 300 }],
    ["amortized", { operations: 20 }],
  ]) {
    let state = core.createState(mode, options);
    let guard = 0;
    while (!state.finished) {
      state = core.step(state);
      guard += 1;
      assert.ok(guard < 100);
    }
  }
  assert.throws(() => core.adversaryState(core.MAX_SIZE + 1), /от 1/);
  assert.throws(() => core.searchDistribution(4, 1001, 0), /от 0/);
});
