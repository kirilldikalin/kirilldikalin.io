const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/dag-topological-scc-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterSource = fs.readFileSync(
  path.join(atlasRoot, "labs/dag-topological-scc.js"),
  "utf8"
);
const pageSource = fs.readFileSync(
  path.join(atlasRoot, "chapters/dag-topological-scc.html"),
  "utf8"
);

function graph(text) {
  return core.parseEdgeList(text);
}

function normalizedComponents(components) {
  return components
    .map((component) => component.slice().sort().join(""))
    .sort();
}

test("edge-list parser is deterministic, keeps isolated nodes and rejects unsafe input", () => {
  const parsed = graph("B>C, A>B, Z, A>B");
  assert.deepEqual(parsed.nodes.map(({ id }) => id), ["A", "B", "C", "Z"]);
  assert.deepEqual(parsed.edges.map(({ source, target }) => [source, target]), [
    ["B", "C"],
    ["A", "B"],
  ]);
  assert.equal(core.edgeText(parsed), "B>C, A>B, Z");
  assert.throws(() => graph(""), /хотя бы одну/);
  assert.throws(() => graph("A B>C"), /Имя вершины/);
  assert.throws(() => graph("A>"), /Имя вершины/);
  assert.throws(
    () => graph(Array.from({ length: 25 }, (_, index) => "v" + index).join(",")),
    /не больше 24/
  );
});

test("Kahn trace exposes the zero-indegree queue and a unique order", () => {
  const result = core.kahnTrace(graph(core.PRESETS.uniqueDag.edgeList));
  assert.equal(result.hasCycle, false);
  assert.equal(result.unique, true);
  assert.deepEqual(result.order, ["A", "B", "C", "D", "E"]);
  assert.equal(core.isTopologicalOrder(result.graph, result.order), true);
  assert.deepEqual(result.frames[0].queue, ["A"]);
  assert.deepEqual(result.frames[0].indegree, { A: 0, B: 1, C: 2, D: 2, E: 1 });
  assert.ok(result.frames.some(({ phase, activeEdge }) =>
    phase === "remove-edge" && activeEdge === "e1"
  ));
  assert.equal(result.frames.at(-1).phase, "done");
  assert.equal(Object.isFrozen(result.frames[0].queue), true);
});

test("Kahn distinguishes ambiguity from a cycle", () => {
  const ambiguous = core.kahnTrace(graph(core.PRESETS.ambiguousDag.edgeList));
  assert.equal(ambiguous.hasCycle, false);
  assert.equal(ambiguous.unique, false);
  assert.equal(core.isTopologicalOrder(ambiguous.graph, ambiguous.order), true);
  assert.ok(ambiguous.frames.some(({ queue }) => queue.length > 1));

  const cyclic = core.kahnTrace(graph(core.PRESETS.cycle.edgeList));
  assert.equal(cyclic.hasCycle, true);
  assert.equal(cyclic.unique, false);
  assert.deepEqual(cyclic.order, []);
  assert.deepEqual(cyclic.residualNodes, ["A", "B", "C", "D"]);
  assert.equal(cyclic.frames.at(-1).phase, "cycle");
});

test("DFS topological order agrees with edge directions and detects a back edge", () => {
  const dag = graph("A>B, A>C, B>D, C>D, D>E");
  const result = core.dfsTopologicalTrace(dag);
  assert.equal(result.hasCycle, false);
  assert.equal(core.isTopologicalOrder(dag, result.order), true);
  assert.deepEqual(result.finish.slice().reverse(), result.order);

  const cyclic = core.dfsTopologicalTrace(graph("A>B, B>C, C>A"));
  assert.equal(cyclic.hasCycle, true);
  assert.equal(cyclic.order.length, 0);
  assert.ok(cyclic.cycleEdge);
  assert.ok(cyclic.frames.some(({ phase }) => phase === "cycle"));

  const nested = core.dfsTopologicalTrace(graph("A>C, C>B"));
  const deepest = nested.frames.find(({ phase, activeNode }) =>
    phase === "discover" && activeNode === "B"
  );
  assert.deepEqual(deepest.stack, ["A", "C", "B"]);
});

test("topological order validation rejects duplicates, omissions and wrong orientation", () => {
  const dag = graph("A>B, B>C");
  assert.equal(core.isTopologicalOrder(dag, ["A", "B", "C"]), true);
  assert.equal(core.isTopologicalOrder(dag, ["B", "A", "C"]), false);
  assert.equal(core.isTopologicalOrder(dag, ["A", "A", "C"]), false);
  assert.equal(core.isTopologicalOrder(dag, ["A", "B"]), false);
});

test("Kosaraju-Sharir and Tarjan compute the same SCC partition", () => {
  const input = graph(core.PRESETS.scc.edgeList);
  const kosaraju = core.kosarajuTrace(input);
  const tarjan = core.tarjanTrace(input);
  const expected = ["ABC", "DE", "FG", "H"];
  assert.deepEqual(normalizedComponents(kosaraju.components), expected);
  assert.deepEqual(normalizedComponents(tarjan.components), expected);
  assert.equal(core.samePartition(kosaraju.components, tarjan.components), true);
  assert.equal(core.kahnTrace(kosaraju.condensation).hasCycle, false);
  assert.equal(core.kahnTrace(tarjan.condensation).hasCycle, false);
});

