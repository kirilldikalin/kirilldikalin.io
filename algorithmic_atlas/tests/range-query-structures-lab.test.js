const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/range-query-structures-core.js");

test("lowbit identifies the represented Fenwick block", () => {
  assert.equal(core.lowbit(1), 1);
  assert.equal(core.lowbit(6), 2);
  assert.equal(core.lowbit(8), 8);
});

test("Fenwick decomposition gives exact inclusive range sums", () => {
  const scenario = core.fenwickFrames("3,1,4,1,5,9,2,6", 3, 7);
  assert.equal(scenario.frames.at(-1).total, 21);
  assert.deepEqual(scenario.bit, [0, 3, 4, 4, 9, 5, 14, 2, 31]);
  assert.ok(scenario.frames.at(-2).selected.length > 1);
  assert.ok(scenario.frames.slice(1, -1).length <= 2 * Math.ceil(Math.log2(scenario.values.length + 1)));
});

test("segment query uses disjoint covering nodes", () => {
  const scenario = core.segmentQueryFrames("3,1,4,1,5,9,2,6", 2, 7);
  assert.equal(scenario.frames.at(-1).total, 21);
  const taken = scenario.frames.filter(({ action }) => action === "take");
  assert.ok(taken.length > 0);
  assert.equal(taken.reduce((sum, frame) => sum + frame.contribution, 0), 21);
});

test("lazy range update changes root sum without visiting every leaf", () => {
  const scenario = core.lazyUpdateFrames("1,2,3,4,5,6,7,8", 2, 7, 10);
  const finalNodes = scenario.frames.at(-1).nodes;
  assert.equal(finalNodes[1].sum, 86);
  assert.ok(scenario.frames.some(({ action }) => action === "mark"));
  assert.ok(scenario.frames.length < 2 * scenario.values.length + 8);
});

test("all modes terminate and reject unsafe geometry", () => {
  for (const mode of ["fenwick", "segment", "lazy"]) {
    let state = core.createState(mode, "1,2,3,4", mode === "fenwick" ? 1 : 0, 4, 2);
    while (!state.finished) state = core.step(state);
    assert.equal(core.visualModel(state).exact, true);
  }
  assert.throws(() => core.parseArray(Array.from({ length: 17 }, (_, index) => index).join(",")), /16/);
});
