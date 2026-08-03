"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/single-source-shortest-paths-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterSource = fs.readFileSync(
  path.join(atlasRoot, "labs/single-source-shortest-paths.js"),
  "utf8"
);
const chapterSource = fs.readFileSync(
  path.join(atlasRoot, "chapters/single-source-shortest-paths.html"),
  "utf8"
);

function finish(options) {
  return core.runToEnd(core.createState(options));
}

function referenceDistances(rawGraph, source) {
  const graph = core.normalizeGraph(rawGraph);
  const distances = Object.fromEntries(graph.nodes.map(({ id }) => [id, null]));
  distances[source] = 0n;
  const arcs = [];
  graph.edges.forEach((edge) => {
    arcs.push({ source: edge.source, target: edge.target, weight: BigInt(edge.weight) });
    if (!edge.directed && edge.source !== edge.target) {
      arcs.push({ source: edge.target, target: edge.source, weight: BigInt(edge.weight) });
    }
  });
  for (let pass = 1; pass < graph.nodes.length; pass += 1) {
    const previous = { ...distances };
    let changed = false;
    for (const arc of arcs) {
      if (previous[arc.source] === null) continue;
      const candidate = previous[arc.source] + arc.weight;
      if (distances[arc.target] === null || candidate < distances[arc.target]) {
        distances[arc.target] = candidate;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return Object.fromEntries(Object.entries(distances).map(([id, value]) => [
    id,
    value === null ? null : value.toString(),
  ]));
}

function generatedGraph(seed) {
  const nodes = Array.from({ length: 7 }, (_, index) => ({ id: "v" + index }));
  const edges = [];
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  for (let source = 0; source < nodes.length; source += 1) {
    for (let target = 0; target < nodes.length; target += 1) {
      if (source === target || next() % 5 > 1) continue;
      edges.push({
        id: "e" + edges.length,
        source: nodes[source].id,
        target: nodes[target].id,
        weight: String(next() % 23),
        directed: true,
      });
    }
  }
  return { directed: true, nodes, edges };
}

function assertNoUnsafeNumber(value) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    assert.ok(Number.isSafeInteger(value));
  } else if (Array.isArray(value)) {
    value.forEach(assertNoUnsafeNumber);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(assertNoUnsafeNumber);
  }
}

test("BFS accepts exactly unit weights and returns edge-count distances", () => {
  const state = finish({ mode: "bfs", preset: "unit" });
  assert.equal(state.accepted, true);
  assert.equal(state.current.phase, "finish");
  assert.deepEqual(state.current.distances, {
    s: "0", a: "1", b: "1", c: "2", d: "2", t: "3",
  });
  assert.deepEqual(core.reconstructPath(state, "t"), ["s", "a", "c", "t"]);

  const rejected = core.createState({ mode: "bfs", preset: "nonnegative" });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.current.phase, "reject");
  assert.match(rejected.reason, /весе 1/);
});

test("DAG mode handles negative edges once and rejects directed cycles", () => {
  const state = finish({ mode: "dag", preset: "dag" });
  assert.deepEqual(state.current.distances, {
    s: "0", a: "2", b: "-2", c: "0", t: "1", z: null,
  });
  assert.equal(state.frames.filter(({ phase }) => phase === "extract").length, 6);

  const cyclic = core.graphFromPreset("negativeCycle");
  const rejected = core.createState({ mode: "dag", graph: cyclic, source: "s" });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason, /цикл/);
});

test("Dijkstra matches an independent bounded-edge reference", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const graph = generatedGraph(seed);
    const actual = finish({ mode: "dijkstra", graph, source: "v0" });
    assert.equal(actual.accepted, true);
    assert.deepEqual(
      actual.current.distances,
      referenceDistances(graph, "v0"),
      "seed " + seed
    );
  }
});

test("lazy deletion leaves stale heap entries without corrupting a settled distance", () => {
  const state = finish({ mode: "dijkstra", preset: "nonnegative" });
  assert.equal(state.current.distances.a, "5");
  const stale = state.frames.filter(({ phase }) => phase === "stale");
  assert.ok(stale.length >= 1);
  assert.match(stale[0].message, /Устаревшая запись/);
});

test("Dijkstra rejects every negative edge instead of trusting a lucky example", () => {
  for (const preset of ["dag", "negativeEdge", "negativeCycle", "unreachable"]) {
    const state = core.createState({ mode: "dijkstra", preset });
    assert.equal(state.accepted, false, preset);
    assert.match(state.reason, /отрицательный вес/);
  }
});

test("Bellman–Ford exposes the exact k-edge invariant", () => {
  const state = core.createState({ mode: "bellman-ford", preset: "negativeEdge" });
  const passOne = state.frames.find(({ phase, iteration }) => phase === "pass-end" && iteration === 1);
  const passTwo = state.frames.find(({ phase, iteration }) => phase === "pass-end" && iteration === 2);
  assert.deepEqual(passOne.distances, { s: "0", a: "2", b: "5", t: null });
  assert.deepEqual(passTwo.distances, { s: "0", a: "-1", b: "5", t: "4" });
  const finished = core.runToEnd(state);
  assert.deepEqual(finished.current.distances, referenceDistances(finished.graph, "s"));
});

