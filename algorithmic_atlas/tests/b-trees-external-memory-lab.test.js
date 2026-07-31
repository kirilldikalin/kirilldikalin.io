const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/b-trees-external-memory-core.js");

test("balanced leaf pages preserve sorted keys and occupancy", () => {
  const tree = core.buildTree("5,10,15,20,25,30,35,40");
  assert.deepEqual(tree.leaves.flatMap(({ keys }) => keys), [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.ok(tree.leaves.every(({ keys }) => keys.length >= 2 && keys.length <= core.PAGE_CAPACITY));
  assert.deepEqual(tree.root.keys, tree.leaves.slice(1).map(({ keys }) => keys[0]));
});

test("insert scenario exposes split and promoted separator", () => {
  const frames = core.insertFrames("5,10,15,20,25,30", 18);
  assert.ok(frames.some(({ action }) => action === "split"));
  assert.ok(frames.some(({ action }) => action === "promote"));
  assert.deepEqual(frames.at(-1).tree.keys, [5, 10, 15, 18, 20, 25, 30]);
  assert.deepEqual(frames.at(-1).tree.leaves.map(({ keys }) => keys), [[5, 10], [15, 18], [20, 25, 30]]);
  assert.ok(frames.at(-1).io >= 4);
});

test("delete scenario exposes underflow merge", () => {
  const frames = core.deleteFrames("5,10,15,20", 5);
  assert.ok(frames.some(({ action }) => action === "merge"));
  assert.deepEqual(frames.at(-1).tree.keys, [10, 15, 20]);
});

test("delete borrows from a sibling with spare occupancy", () => {
  const frames = core.deleteFrames("5,10,15,20,25", 20);
  assert.ok(frames.some(({ action }) => action === "borrow"));
  assert.ok(!frames.some(({ action }) => action === "merge"));
  assert.deepEqual(frames.at(-1).tree.leaves.map(({ keys }) => keys), [[5, 10], [15, 25]]);
});

test("deleting the only key leaves one valid empty root leaf", () => {
  const frames = core.deleteFrames("5", 5);
  assert.deepEqual(frames.at(-1).tree.keys, []);
  assert.deepEqual(frames.at(-1).tree.leaves.map(({ keys }) => keys), [[]]);
});

test("range scan follows leaves and returns the exact interval", () => {
  const frames = core.rangeFrames("2,5,8,11,14,17,20,23,26,29", 9, 23);
  assert.deepEqual(frames.at(-1).details.result, [11, 14, 17, 20, 23]);
  assert.equal(frames.filter(({ action }) => action === "scan-leaf").length, 3);
});

test("state is bounded, immutable and terminates", () => {
  let state = core.createState("insert", "5,10,15,20,25,30", 18);
  while (!state.finished) state = core.step(state);
  assert.equal(core.visualModel(state).exact, true);
  assert.equal(state.frameIndex, state.frames.length - 1);
  assert.throws(() => core.parseKeys("1,1"), /Повтор/);
});
