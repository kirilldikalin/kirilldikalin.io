const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/randomized-data-structures-core.js");

test("same seed reproduces skip-list levels and treap priorities", () => {
  const keys = "40,10,70,20,60,30,50";
  assert.deepEqual(core.buildSkipList(keys, 42), core.buildSkipList(keys, 42));
  assert.deepEqual(core.buildTreap(keys, 42), core.buildTreap(keys, 42));
  assert.notDeepEqual(core.buildTreap(keys, 42).nodes, core.buildTreap(keys, 43).nodes);
});

test("skip-list levels are nested and bounded", () => {
  const list = core.buildSkipList("1,2,3,4,5,6,7,8,9,10", 91);
  assert.ok(list.height >= 1 && list.height <= core.MAX_LEVEL);
  for (let index = 1; index < list.levels.length; index += 1) {
    assert.ok(list.levels[index - 1].every((key) => list.levels[index].includes(key)));
  }
});

test("treap preserves both BST and heap invariants", () => {
  const treap = core.buildTreap("40,10,70,20,60,30,50", 1234);
  assert.equal(core.validateTreap(treap.root, -Infinity, Infinity, null), true);
  assert.equal(treap.nodes.length, 7);
});

test("height experiment is bounded and reproducible", () => {
  const first = core.observedHeights("1,2,3,4,5,6,7,8,9", 17, 32);
  const second = core.observedHeights("1,2,3,4,5,6,7,8,9", 17, 32);
  assert.deepEqual(first, second);
  assert.equal(first.length, 32);
  assert.ok(first.every(({ skip, treap }) => skip <= 8 && treap <= 9));
});

test("stepwise insertion terminates without mutating the input", () => {
  let state = core.createState("treap", "4,2,8,1", 9);
  const original = state.keys.slice();
  assert.equal(state.inserted, 1);
  while (!state.finished) state = core.step(state);
  assert.deepEqual(state.keys, original);
  assert.equal(state.inserted, 4);
  assert.equal(core.visualModel(state).exact, true);
});
