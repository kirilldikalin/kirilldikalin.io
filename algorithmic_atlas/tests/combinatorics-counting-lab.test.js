const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/combinatorics-counting-core.js");

test("binomial coefficients and grid paths agree exactly", () => {
  assert.equal(core.binomial(40, 20), 137846528820n);
  for (const [rows, columns] of [[0, 0], [0, 8], [4, 7], [20, 20]]) {
    const model = core.gridPaths(rows, columns);
    assert.equal(model.total, model.closedForm);
    assert.equal(model.total, core.binomial(rows + columns, rows));
  }
});

test("inclusion-exclusion preserves all four disjoint regions", () => {
  const model = core.inclusionExclusion(100, 45, 38, 15);
  assert.equal(model.onlyA + model.onlyB + model.intersection + model.neither, 100);
  assert.equal(model.union, 68);
  assert.equal(model.identityHolds, true);
  assert.equal(core.createState("inclusion", {
    universe: 0,
    a: 0,
    b: 0,
    intersection: 0,
  }).model.union, 0);
  assert.throws(() => core.inclusionExclusion(10, 8, 8, 0), /do not fit/);
});

test("pigeonhole configurations meet the sharp ceiling bound", () => {
  for (const [items, boxes] of [[0, 3], [3, 3], [4, 3], [200, 30]]) {
    const model = core.pigeonholeModel(items, boxes);
    assert.equal(model.occupancy.reduce((sum, value) => sum + value, 0), items);
    assert.equal(model.guaranteedMaximum, Math.ceil(items / boxes));
    assert.equal(model.principleHolds, true);
    assert.equal(model.collisionForced, items > boxes);
  }
});

test("each counting mode advances to a finite terminal stage", () => {
  for (const [mode, options] of [
    ["grid", { rows: 4, columns: 5 }],
    ["inclusion", { universe: 20, a: 8, b: 9, intersection: 3 }],
    ["pigeonhole", { items: 13, boxes: 5 }],
  ]) {
    let state = core.createState(mode, options);
    let guard = 0;
    while (!core.isFinished(state)) {
      state = core.step(state);
      guard += 1;
      assert.ok(guard <= state.maximumStage);
    }
    assert.equal(state.stage, state.maximumStage);
  }
  assert.throws(() => core.gridPaths(core.MAX_GRID_SIDE + 1, 1), /от 0/);
});
