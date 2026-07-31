const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/priority-queues-heaps-core.js");

test("array indices encode the complete binary tree", () => {
  assert.equal(core.parentIndex(0), null);
  assert.equal(core.parentIndex(1), 0);
  assert.equal(core.parentIndex(6), 2);
  assert.equal(core.leftIndex(3), 7);
  assert.equal(core.rightIndex(3), 8);
});

test("bottom-up build produces a min-heap and its height sum is linear", () => {
  for (let length = 1; length <= 256; length += 1) {
    const values = Array.from({ length }, function (_, index) { return length - index; });
    const frames = core.buildHeapFrames(values.slice(0, core.MAX_ITEMS));
    assert.equal(core.isMinHeap(frames.at(-1).heap), true);
    assert.ok(core.bottomUpHeightSum(length) < length);
  }
});

test("insert follows a root path and preserves every existing key", () => {
  const before = [2, 5, 4, 11, 9, 8, 7];
  const frames = core.insertFrames(before, 1);
  const after = frames.at(-1).heap;
  assert.equal(core.isMinHeap(after), true);
  assert.deepEqual(after.slice().sort((a, b) => a - b), before.concat(1).sort((a, b) => a - b));
  assert.equal(after[0], 1);
  assert.ok(frames.some(({ phase }) => phase === "swap"));
});

test("extract-min returns the minimum and repairs the heap", () => {
  const before = [2, 5, 4, 11, 9, 8, 7, 18, 14];
  const frames = core.extractMinFrames(before);
  const last = frames.at(-1);
  assert.equal(last.extracted, 2);
  assert.equal(core.isMinHeap(last.heap), true);
  assert.deepEqual(last.heap.slice().sort((a, b) => a - b), before.slice(1).sort((a, b) => a - b));
});

test("Fibonacci-heap frames keep the potential identity exact", () => {
  for (const operation of ["insert", "decrease", "extract"]) {
    const frames = core.fibonacciFrames(operation, 5);
    const initialPotential = frames[0].potential;
    for (const frame of frames) {
      assert.equal(frame.potential, frame.roots + 2 * frame.marked);
      assert.equal(frame.deltaPotential, frame.potential - initialPotential);
      assert.equal(frame.amortized, frame.actual + frame.deltaPotential);
    }
    assert.equal(frames.at(-1).finished, true);
  }
  assert.equal(core.fibonacciFrames("decrease", 7).at(-1).amortized, 5);
});

test("both modes terminate through the shared step contract", () => {
  for (const setup of [
    ["binary", "insert", { value: 1 }],
    ["binary", "extract", {}],
    ["binary", "build", { values: [9, 4, 8, 1, 7, 3, 2] }],
    ["fibonacci", "decrease", { cuts: 6 }],
  ]) {
    let state = core.createState(setup[0], setup[1], setup[2]);
    let guard = 0;
    while (!state.finished) {
      state = core.step(state);
      guard += 1;
      assert.ok(guard < 100);
    }
    assert.equal(state.cursor, state.frames.length - 1);
  }
});

test("invalid heaps and laboratory limits fail closed", () => {
  assert.throws(() => core.insertFrames([4, 1, 3], 2), /min-heap/);
  assert.throws(() => core.buildHeapFrames([]), /от 1/);
  assert.throws(() => core.fibonacciFrames("decrease", 9), /от 1 до 8/);
});
