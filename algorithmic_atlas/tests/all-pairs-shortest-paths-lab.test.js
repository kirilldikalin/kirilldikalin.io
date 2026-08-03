"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/all-pairs-shortest-paths-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterPath = path.join(atlasRoot, "labs/all-pairs-shortest-paths.js");
const chapterPath = path.join(atlasRoot, "chapters/all-pairs-shortest-paths.html");

function pathWeight(graph, pathIds) {
  if (pathIds.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < pathIds.length; index += 1) {
    const candidates = core.arcs(graph).filter((edge) =>
      edge.source === pathIds[index - 1] && edge.target === pathIds[index]
    );
    assert.ok(candidates.length, "each reconstructed hop must be an edge");
    total += Math.min(...candidates.map((edge) => edge.weight));
  }
  return total;
}

test("Floyd–Warshall computes the classic matrix and reconstructs paths", () => {
  const graph = core.preset("classic");
  const trace = core.buildFloydWarshall(graph);
  assert.deepEqual(trace.distance, [
    [0, 1, -3, 2, -4],
    [3, 0, -4, 1, -1],
    [7, 4, 0, 5, 3],
    [2, -1, -5, 0, -2],
    [8, 5, 1, 6, 0],
  ]);
  const path = core.reconstructPath(trace, "A", "C");
  assert.equal(path.status, "ok");
  assert.deepEqual(path.path, ["A", "E", "D", "C"]);
  assert.equal(pathWeight(graph, path.path), path.distance);
});

test("every Floyd layer obeys the D^(k) recurrence from the previous layer", () => {
  const trace = core.buildFloydWarshall(core.preset("classic"));
  for (let frameIndex = 1; frameIndex < trace.frames.length; frameIndex += 1) {
    const previous = trace.frames[frameIndex - 1].distance;
    const current = trace.frames[frameIndex];
    const k = current.k;
    for (let i = 0; i < trace.ids.length; i += 1) {
      for (let j = 0; j < trace.ids.length; j += 1) {
        const through = core.safeAdd(previous[i][k], previous[k][j]);
        const expected = through === null
          ? previous[i][j]
          : previous[i][j] === null ? through : Math.min(previous[i][j], through);
        assert.equal(current.distance[i][j], expected, `${i},${j},k=${k}`);
      }
    }
  }
});

test("Floyd and repeated Bellman–Ford agree without negative cycles", () => {
  for (const preset of ["classic", "unreachable", "large"]) {
    const graph = core.preset(preset);
    assert.deepEqual(
      core.buildFloydWarshall(graph).distance,
      core.repeatedBellmanFord(graph).distance,
      preset
    );
  }
});

test("Johnson matches Floyd and exposes valid nonnegative reweighting", () => {
  for (const preset of ["classic", "unreachable", "large"]) {
    const graph = core.preset(preset);
    const johnson = core.buildJohnson(graph);
    const floyd = core.buildFloydWarshall(graph);
    assert.equal(johnson.negativeCycle, false);
    assert.deepEqual(johnson.distance, floyd.distance, preset);
    for (const edge of johnson.reweightedEdges) {
      assert.ok(edge.weight >= 0);
      assert.equal(
        edge.weight,
        edge.originalWeight + johnson.potentials[edge.source] - johnson.potentials[edge.target]
      );
    }
  }
});

test("independently generated DAGs with negative edges agree in all three solvers", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    let state = seed >>> 0;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const nodes = Array.from({ length: 7 }, (_, index) => ({ id: "v" + index }));
    const edges = [];
    for (let source = 0; source < nodes.length; source += 1) {
      for (let target = source + 1; target < nodes.length; target += 1) {
        if (next() % 3 === 0) continue;
        edges.push({
          id: "e" + edges.length,
          source: nodes[source].id,
          target: nodes[target].id,
          weight: Number(next() % 19) - 9,
          directed: true,
        });
      }
    }
    const graph = { directed: true, nodes, edges };
    const floyd = core.buildFloydWarshall(graph);
    assert.deepEqual(core.buildJohnson(graph).distance, floyd.distance, "Johnson seed " + seed);
    assert.deepEqual(core.repeatedBellmanFord(graph).distance, floyd.distance, "Bellman–Ford seed " + seed);
  }
});

