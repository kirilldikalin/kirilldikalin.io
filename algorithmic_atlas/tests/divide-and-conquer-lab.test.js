const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/divide-and-conquer-core.js");

test("scenario decompositions use exact integer child sizes", () => {
  assert.deepEqual(core.childSizes("binary", 17), [8]);
  assert.deepEqual(core.childSizes("merge", 17), [8, 9]);
  assert.deepEqual(core.childSizes("karatsuba", 17), [9, 9, 9]);
  assert.deepEqual(core.childSizes("power", 17), [8]);
  assert.deepEqual(core.childSizes("unbalanced", 17), [16, 1]);
  for (const scenario of Object.keys(core.SCENARIOS)) {
    assert.deepEqual(core.childSizes(scenario, 1), []);
  }
});

test("merge-sort levels have constant work on powers of two", () => {
  for (const size of [8, 16, 32, 64]) {
    const tree = core.buildTree({ scenario: "merge", size });
    assert.equal(tree.levels.length, Math.log2(size) + 1);
    tree.levels.forEach((level) => assert.equal(level.work, size));
    assert.equal(tree.totalWork, size * (Math.log2(size) + 1));
  }
});

test("binary search and fast power produce logarithmic paths", () => {
  for (const scenario of ["binary", "power"]) {
    const tree = core.buildTree({ scenario, size: 64 });
    assert.equal(tree.nodes.length, 7);
    assert.equal(tree.maximumDepth, 6);
    assert.equal(tree.span, tree.totalWork);
  }
});

test("Karatsuba creates three half-size subproblems per internal node", () => {
  const tree = core.buildTree({ scenario: "karatsuba", size: 16 });
  assert.equal(tree.nodes.length, 1 + 3 + 9 + 27 + 81);
  assert.deepEqual(tree.nodes[0].childIds.length, 3);
  assert.equal(tree.maximumDepth, 4);
  assert.ok(tree.totalWork < 16 * 16);
});

test("unbalanced split exposes quadratic accumulated work", () => {
  for (const size of [8, 16, 32]) {
    const tree = core.buildTree({ scenario: "unbalanced", size });
    assert.equal(tree.maximumDepth, size - 1);
    assert.equal(tree.nodes.length, 2 * size - 1);
    assert.equal(tree.totalWork, size * (size + 3) / 2 - 1);
  }
});

test("postorder combine occurs only after all child results", () => {
  const tree = core.buildTree({ scenario: "merge", size: 16 });
  const events = core.buildEvents(tree);
  const combineIndex = new Map();
  events.forEach((event, index) => {
    if (event.type === "combine" || event.type === "return") combineIndex.set(event.nodeId, index);
  });
  tree.nodes.forEach((node) => {
    node.childIds.forEach((childId) => assert.ok(combineIndex.get(childId) < combineIndex.get(node.id)));
  });
});

test("stepping is deterministic, bounded and ends after the root combine", () => {
  let state = core.createState({ scenario: "karatsuba", size: 32 });
  const expectedEvents = state.events.length;
  let steps = 0;
  while (!state.finished) {
    state = core.step(state);
    steps += 1;
    assert.ok(steps < 2300);
  }
  assert.equal(steps, expectedEvents - 1);
  assert.equal(state.events.at(-1).nodeId, 0);
  assert.equal(state.events.at(-1).type, "combine");
  assert.equal(core.visualModel(state).completedCount, state.tree.nodes.length);
});

test("invalid scenarios, sizes and executable expressions are rejected", () => {
  assert.throws(() => core.normalizeOptions({ scenario: "unknown", size: 8 }), /сценарий/);
  assert.throws(() => core.normalizeOptions({ scenario: "merge", size: 1 }), /size/);
  assert.throws(() => core.normalizeOptions({ scenario: "merge", size: 65 }), /size/);
  const source = fs.readFileSync(path.join(__dirname, "../labs/divide-and-conquer.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});
