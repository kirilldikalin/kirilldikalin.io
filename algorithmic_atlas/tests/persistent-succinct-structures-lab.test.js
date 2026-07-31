const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/persistent-succinct-structures-core.js");

function run(initial) {
  let state = initial;
  let guard = 0;
  while (!state.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard < 300, "trace must terminate");
  }
  return state;
}

test("path copying preserves every base version and permits branching", () => {
  const trace = core.buildPersistentTrace(
    [1, 2, 3, 4, 5, 6, 7, 8],
    [{ base: 0, index: 2, value: 30 }, { base: 1, index: 6, value: 70 }, { base: 0, index: 0, value: 10 }]
  );
  const final = trace.frames.at(-1);
  assert.deepEqual(core.materialize(final.nodes, final.versions[0].rootId), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(core.materialize(final.nodes, final.versions[1].rootId), [1, 2, 30, 4, 5, 6, 7, 8]);
  assert.deepEqual(core.materialize(final.nodes, final.versions[2].rootId), [1, 2, 30, 4, 5, 6, 70, 8]);
  assert.deepEqual(core.materialize(final.nodes, final.versions[3].rootId), [10, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(final.versions[3].parentId, "v0");
});

test("one changed leaf copies exactly one root path and shares the rest", () => {
  const trace = core.buildPersistentTrace([0, 1, 2, 3, 4, 5, 6, 7], [{ base: 0, index: 5, value: 99 }]);
  const final = trace.frames.at(-1);
  assert.equal(final.copiedIds.length, 4, "leaf plus three ancestors for eight values");
  assert.ok(final.sharedIds.length >= 7);
  const oldReachable = new Set(core.reachableIds(final.nodes, final.versions[0].rootId));
  const newReachable = new Set(core.reachableIds(final.nodes, final.versions[1].rootId));
  const intersection = [...oldReachable].filter((id) => newReachable.has(id));
  assert.equal(intersection.length, 11);
});

test("rank directory and direct rank agree at every boundary", () => {
  const bits = "10110100101101011100";
  const index = core.buildRankIndex(bits);
  for (let position = 0; position <= bits.length; position += 1) {
    const final = run(core.createState("bitvector", { bitString: bits, operation: "rank", target: position }));
    assert.equal(final.frame.result, core.rank1(bits, position));
    assert.equal(final.frame.result, index.prefix[position]);
  }
});

test("select returns every one position and trace never claims a sample is a proof", () => {
  const bits = "0010110100101011";
  const onePositions = [...bits].map((bit, index) => bit === "1" ? index : null).filter((value) => value !== null);
  onePositions.forEach((position, index) => {
    const rank = index + 1;
    const final = run(core.createState("bitvector", { bitString: bits, operation: "select", target: rank }));
    assert.equal(final.frame.result, position);
    assert.equal(core.select1(bits, rank), position);
  });
});

test("visual models expose a bounded version DAG and two-level bit index", () => {
  const persistent = run(core.createState("persistent", {
    values: [1, 2, 3, 4],
    updates: [{ base: 0, index: 1, value: 8 }, { base: 0, index: 3, value: 9 }],
  }));
  const versionModel = core.visualModel(persistent);
  assert.equal(versionModel.versions.length, 3);
  assert.equal(versionModel.versionEdges.length, 2);
  assert.ok(versionModel.nodes.every((node) => node.xShare >= 0 && node.xShare <= 1));

  const bitModel = core.visualModel(core.createState("bitvector", { bitString: "101101001", operation: "rank", target: 7 }));
  assert.equal(bitModel.bits.length, 9);
  assert.ok(bitModel.superRanks.length >= 2);
  assert.ok(bitModel.blockRanks.length >= 3);
});

test("malformed versions, targets and oversized inputs fail closed", () => {
  assert.throws(() => core.createState("persistent", { values: [1, 2, 3] }), /степенью двойки/);
  assert.throws(() => core.createState("persistent", { values: [1, 2], updates: [{ base: 1, index: 0, value: 3 }] }), /base version/);
  assert.throws(() => core.createState("bitvector", { bitString: "10120" }), /нулей и единиц/);
  assert.throws(() => core.createState("bitvector", { bitString: "000", operation: "select", target: 1 }), /select rank/);
  assert.throws(() => core.createState("bitvector", { bitString: "1".repeat(65) }), /64/);
});