test("Johnson path restoration preserves every finite path distance", () => {
  const graph = core.preset("classic");
  const trace = core.buildJohnson(graph);
  for (const source of trace.ids) {
    for (const target of trace.ids) {
      const result = core.reconstructPath(trace, source, target);
      assert.equal(result.status, "ok");
      assert.equal(pathWeight(graph, result.path), result.distance);
    }
  }
});

test("unreachable pairs remain distinct from large finite weights", () => {
  const disconnected = core.buildFloydWarshall(core.preset("unreachable"));
  assert.deepEqual(core.reconstructPath(disconnected, "A", "E"), {
    status: "unreachable", path: [], distance: null,
  });
  const large = core.buildJohnson(core.preset("large"));
  assert.equal(large.distance[0][3], 1300000000000);
  assert.equal(core.reconstructPath(large, "D", "A").status, "unreachable");
  assert.doesNotMatch(JSON.stringify(large), /Infinity|NaN/);
});

test("negative cycles are detected and only affected Floyd pairs are undefined", () => {
  const graph = core.preset("negativeCycle");
  const floyd = core.buildFloydWarshall(graph);
  assert.deepEqual(new Set(floyd.negativeCycleVertexIds), new Set(["A", "B", "C"]));
  assert.equal(core.reconstructPath(floyd, "A", "D").status, "negative-cycle");
  assert.equal(core.reconstructPath(floyd, "D", "D").status, "ok");
  const johnson = core.buildJohnson(graph);
  assert.equal(johnson.negativeCycle, true);
  assert.equal(johnson.distance, null);
  assert.equal(core.reconstructPath(johnson, "A", "D").status, "negative-cycle");
});

test("empty and singleton graphs terminate with exact matrices", () => {
  const emptyGraph = { directed: true, nodes: [], edges: [] };
  assert.deepEqual(core.buildFloydWarshall(emptyGraph).distance, []);
  assert.deepEqual(core.buildJohnson(emptyGraph).distance, []);

  const singleton = { directed: true, nodes: [{ id: "A" }], edges: [] };
  for (const algorithm of core.ALGORITHMS) {
    const state = core.createState(singleton, { algorithm });
    let current = state;
    for (let guard = 0; guard < 20 && !current.playback.finished; guard += 1) current = core.step(current);
    assert.equal(current.playback.finished, true);
    assert.deepEqual(current.trace.distance, [[0]]);
    assert.deepEqual(core.reconstructPath(current.trace, "A", "A"), {
      status: "ok", path: ["A"], distance: 0,
    });
  }
});

test("parallel edges, undirected edges and negative loops have precise semantics", () => {
  const graph = {
    directed: false,
    nodes: [{ id: "A" }, { id: "B" }],
    edges: [
      { id: "slow", source: "A", target: "B", weight: 9, directed: false },
      { id: "fast", source: "A", target: "B", weight: 2, directed: false },
    ],
  };
  const trace = core.buildFloydWarshall(graph);
  assert.equal(trace.distance[0][1], 2);
  assert.equal(trace.distance[1][0], 2);

  const loop = core.buildFloydWarshall({
    directed: true,
    nodes: [{ id: "A" }],
    edges: [{ id: "loop", source: "A", target: "A", weight: -1, directed: true }],
  });
  assert.deepEqual(loop.negativeCycleVertexIds, ["A"]);
});

test("min-plus multiplication uses null as infinity", () => {
  const left = [[0, 4, null], [null, 0, -2], [3, null, 0]];
  const right = [[0, null, 7], [1, 0, null], [null, 5, 0]];
  assert.deepEqual(core.minPlusProduct(left, right), [
    [0, 4, 7],
    [1, 0, -2],
    [3, 5, 0],
  ]);
});

