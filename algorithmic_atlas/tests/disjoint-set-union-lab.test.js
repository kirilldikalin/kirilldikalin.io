const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/disjoint-set-union-core.js");

test("forest validation rejects cycles and bad parents", () => {
  assert.deepEqual(core.normalizeParent([0, 0, 1]), [0, 0, 1]);
  assert.throws(() => core.normalizeParent([1, 0]), /цикл/);
  assert.throws(() => core.normalizeParent([0, 3]), /от 0 до 1/);
});

test("all FIND variants preserve representatives and shorten a chain", () => {
  const parent = core.makeForest("chain", 16);
  const beforeDepth = core.depthOf(parent, 15);
  for (const method of core.FIND_METHODS) {
    const frames = core.traceFind(parent, 15, method);
    const last = frames.at(-1);
    assert.equal(last.finished, true);
    assert.equal(last.root, 0);
    assert.equal(core.samePartition(parent, last.parent), true);
    assert.ok(core.depthOf(last.parent, 15) < beforeDepth);
    assert.ok(last.reads > 0);
    assert.ok(last.writes > 0);
  }
});

test("full path compression makes every visited non-root point to the root", () => {
  const parent = core.makeForest("chain", 12);
  const frames = core.traceFind(parent, 11, "compression");
  const last = frames.at(-1);
  for (let node = 1; node < parent.length; node += 1) assert.equal(last.parent[node], 0);
  assert.equal(last.writes, 10);
});

test("splitting and halving expose different but valid frame sequences", () => {
  const parent = core.makeForest("chain", 15);
  const splitting = core.traceFind(parent, 14, "splitting");
  const halving = core.traceFind(parent, 14, "halving");
  assert.ok(splitting.length > halving.length);
  assert.equal(splitting.some(({ phase }) => phase === "split"), true);
  assert.equal(halving.some(({ phase }) => phase === "halve"), true);
  assert.equal(core.rootOf(splitting.at(-1).parent, 14), 0);
  assert.equal(core.rootOf(halving.at(-1).parent, 14), 0);
});

test("union by rank and by size link roots without mixing partitions incorrectly", () => {
  for (const policy of ["rank", "size"]) {
    const frames = core.traceUnion(policy, 13);
    const first = frames[0].parent;
    const last = frames.at(-1);
    assert.equal(new Set(core.representatives(first)).size, 2);
    assert.equal(new Set(core.representatives(last.parent)).size, 1);
    assert.equal(last.size[last.root], 13);
    assert.equal(last.finished, true);
    const state = core.createUnionState({ policy, size: 13 });
    assert.equal(core.visualModel(state).semanticsValid, true);
    assert.equal(core.visualModel(core.step(core.step(state))).semanticsValid, true);
  }
});

test("rank metadata is feasible for every UNION laboratory size", () => {
  for (let count = 4; count <= core.MAX_ITEMS; count += 1) {
    const frames = core.traceUnion("rank", count);
    for (const frame of [frames[0], frames.at(-1)]) {
      frame.parent.forEach((parent, node) => {
        if (parent !== node) return;
        assert.ok(frame.rank[node] <= Math.floor(Math.log2(frame.size[node])));
      });
    }
  }
});

test("FIND frames preserve historical rank and size metadata", () => {
  const state = core.createFindState({ method: "compression", shape: "chain", size: 12 });
  const first = state.frames[0];
  const last = state.frames.at(-1);
  assert.deepEqual(last.rank, first.rank);
  assert.deepEqual(last.size, first.size);
  assert.equal(core.visualModel(state).semanticsValid, true);
});

test("shared runtime stepping terminates FIND and UNION scenarios", () => {
  for (const setup of [
    ["find", { method: "compression", shape: "chain", size: 20 }],
    ["find", { method: "splitting", shape: "balanced", size: 20 }],
    ["find", { method: "halving", shape: "chain", size: 20 }],
    ["union", { policy: "rank", size: 20 }],
    ["union", { policy: "size", size: 20 }],
  ]) {
    let state = core.createState(setup[0], setup[1]);
    let guard = 0;
    while (!state.finished) {
      state = core.step(state);
      guard += 1;
      assert.ok(guard < 100);
    }
    assert.equal(state.cursor, state.frames.length - 1);
  }
});

test("the practical inverse-Ackermann scale stays tiny on safe integers", () => {
  assert.equal(core.practicalInverseAckermannLevel(1), 0);
  assert.equal(core.practicalInverseAckermannLevel(4), 2);
  assert.equal(core.practicalInverseAckermannLevel(65536), 3);
  assert.equal(core.practicalInverseAckermannLevel(Number.MAX_SAFE_INTEGER), 4);
  assert.throws(() => core.practicalInverseAckermannLevel(0), /от 1/);
});
