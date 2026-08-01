const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/dynamic-programming-core.js");

function options(presetName, method, stateModel) {
  const preset = core.PRESETS[presetName];
  return {
    items: preset.items,
    capacity: preset.capacity,
    method: method || "tabulation",
    stateModel: stateModel || "prefix-capacity",
  };
}

function run(input) {
  let state = core.createState(input);
  let steps = 0;
  while (!core.isFinished(state)) {
    state = core.step(state);
    steps += 1;
    assert.ok(steps < 300, "trace must stay bounded");
  }
  return core.visualModel(state);
}

test("tabulation computes exact 0/1-knapsack optima for every preset", () => {
  const expected = { classic: 46, collision: 15, dense: 30 };
  for (const name of Object.keys(expected)) {
    const model = run(options(name));
    assert.equal(model.optimum, expected[name], name);
  }
});

test("memoization and tabulation agree on value and reconstructed witness", () => {
  for (const name of Object.keys(core.PRESETS)) {
    const tabulation = run(options(name, "tabulation"));
    const memoization = run(options(name, "memoization"));
    assert.equal(memoization.optimum, tabulation.optimum);
    assert.deepEqual(memoization.finalSelection, tabulation.finalSelection);
  }
});

test("every computed state follows its dependencies in topological order", () => {
  const trace = core.buildTrace(options("dense", "memoization"));
  const resolved = new Set();
  for (let capacity = 0; capacity <= trace.options.capacity; capacity += 1) {
    resolved.add("0:" + capacity);
  }
  for (const event of trace.events) {
    if (event.type !== "compute") continue;
    for (const dependency of event.dependencies) {
      assert.ok(resolved.has(dependency.i + ":" + dependency.capacity));
    }
    resolved.add(event.i + ":" + event.capacity);
  }
});

test("reconstruction is feasible and has the reported optimum value", () => {
  for (const name of Object.keys(core.PRESETS)) {
    const trace = core.buildTrace(options(name));
    const weight = trace.selected.reduce((sum, index) => sum + trace.options.items[index].weight, 0);
    const value = trace.selected.reduce((sum, index) => sum + trace.options.items[index].value, 0);
    assert.ok(weight <= trace.options.capacity);
    assert.equal(value, trace.optimum);
  }
});

test("capacity-only state is rejected with a concrete value collision", () => {
  const trace = core.buildTrace(options("collision", "tabulation", "capacity-only"));
  assert.equal(trace.validState, false);
  assert.ok(trace.collision);
  assert.equal(trace.collision.capacity >= 0, true);
  assert.notEqual(trace.collision.first.value, trace.collision.second.value);
  assert.equal(trace.optimum, null);
});

test("dependency construction matches skip and take transitions", () => {
  const normalized = core.normalizeOptions(options("classic"));
  assert.deepEqual(core.dependencies(normalized, 1, 2), [
    { i: 0, capacity: 2, kind: "skip" },
  ]);
  assert.deepEqual(core.dependencies(normalized, 2, 5), [
    { i: 1, capacity: 5, kind: "skip" },
    { i: 1, capacity: 2, kind: "take" },
  ]);
});

test("traces are deterministic and immutable at their public boundary", () => {
  const first = core.buildTrace(options("classic", "memoization"));
  const second = core.buildTrace(options("classic", "memoization"));
  assert.deepEqual(first.events, second.events);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.events));
});

test("unsafe and oversized inputs are rejected", () => {
  assert.throws(() => core.createState({ items: [], capacity: 3 }), /1 до 7/);
  assert.throws(() => core.createState({ items: [{ weight: 1, value: 1 }], capacity: 100 }), /1 до 14/);
  assert.throws(() => core.createState({ items: [{ weight: "alert(1)", value: 1 }], capacity: 3 }), /Вес/);
  assert.throws(() => core.createState({ items: [{ weight: 1, value: 1 }], capacity: 3, method: "eval" }), /порядок/);
});