test("Bellman–Ford recovers a reachable negative cycle", () => {
  const state = finish({ mode: "bellman-ford", preset: "negativeCycle" });
  assert.equal(state.current.phase, "negative-cycle");
  assert.deepEqual(state.current.negativeCycle, ["c", "a", "b", "c"]);
  assert.deepEqual(new Set(state.current.negativeCycleEdgeIds), new Set(["e2", "e3", "e4"]));
  assert.equal(core.reconstructPath(state, "t"), null);
});

test("an unreachable negative cycle does not invalidate source distances", () => {
  const state = finish({ mode: "bellman-ford", preset: "unreachable" });
  assert.equal(state.current.phase, "finish");
  assert.deepEqual(state.current.distances, {
    s: "0", a: "4", t: "7", x: null, y: null,
  });
});

test("large integer weights stay exact and infinity remains a sentinel", () => {
  const graph = core.parseGraphText(
    "s, a, t, z",
    "s a 90071992547409931234567890; a t 11; s t 90071992547409931234567950",
    true
  );
  const state = finish({ mode: "dijkstra", graph, source: "s" });
  assert.equal(state.current.distances.t, "90071992547409931234567901");
  assert.equal(state.current.distances.z, null);
  assert.doesNotMatch(JSON.stringify(state.current.distances), /Infinity|NaN/);
  assertNoUnsafeNumber(state);
  assert.throws(() => core.parseWeight(Number.MAX_SAFE_INTEGER + 1), /строкой/);
});

test("empty, singleton, disconnected, parallel and loop edge cases are bounded", () => {
  const empty = core.createState({
    mode: "bellman-ford",
    graph: { directed: true, nodes: [], edges: [] },
    source: "",
  });
  assert.equal(empty.accepted, false);
  assert.match(empty.reason, /пуст/);

  const singleton = finish({
    mode: "dijkstra",
    graph: { directed: true, nodes: [{ id: "s" }], edges: [] },
    source: "s",
  });
  assert.deepEqual(singleton.current.distances, { s: "0" });

  const parallel = finish({
    mode: "dijkstra",
    graph: {
      directed: true,
      nodes: [{ id: "s" }, { id: "t" }, { id: "z" }],
      edges: [
        { id: "slow", source: "s", target: "t", weight: "9" },
        { id: "fast", source: "s", target: "t", weight: "2" },
        { id: "loop", source: "t", target: "t", weight: "0" },
      ],
    },
    source: "s",
  });
  assert.equal(parallel.current.distances.t, "2");
  assert.equal(parallel.current.distances.z, null);
});

test("editor parser is deterministic, strict and bounded", () => {
  const graph = core.parseGraphText("s, a, t", "s a 2; a t -5", true);
  assert.deepEqual(core.graphText(graph), {
    vertices: "s, a, t",
    edges: "s a 2; a t -5",
  });
  assert.throws(() => core.parseGraphText("s,a", "s a 1 extra", true), /формат/);
  assert.throws(() => core.parseGraphText("s", "s z 1", true), /неизвестную вершину/);
  assert.throws(() => core.parseWeight("1.5"), /целое число/);
  assert.throws(() => core.parseWeight("9".repeat(41)), /40 цифр/);
});

test("chapter and adapter reuse the shared full-width graph laboratory", () => {
  assert.match(chapterSource, /atlas-block--fullwidth/);
  assert.match(chapterSource, /data-atlas-lab="single-source-shortest-paths"/);
  assert.match(chapterSource, /graph-lab-core\.js/);
  assert.match(chapterSource, /graph-lab-runtime\.js/);
  assert.match(chapterSource, /graph-labs\.css/);
  assert.match(adapterSource, /AtlasGraphLabRuntime/);
  assert.match(adapterSource, /graphRuntime\.mount/);
  assert.match(adapterSource, /runtime\.mount/);
  assert.match(adapterSource, /maxAutomaticSteps:\s*4096/);
  assert.doesNotMatch(adapterSource, /\beval\s*\(|new Function/);
});

test("chapter covers all four modes, interactive formulas and twelve exercises", () => {
  for (const mode of ["bfs", "dag", "dijkstra", "bellman-ford"]) {
    assert.match(adapterSource, new RegExp('value="' + mode + '"'));
  }
  assert.equal((chapterSource.match(/data-formula-id=/g) || []).length, 10);
  assert.ok((chapterSource.match(/notation-id-(?:sssp|graph)-/g) || []).length >= 30);
  assert.equal((chapterSource.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1007\/BF01386390/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1090\/qam\/102435/);
  assert.match(chapterSource, /https:\/\/www\.rand\.org\/pubs\/papers\/P923\.html/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1145\/28869\.28874/);
});