test("validation rejects ambiguous values and arithmetic overflow", () => {
  assert.throws(() => core.normalizeGraph(null), /объектом/);
  assert.throws(() => core.normalizeGraph({ nodes: [], edges: [{ id: "x" }] }), /Пустой граф/);
  assert.throws(() => core.buildTrace(core.preset("classic"), { algorithm: "guess" }), /Неизвестный/);
  assert.throws(() => core.normalizeGraph({
    directed: true,
    nodes: [{ id: "A" }, { id: "B" }],
    edges: [{ id: "e", source: "A", target: "B", weight: 1.5 }],
  }), /безопасным целым/);
  assert.throws(() => core.safeAdd(Number.MAX_SAFE_INTEGER, 1), /пределы/);
  assert.throws(() => core.reconstructPath(core.buildFloydWarshall(core.preset("classic")), "A", "Z"), /Неизвестная/);
});

test("playback is immutable, bounded and exposes a safe visual model", () => {
  const initial = core.createState(core.preset("classic"), { algorithm: "floyd-warshall" });
  const next = core.step(initial);
  assert.equal(initial.playback.cursor, 0);
  assert.equal(next.playback.cursor, 1);
  assert.ok(Object.isFrozen(next));
  assert.throws(() => core.seek(initial, 999), /целое число/);
  assert.equal(core.seek(initial, initial.playback.frames.length - 1).playback.finished, true);
  assert.equal(core.visualModel(next).negativeCycle, false);

  const johnson = core.createState(core.preset("classic"), { algorithm: "johnson" });
  assert.equal(core.visualModel(johnson).negativeCycle, false);

  let cycle = core.createState(core.preset("negativeCycle"), { algorithm: "johnson" });
  assert.equal(core.visualModel(cycle).negativeCycle, false, "future detection must not leak into the first frame");
  while (!cycle.playback.finished) cycle = core.step(cycle);
  assert.equal(core.visualModel(cycle).negativeCycle, true);
});

test("chapter and browser adapter use shared runtimes without eval", () => {
  assert.equal(fs.existsSync(adapterPath), true);
  assert.equal(fs.existsSync(chapterPath), true);
  const adapter = fs.readFileSync(adapterPath, "utf8");
  const chapter = fs.readFileSync(chapterPath, "utf8");
  assert.match(adapter, /AtlasGraphLabRuntime/);
  assert.match(adapter, /runtime\.mount/);
  assert.match(adapter, /graphRuntime\.mount/);
  assert.match(adapter, /maxAutomaticSteps:\s*128/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new Function/);
  assert.match(chapter, /atlas-block--fullwidth/);
  assert.match(chapter, /data-atlas-lab="all-pairs-shortest-paths"/);
  assert.match(chapter, /all-pairs-shortest-paths-core\.js/);
});

test("chapter contains proofs, pseudocode, notation hooks and exercises", () => {
  const chapter = fs.readFileSync(chapterPath, "utf8");
  assert.ok((chapter.match(/data-formula-id="apsp-/g) || []).length >= 12);
  assert.ok((chapter.match(/notation-id-apsp-/g) || []).length >= 40);
  assert.ok((chapter.match(/class="atlas-exercise"/g) || []).length >= 10);
  assert.match(chapter, /D\^\{\(k\)\}_\{ij\}/);
  assert.match(chapter, /FloydWarshall/);
  assert.match(chapter, /Johnson/);
  assert.match(chapter, /https:\/\/doi\.org\/10\.1145\/367766\.368168/);
  assert.match(chapter, /https:\/\/doi\.org\/10\.1145\/321105\.321107/);
  assert.match(chapter, /https:\/\/doi\.org\/10\.1145\/321992\.321993/);
});
