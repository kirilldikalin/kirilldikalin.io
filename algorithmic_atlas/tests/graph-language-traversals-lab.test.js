const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/graph-language-traversals-core.js");

function finalFrame(graph, algorithm, source) {
  return core.buildTrace(graph, { algorithm, source }).frames.at(-1);
}

test("empty graph terminates immediately and has 0 by 0 representations", () => {
  const graph = core.normalizeGraph({ directed: false, nodes: [], edges: [] });
  for (const algorithm of core.ALGORITHMS) {
    const state = core.createState(graph, { algorithm });
    assert.equal(state.playback.finished, true);
    assert.equal(state.playback.frames.length, 1);
    assert.equal(state.playback.current.componentCount, 0);
  }
  assert.deepEqual(core.adjacencyList(graph), []);
  assert.deepEqual(core.adjacencyMatrix(graph), { ids: [], values: [] });
});

test("one isolated vertex is one completed component in BFS and DFS", () => {
  const graph = core.normalizeGraph({ directed: false, nodes: [{ id: "only" }], edges: [] });
  for (const algorithm of core.ALGORITHMS) {
    const frame = finalFrame(graph, algorithm, "only");
    assert.equal(frame.finished, true);
    assert.equal(frame.componentCount, 1);
    assert.equal(frame.colors.only, "black");
    assert.equal(frame.distances.only, 0);
    assert.equal(frame.parents.only, null);
    assert.ok(frame.discover.only < frame.finish.only);
  }
});

test("BFS computes exact unweighted distances and a valid tree", () => {
  const graph = core.preset("connected");
  const frame = finalFrame(graph, "bfs", "A");
  assert.deepEqual({ ...frame.distances }, { A: 0, B: 1, C: 1, D: 2, E: 2, F: 3 });
  assert.equal(frame.treeEdges.length, graph.nodes.length - 1);
  for (const node of graph.nodes) {
    if (node.id === "A") continue;
    assert.notEqual(frame.parents[node.id], null);
    assert.equal(frame.distances[node.id], frame.distances[frame.parents[node.id]] + 1);
  }
  for (const edge of graph.edges) {
    assert.ok(Math.abs(frame.distances[edge.source] - frame.distances[edge.target]) <= 1);
  }
});

test("a disconnected traversal builds a forest without losing isolated vertices", () => {
  const graph = core.preset("disconnected");
  for (const algorithm of core.ALGORITHMS) {
    const frame = finalFrame(graph, algorithm, "A");
    assert.equal(frame.componentCount, 3);
    assert.equal(frame.order.length, graph.nodes.length);
    assert.ok(graph.nodes.every((node) => frame.colors[node.id] === "black"));
    assert.equal(frame.parents.A, null);
    assert.equal(frame.parents.D, null);
    assert.equal(frame.parents.G, null);
    assert.equal(frame.distances.G, 0);
  }
});

test("DFS timestamps form properly nested intervals on tree edges", () => {
  const graph = core.preset("directed");
  const frame = finalFrame(graph, "dfs", "A");
  assert.equal(new Set(Object.values(frame.discover)).size, graph.nodes.length);
  assert.equal(new Set(Object.values(frame.finish)).size, graph.nodes.length);
  for (const node of graph.nodes) {
    assert.ok(frame.discover[node.id] < frame.finish[node.id]);
    if (frame.parents[node.id] === null) continue;
    const parent = frame.parents[node.id];
    assert.ok(frame.discover[parent] < frame.discover[node.id]);
    assert.ok(frame.finish[node.id] < frame.finish[parent]);
  }
  assert.ok(Object.values(frame.edgeTypes).includes("back"));
  assert.ok(Object.values(frame.edgeTypes).includes("forward"));
  assert.ok(Object.values(frame.edgeTypes).includes("cross"));
});

