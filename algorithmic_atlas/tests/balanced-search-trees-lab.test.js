const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/balanced-search-trees-core.js");

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

test("AVL traces cover single and double rotations and end with a valid balance invariant", () => {
  const trace = core.buildAVLTrace([30, 10, 20, 40, 50]);
  const mirrored = core.buildAVLTrace([10, 30, 20]);
  assert.ok(trace.frames.some((frame) => /LR/.test(frame.event)));
  assert.ok(mirrored.frames.some((frame) => /RL/.test(frame.event)));
  const final = trace.frames.at(-1);
  assert.equal(core.validateAVL(final.nodes, final.rootId).valid, true);
  assert.deepEqual(Object.values(final.nodes).map((node) => node.key).sort((a, b) => a - b), [10, 20, 30, 40, 50]);
});

test("red-black insertion preserves ordering, red-parent and black-height invariants", () => {
  const keys = [41, 38, 31, 12, 19, 8, 55, 60, 57, 1, 7];
  const finalState = run(core.createState("red-black", keys));
  const validation = core.validateRedBlack(finalState.frame.nodes, finalState.frame.rootId);
  assert.equal(validation.valid, true);
  assert.ok(validation.height <= 2 * Math.log2(keys.length + 1) + 1e-12);
  assert.ok(finalState.trace.frames.some((frame) => /дядя|вращением/.test(frame.event)));
});

test("visual models expose paths, heights, colors and bounded coordinates", () => {
  let state = core.createState("avl", [10, 20, 30, 25]);
  state = core.step(state);
  const model = core.visualModel(state);
  assert.ok(model.nodes.every((node) => node.xShare > 0 && node.xShare < 1));
  assert.ok(model.nodes.every((node) => Number.isInteger(node.height)));
  assert.ok(model.nodes.some((node) => node.onPath));
});

test("duplicates, oversized sequences and invalid keys fail closed", () => {
  assert.throws(() => core.createState("avl", [1, 1]), /повторяющиеся/);
  assert.throws(() => core.createState("red-black", Array.from({ length: 19 }, (_, index) => index)), /18/);
  assert.throws(() => core.createState("avl", [1000]), /от -999/);
});
