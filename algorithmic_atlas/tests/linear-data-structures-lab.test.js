const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/linear-data-structures-core.js");

function run(initial) {
  let state = initial;
  let guard = 0;
  while (!state.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard < 500);
  }
  return state;
}

test("geometric growth copies every live element and stays within the 3n accounting bound", () => {
  const final = run(core.createState("dynamic", { values: [1, 2, 3, 4, 5, 6, 7], initialCapacity: 1 }));
  assert.deepEqual(final.frame.memory.slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(final.frame.size, 7);
  assert.ok(final.frame.actualCost <= final.frame.amortizedBudget);
  assert.ok(final.trace.frames.some((frame) => frame.action === "copy"));
});

test("middle insertion shifts the suffix and linked insertion rewires only two pointers after traversal", () => {
  const arrayFinal = run(core.createState("array-insert", { values: [10, 20, 30, 40], index: 2, value: 25 }));
  assert.deepEqual(arrayFinal.frame.memory, [10, 20, 25, 30, 40]);
  assert.equal(arrayFinal.frame.actualCost, 3);

  const listFinal = run(core.createState("list-insert", { values: [10, 20, 30, 40], index: 2, value: 25 }));
  const inserted = listFinal.frame.nodes.find((node) => node.id === "new");
  assert.equal(inserted.next, "n2");
  assert.equal(listFinal.frame.nodes.find((node) => node.id === "n1").next, "new");
  assert.equal(listFinal.frame.pointerWrites, 2);
});

test("inputs and visible geometry are bounded", () => {
  assert.throws(() => core.createState("dynamic", { values: [] }), /от 1/);
  assert.throws(() => core.createState("array-insert", { values: [1, 2], index: 3 }), /index/);
  assert.throws(() => core.createState("dynamic", { values: Array(19).fill(1) }), /18/);
  const model = core.visualModel(core.createState("dynamic", { values: [1], initialCapacity: 8 }));
  assert.ok(model.memory.length <= 24);
});
