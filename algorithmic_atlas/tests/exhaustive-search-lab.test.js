const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/exhaustive-search-core.js");

test("reference subset-sum optimum is exact on every laboratory preset", () => {
  assert.equal(core.exactOptimum([7, 5, 4, 3, 2, 1], 12).value, 12);
  assert.equal(core.exactOptimum([9, 8, 6, 5, 4, 3, 2], 17).value, 17);
  assert.equal(core.exactOptimum([12, 11, 8, 7, 5, 4, 3], 21).value, 21);
});

test("every pruning and branch-order combination preserves the optimum", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    for (const useFeasibilityPruning of [false, true]) {
      for (const useBound of [false, true]) {
        for (const branchOrder of core.BRANCH_ORDERS) {
          const trace = core.buildTrace({
            preset,
            useFeasibilityPruning,
            useBound,
            branchOrder,
            incumbentMode: "empty",
          });
          assert.equal(trace.frames.at(-1).incumbentValue, trace.optimum.value);
          assert.equal(trace.frames.at(-1).finished, true);
        }
      }
    }
  }
});

test("plain exhaustive search visits the complete binary tree", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const count = core.PRESETS[preset].items.length;
    const trace = core.buildTrace({ preset, useFeasibilityPruning: false, useBound: false });
    assert.equal(trace.nodes.length, Math.pow(2, count + 1) - 1);
    assert.equal(trace.frames.at(-1).pruned, 0);
  }
});

test("bound and feasibility pruning reduce work and expose reasons", () => {
  const plain = core.buildTrace({ preset: "bound", useFeasibilityPruning: false, useBound: false });
  const pruned = core.buildTrace({ preset: "bound", useFeasibilityPruning: true, useBound: true });
  assert.ok(pruned.nodes.length < plain.nodes.length);
  assert.ok(pruned.nodes.some((node) => node.prunedReason === "infeasible"));
  assert.ok(pruned.nodes.some((node) => node.prunedReason === "bound"));
});

test("branch order changes when a strong incumbent is found", () => {
  const includeFirst = core.buildTrace({
    preset: "tight", branchOrder: "include-first", useBound: true,
  });
  const excludeFirst = core.buildTrace({
    preset: "tight", branchOrder: "exclude-first", useBound: true,
  });
  assert.notEqual(includeFirst.nodes.length, excludeFirst.nodes.length);
  assert.equal(includeFirst.optimum.value, excludeFirst.optimum.value);
});

test("greedy starting incumbent is an actual feasible subset", () => {
  for (const preset of Object.values(core.PRESETS)) {
    const result = core.greedyIncumbent(preset.items, preset.target);
    const sum = result.selected.reduce((total, index) => total + preset.items[index], 0);
    assert.equal(sum, result.value);
    assert.ok(sum <= preset.target);
  }
});

test("runtime state advances monotonically and terminates inside its bound", () => {
  let state = core.createState({ preset: "tight", useFeasibilityPruning: false, useBound: false });
  let steps = 0;
  while (!state.finished) {
    const previous = state.cursor;
    state = core.step(state);
    assert.equal(state.cursor, previous + 1);
    steps += 1;
    assert.ok(steps < 1100);
  }
  assert.equal(core.visualModel(state).frame.finished, true);
});

test("unsafe inputs and executable expressions are rejected by construction", () => {
  assert.throws(() => core.normalizeOptions({ items: [], target: 1 }), /от 1/);
  assert.throws(() => core.normalizeOptions({ items: [2, -1], target: 1 }), /items\[1\]/);
  assert.throws(() => core.normalizeOptions({ items: [2, 3], target: 9 }), /target/);
  assert.throws(() => core.normalizeOptions({ items: [2, 3], target: 4, branchOrder: "random" }), /порядок/);
  const source = fs.readFileSync(path.join(__dirname, "../labs/exhaustive-search.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});