test("loops and parallel edges are preserved and classified", () => {
  const graph = core.preset("multigraph");
  const matrix = core.adjacencyMatrix(graph);
  const a = matrix.ids.indexOf("A");
  const b = matrix.ids.indexOf("B");
  assert.equal(matrix.values[a][b], 2);
  assert.equal(matrix.values[b][a], 2);
  assert.equal(matrix.values[b][b], 1);
  const incidence = core.incidenceMatrix(graph);
  assert.equal(incidence.values[b][incidence.edgeIds.indexOf("e3")], 2);
  const frame = finalFrame(graph, "dfs", "A");
  assert.equal(frame.edgeTypes.e1, "tree");
  assert.equal(frame.edgeTypes.e2, "back");
  assert.equal(frame.edgeTypes.e3, "back");
  assert.equal(Object.keys(frame.edgeTypes).length, graph.edges.length);
});

test("directed adjacency matrix is asymmetric and keeps every arc", () => {
  const graph = core.preset("directed");
  const matrix = core.adjacencyMatrix(graph);
  const index = Object.fromEntries(matrix.ids.map((id, position) => [id, position]));
  assert.equal(matrix.values[index.A][index.B], 1);
  assert.equal(matrix.values[index.B][index.A], 0);
  assert.equal(matrix.values[index.D][index.B], 1);
  assert.equal(matrix.values[index.B][index.D], 1);
  assert.equal(core.adjacencyList(graph).flatMap((row) => row.neighbors).length, graph.edges.length);
});

test("graph edits really change representations and traversal", () => {
  let graph = core.normalizeGraph({ directed: false, nodes: [{ id: "A" }, { id: "B" }], edges: [] });
  graph = core.graphWithNode(graph, { id: "C", label: "C" });
  graph = core.graphWithEdge(graph, { id: "e1", source: "A", target: "B" });
  graph = core.graphWithEdge(graph, { id: "e2", source: "B", target: "C" });
  assert.equal(core.adjacencyMatrix(graph).values[0][1], 1);
  assert.equal(finalFrame(graph, "bfs", "A").distances.C, 2);
  graph = core.graphWithoutEdge(graph, "e2");
  assert.equal(finalFrame(graph, "bfs", "A").componentCount, 2);
  graph = core.graphWithoutNode(graph, "B");
  assert.deepEqual(graph.nodes.map((node) => node.id), ["A", "C"]);
  assert.equal(graph.edges.length, 0);
});

test("playback is bounded, immutable and deterministic", () => {
  const graph = core.preset("directed");
  const left = core.createState(graph, { algorithm: "dfs", source: "A" });
  const right = core.createState(graph, { algorithm: "dfs", source: "A" });
  assert.deepEqual(left, right);
  assert.ok(Object.isFrozen(left));
  let state = left;
  let steps = 0;
  while (!state.playback.finished) {
    const previous = state.playback.cursor;
    state = core.step(state);
    assert.equal(state.playback.cursor, previous + 1);
    steps += 1;
    assert.ok(steps < 320);
  }
  assert.equal(core.step(state), state);
});

test("representation complexity states the actual scan model", () => {
  const graph = core.preset("connected");
  assert.deepEqual(core.complexity(graph, "list"), {
    n: 6, m: 7, memory: "Θ(n + m)", traversal: "Θ(n + m)",
  });
  assert.deepEqual(core.complexity(graph, "matrix"), {
    n: 6, m: 7, memory: "Θ(n²)", traversal: "Θ(n²)",
  });
});

test("unsafe and inconsistent input is rejected without executable expressions", () => {
  assert.throws(() => core.normalizeGraph({ nodes: [], edges: [{ source: "A", target: "A" }] }), /Пустой/);
  assert.throws(() => core.normalizeGraph({ nodes: [{ id: "A" }, { id: "A" }], edges: [] }), /повторяется/);
  assert.throws(() => core.buildTrace(core.preset("connected"), { algorithm: "random" }), /bfs или dfs/);
  assert.throws(() => core.buildTrace(core.preset("connected"), { source: "Z" }), /отсутствует/);
  assert.throws(() => core.graphWithEdge(core.preset("connected"), { id: "bad", source: "A", target: "Z" }), /неизвестную/);
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/graph-language-traversals.js"), "utf8");
  assert.doesNotMatch(adapter, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/);
});