test("Kosaraju trace contains both passes, transposition and component boundaries", () => {
  const result = core.kosarajuTrace(graph("A>B, B>A, B>C"));
  const phases = result.frames.map(({ phase }) => phase);
  assert.ok(phases.includes("first-discover"));
  assert.ok(phases.includes("first-finish"));
  assert.ok(phases.includes("first-edge"));
  assert.ok(phases.includes("transpose"));
  assert.ok(phases.includes("second-discover"));
  assert.ok(phases.includes("second-edge"));
  assert.equal(phases.filter((phase) => phase === "component").length, 2);
  assert.equal(phases.at(-1), "done");
  assert.deepEqual(
    result.transpose.edges.map(({ source, target }) => source + ">" + target),
    ["B>A", "A>B", "C>B"]
  );
});

test("Tarjan trace synchronizes index, low-link and active stack", () => {
  const result = core.tarjanTrace(graph("A>B, B>C, C>A, C>D"));
  const discoverA = result.frames.find(({ phase, activeNode }) =>
    phase === "discover" && activeNode === "A"
  );
  assert.equal(discoverA.indices.A, 0);
  assert.equal(discoverA.lowlink.A, 0);
  assert.deepEqual(discoverA.stack, ["A"]);
  const back = result.frames.find(({ phase }) => phase === "back-edge");
  assert.equal(back.lowlink.C, 0);
  assert.ok(result.frames.some(({ phase, components }) =>
    phase === "component" && normalizedComponents(components).includes("ABC")
  ));
  assert.deepEqual(result.frames.at(-1).stack, []);
});

test("self-loops are cycles and singleton SCCs", () => {
  const input = graph("A>A, A>B");
  assert.equal(core.kahnTrace(input).hasCycle, true);
  assert.equal(core.dfsTopologicalTrace(input).hasCycle, true);
  assert.deepEqual(normalizedComponents(core.tarjanTrace(input).components), ["A", "B"]);
});

test("condensation removes internal and parallel edges while preserving reachability direction", () => {
  const input = graph("A>B, B>A, A>C, B>C, C>D, D>C, D>E");
  const condensation = core.condensationGraph(input, [["A", "B"], ["C", "D"], ["E"]]);
  assert.deepEqual(condensation.nodes.map(({ label }) => label), ["{A,B}", "{C,D}", "{E}"]);
  assert.deepEqual(
    condensation.edges.map(({ source, target }) => [source, target]),
    [["C1", "C2"], ["C2", "C3"]]
  );
  assert.equal(core.kahnTrace(condensation).hasCycle, false);
  assert.throws(() => core.condensationGraph(input, [["A"], ["B"]]), /покрывать все/);
});

test("buildRun selects a bounded deterministic playback for every laboratory mode", () => {
  const input = graph("A>B, B>C, C>A, C>D");
  const tarjanA = core.buildRun(input, "scc", "tarjan");
  const tarjanB = core.buildRun(input, "scc", "tarjan");
  assert.deepEqual(tarjanA, tarjanB);
  assert.equal(tarjanA.playback.cursor, 0);
  assert.ok(tarjanA.playback.frames.length < 4096);
  assert.equal(core.buildRun(graph("A>B"), "topological", "kahn").algorithm, "kahn");
  assert.equal(core.buildRun(graph("A>B"), "topological", "dfs").algorithm, "dfs");
  assert.equal(core.buildRun(input, "scc", "kosaraju").algorithm, "kosaraju");
  assert.throws(() => core.buildRun(input, "topological", "tarjan"), /Kahn или DFS/);
  assert.throws(() => core.buildRun(input, "other", "kahn"), /Режим/);
});

test("single isolated vertex is a valid unique DAG and one SCC", () => {
  const input = graph("A");
  const kahn = core.kahnTrace(input);
  assert.deepEqual(kahn.order, ["A"]);
  assert.equal(kahn.unique, true);
  assert.deepEqual(core.tarjanTrace(input).components, [["A"]]);
  assert.deepEqual(core.kosarajuTrace(input).components, [["A"]]);
});

test("DOM adapter reuses the shared graph and transport runtimes without unsafe evaluation", () => {
  assert.match(adapterSource, /AtlasGraphLabRuntime/);
  assert.match(adapterSource, /AtlasGraphLabCore/);
  assert.match(adapterSource, /AtlasLabRuntime/);
  assert.match(adapterSource, /const slug = "dag-topological-scc"/);
  for (const algorithm of ["kahn", "dfs", "tarjan", "kosaraju"]) {
    assert.match(adapterSource, new RegExp('value: "' + algorithm + '"'));
  }
  assert.match(adapterSource, /requestSubmit/);
  assert.match(adapterSource, /playbackStep/);
  assert.doesNotMatch(adapterSource, /\beval\s*\(/);
  assert.doesNotMatch(adapterSource, /\bFunction\s*\(/);
  assert.doesNotMatch(adapterSource, /innerHTML\s*=/);
});

test("chapter publishes the canonical 5.2 material and required primary sources", () => {
  assert.match(pageSource, /data-atlas-node-id="dag-topological-scc"/);
  assert.match(pageSource, /data-atlas-block="proof"/);
  assert.match(pageSource, /data-atlas-block="lab"/);
  assert.match(pageSource, /data-atlas-block="exercises"/);
  assert.match(pageSource, /graph-lab-core\.js/);
  assert.match(pageSource, /graph-lab-runtime\.js/);
  assert.match(pageSource, /graph-labs\.css/);
  assert.match(pageSource, /10\.1145\/368996\.369025/);
  assert.match(pageSource, /10\.1137\/0201010/);
  assert.match(pageSource, /10\.1016\/0898-1221\(81\)90008-0/);
  assert.match(pageSource, /идея Косарайю осталась неопубликованной/);
  assert.ok((pageSource.match(/class="atlas-exercise"/g) || []).length >= 10);
  assert.ok((pageSource.match(/notation-id-(?:dag|scc|graph)-/g) || []).length >= 10);
});
