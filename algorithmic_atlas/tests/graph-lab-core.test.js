const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/graph-lab-core.js");

function sampleGraph(directed) {
  return {
    directed: directed,
    nodes: [
      { id: "a", label: "A", layer: 0 },
      { id: "b", label: "B", layer: 1 },
      { id: "c", label: "C", layer: 1 },
    ],
    edges: [
      { id: "ab", source: "a", target: "b", weight: 7 },
      { id: "ac", source: "a", target: "c", label: "x" },
    ],
  };
}

test("graph normalization is bounded, immutable and preserves direction", () => {
  const graph = core.normalizeGraph(sampleGraph(true));
  assert.equal(graph.directed, true);
  assert.deepEqual(graph.nodes.map(({ id }) => id), ["a", "b", "c"]);
  assert.equal(graph.edges[0].directed, true);
  assert.equal(graph.edges[0].weight, 7);
  assert.equal(graph.edges[1].label, "x");
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph.nodes[0]), true);

  assert.throws(
    () => core.normalizeGraph({ nodes: ["a", "a"], edges: [] }),
    /повторяется/
  );
  assert.throws(
    () => core.normalizeGraph({ nodes: ["a"], edges: [{ source: "a", target: "z" }] }),
    /неизвестную вершину/
  );
  assert.throws(
    () => core.normalizeGraph({ nodes: Array(core.MAX_NODES + 1).fill(0).map((_, index) => index), edges: [] }),
    /от 0 до/
  );
  assert.throws(
    () => core.normalizeGraph({ nodes: ["a", "b"], edges: [{ source: "a", target: "b", weight: Infinity }] }),
    /конечное число/
  );
});

test("empty graph is a valid immutable graph with empty adjacency", () => {
  const graph = core.normalizeGraph({ directed: false, nodes: [], edges: [] });
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  assert.equal(Object.isFrozen(graph), true);
  assert.deepEqual(Object.keys(core.buildAdjacency(graph)), []);
  assert.throws(
    () => core.normalizeGraph({ nodes: [], edges: [{ source: "a", target: "b" }] }),
    /неизвестную вершину/
  );
});

test("edge keys distinguish direction and canonicalize undirected endpoints", () => {
  assert.equal(core.edgeKey("a", "b", false), core.edgeKey("b", "a", false));
  assert.notEqual(core.edgeKey("a", "b", true), core.edgeKey("b", "a", true));
  assert.notEqual(core.edgeKey("a", "b", false), core.edgeKey("a", "b", true));
});

test("adjacency exposes directed in, out and all views", () => {
  const graph = sampleGraph(true);
  const outgoing = core.buildAdjacency(graph, "out");
  const incoming = core.buildAdjacency(graph, "in");
  const all = core.buildAdjacency(graph, "all");
  assert.deepEqual(outgoing.a.map(({ nodeId }) => nodeId), ["b", "c"]);
  assert.deepEqual(outgoing.b, []);
  assert.deepEqual(incoming.b.map(({ nodeId }) => nodeId), ["a"]);
  assert.deepEqual(all.a.map(({ relation }) => relation), ["out", "out"]);
  assert.deepEqual(all.b.map(({ relation }) => relation), ["in"]);

  const undirected = core.buildAdjacency(sampleGraph(false), "out");
  assert.deepEqual(undirected.b.map(({ nodeId }) => nodeId), ["a"]);
  assert.equal(undirected.b[0].relation, "undirected");
  assert.throws(() => core.buildAdjacency(graph, "sideways"), /all, out или in/);
});

test("seeded random generator is deterministic and stays in bounds", () => {
  const first = core.createSeededRandom("atlas-graphs");
  const second = core.createSeededRandom("atlas-graphs");
  const firstValues = Array.from({ length: 12 }, () => first.next());
  const secondValues = Array.from({ length: 12 }, () => second.next());
  assert.deepEqual(firstValues, secondValues);
  assert.ok(firstValues.every((value) => value >= 0 && value < 1));

  const integersA = core.createSeededRandom(20260803);
  const integersB = core.createSeededRandom(20260803);
  assert.deepEqual(
    Array.from({ length: 20 }, () => integersA.integer(-3, 5)),
    Array.from({ length: 20 }, () => integersB.integer(-3, 5))
  );
  assert.deepEqual(
    core.createSeededRandom(9).shuffle([1, 2, 3, 4, 5]),
    core.createSeededRandom(9).shuffle([1, 2, 3, 4, 5])
  );
  assert.throws(() => core.createSeededRandom(Number.MAX_VALUE), /безопасным целым/);
});

test("disjoint set uses deterministic union by rank and reports components", () => {
  const sets = new core.DisjointSet(["a", "b", "c", "d"]);
  assert.equal(sets.componentCount(), 4);
  assert.equal(sets.union("a", "b"), true);
  assert.equal(sets.union("c", "d"), true);
  assert.equal(sets.union("b", "d"), true);
  assert.equal(sets.union("a", "c"), false);
  assert.equal(sets.connected("a", "d"), true);
  assert.equal(sets.componentSize("b"), 4);
  assert.equal(sets.componentCount(), 1);
  assert.deepEqual(sets.groups(), [["a", "b", "c", "d"]]);
  const snapshot = sets.snapshot();
  assert.equal(snapshot.entries.every(({ root }) => root === "a"), true);
  assert.equal(Object.isFrozen(snapshot.entries), true);
  assert.throws(() => sets.find("missing"), /Неизвестный/);
  assert.throws(() => new core.DisjointSet(["x", "x"]), /повторяется/);
});

test("finite playback is compatible with the shared runtime step contract", () => {
  const input = [
    { phase: "start", values: [1, 2] },
    { phase: "middle", values: [2, 3] },
    { phase: "done", values: [3, 5] },
  ];
  let state = core.createPlayback(input);
  input[0].phase = "changed outside";
  assert.equal(state.current.phase, "start");
  assert.equal(state.finished, false);
  state = core.playbackStep(state);
  assert.equal(state.cursor, 1);
  state = core.playbackStep(state);
  assert.equal(core.playbackIsFinished(state), true);
  assert.equal(core.playbackStep(state), state);
  assert.equal(core.playbackReset(state).cursor, 0);
  assert.equal(core.playbackSeek(state, 1).current.phase, "middle");
  assert.throws(() => core.createPlayback([]), /от 1 до/);
  assert.throws(() => core.createPlayback([{ value: Infinity }]), /бесконечное/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => core.createPlayback([cyclic]), /циклические/);
});

test("bounded input helpers reject unsafe and oversized values", () => {
  assert.equal(core.boundedInteger("7", "n", 1, 10), 7);
  assert.equal(core.boundedNumber("0.25", "p", 0, 1), 0.25);
  assert.equal(core.boundedString("  вершина  ", "label", 20, false), "вершина");
  assert.throws(() => core.boundedInteger(2.5, "n", 1, 10), /целое число/);
  assert.throws(() => core.boundedNumber(NaN, "p", 0, 1), /конечное число/);
  assert.throws(() => core.boundedString("", "label", 20, false), /от 1 до/);
});
