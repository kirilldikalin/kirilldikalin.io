const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/augmented-search-trees-core.js");

function run(initial) {
  let state = initial;
  let guard = 0;
  while (!state.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard < 200);
  }
  return state;
}

test("order-statistic select and rank agree on every stored key", () => {
  const values = [2, 5, 9, 14, 20, 27, 31];
  values.forEach((key, index) => {
    const selected = run(core.createState("order", { values, operation: "select", target: index + 1 }));
    const ranked = run(core.createState("order", { values, operation: "rank", target: key }));
    assert.equal(selected.frame.result, key);
    assert.equal(ranked.frame.result, index + 1);
  });
});

test("insertion updates subtree sizes only along the search path", () => {
  const final = run(core.createState("order", { values: [2, 4, 6, 8, 10], operation: "insert", target: 7 }));
  const root = final.frame.nodes[final.frame.rootId];
  assert.equal(root.size, 6);
  assert.ok(final.frame.recomputedIds.includes("new"));
  assert.ok(final.frame.recomputedIds.length <= 1 + final.frame.path.length);
});

test("interval search uses max pruning without losing a real overlap", () => {
  const intervals = [[1, 2], [4, 7], [9, 12], [14, 18], [21, 25], [27, 30]];
  const found = run(core.createState("interval", { intervals, operation: "search", target: [6, 8] }));
  assert.deepEqual(found.frame.result, [4, 7]);
  assert.ok(found.trace.frames.some((frame) => /отсечено|возможно слева/.test(frame.event)));
  const missing = run(core.createState("interval", { intervals, operation: "search", target: [31, 35] }));
  assert.equal(missing.frame.result, null);
});

test("interval insertion propagates the rightmost endpoint to the root", () => {
  const final = run(core.createState("interval", { intervals: [[1, 3], [5, 8], [10, 12]], operation: "insert", target: [15, 40] }));
  assert.equal(final.frame.nodes[final.frame.rootId].max, 40);
  assert.deepEqual(final.frame.result, [15, 40]);
});

test("invalid ranks, duplicate keys and malformed intervals fail closed", () => {
  assert.throws(() => core.createState("order", { values: [1, 2], operation: "select", target: 0 }), /rank/);
  assert.throws(() => core.createState("order", { values: [1, 1] }), /уникальны/);
  assert.throws(() => core.createState("interval", { intervals: [[4, 2]] }), /high/);
});
