"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/connectivity-cuts-network-design-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterPath = path.join(atlasRoot, "labs/connectivity-cuts-network-design.js");
const chapterPath = path.join(atlasRoot, "chapters/connectivity-cuts-network-design.html");

function finish(options) {
  return core.runToEnd(core.createState(options));
}

function generatedMultigraph(seed) {
  const nodes = Array.from({ length: 7 }, (_, index) => ({ id: "v" + index }));
  const edges = [];
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  for (let index = 0; index < 16; index += 1) {
    const source = next() % nodes.length;
    const target = next() % nodes.length;
    if (next() % 5 === 0 || source !== target) {
      edges.push({
        id: "e" + index,
        source: nodes[source].id,
        target: nodes[target].id,
        capacity: String(next() % 9),
      });
    }
  }
  return { nodes, edges };
}

function independentCut(graph, source, sink, globalMode) {
  const normalized = core.normalizeGraph(graph);
  if (normalized.nodes.length < 2) return null;
  const ids = normalized.nodes.map(({ id }) => id);
  const fixedSource = globalMode ? ids[0] : source;
  const variable = ids.filter((id) => id !== fixedSource && (globalMode || id !== sink));
  let best = null;
  for (let mask = 0; mask < 2 ** variable.length; mask += 1) {
    const side = new Set([fixedSource]);
    variable.forEach((id, index) => {
      if (mask & (2 ** index)) side.add(id);
    });
    if (globalMode && side.size === ids.length) continue;
    let capacity = 0n;
    for (const edge of normalized.edges) {
      if (edge.source !== edge.target && side.has(edge.source) !== side.has(edge.target)) {
        capacity += BigInt(edge.capacity);
      }
    }
    if (best === null || capacity < best) best = capacity;
  }
  return best;
}

function combinations(items, size) {
  const result = [];
  function visit(start, chosen) {
    if (chosen.length === size) {
      result.push(chosen.slice());
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index]);
      visit(index + 1, chosen);
      chosen.pop();
    }
  }
  visit(0, []);
  return result;
}

function bruteEdgeConnectivity(graph) {
  const normalized = core.normalizeGraph(graph);
  if (normalized.nodes.length < 2 || core.connectedComponents(normalized).length !== 1) return 0;
  const ids = normalized.edges.filter((edge) => edge.source !== edge.target).map((edge) => edge.id);
  for (let count = 1; count <= ids.length; count += 1) {
    for (const removed of combinations(ids, count)) {
      if (core.connectedComponents(core.effectiveGraph(normalized, [], removed)).length > 1) return count;
    }
  }
  return 0;
}

test("low-link bridges and articulation points match deletion references", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const graph = core.graphFromPreset(preset);
    const actual = core.lowLinkAnalysis(graph, false).result;
    const reference = core.bridgeAndArticulationReference(graph);
    assert.deepEqual(actual.bridges, reference.bridges, preset + " bridges");
    assert.deepEqual(actual.articulations, reference.articulations, preset + " articulations");
  }
  for (let seed = 1; seed <= 36; seed += 1) {
    const graph = generatedMultigraph(seed);
    const actual = core.lowLinkAnalysis(graph, false).result;
    const reference = core.bridgeAndArticulationReference(graph);
    assert.deepEqual(actual.bridges, reference.bridges, "seed " + seed);
    assert.deepEqual(actual.articulations, reference.articulations, "seed " + seed);
  }
});

test("parent edge is identified by id, so a parallel edge prevents a false bridge", () => {
  const graph = core.parseGraphText("a,b", "a b 1; a b 1");
  const result = core.lowLinkAnalysis(graph, true);
  assert.deepEqual(result.result.bridges, []);
  assert.deepEqual(result.result.articulations, []);
  assert.ok(result.frames.some(({ phase }) => phase === "back-edge"));

  const oneEdge = core.parseGraphText("a,b", "a b 1");
  assert.deepEqual(core.lowLinkAnalysis(oneEdge, false).result.bridges, ["e1"]);
});

test("loops do not alter components, bridges, articulations or cut capacity", () => {
  const withoutLoop = core.parseGraphText("a,b,c", "a b 2; b c 3");
  const withLoop = core.parseGraphText("a,b,c", "a b 2; b c 3; b b 999");
  assert.deepEqual(
    core.lowLinkAnalysis(withLoop, false).result.bridges,
    core.lowLinkAnalysis(withoutLoop, false).result.bridges
  );
  assert.deepEqual(core.lowLinkAnalysis(withLoop, false).result.articulations, ["b"]);
  assert.equal(core.minimumSTCut(withLoop, "a", "c").capacity, 2n);
  assert.ok(core.createState({ mode: "low-link", graph: withLoop }).frames.some(({ phase }) => phase === "loop"));
});

test("biconnected edge blocks are emitted at exact low-link boundaries", () => {
  const result = core.lowLinkAnalysis(core.graphFromPreset("blocks"), false).result;
  const blocks = result.biconnected.map((block) => block.join(",")).sort();
  assert.deepEqual(blocks, ["e1,e2,e3", "e4", "e5,e6,e7", "e8"]);
});

test("s-t and global cuts match independent exhaustive enumeration", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const graph = generatedMultigraph(seed);
    const source = "v0";
    const sink = "v6";
    assert.equal(
      core.minimumSTCut(graph, source, sink).capacity,
      independentCut(graph, source, sink, false),
      "s-t seed " + seed
    );
    assert.equal(
      core.globalMinimumCut(graph).capacity,
      independentCut(graph, null, null, true),
      "global seed " + seed
    );
  }
});

test("local and global cuts answer different questions", () => {
  const graph = core.graphFromPreset("weighted");
  const local = core.minimumSTCut(graph, "s", "t");
  const global = core.globalMinimumCut(graph);
  assert.equal(local.capacity, 10n);
  assert.equal(global.capacity, 1n);
  assert.ok(global.capacity < local.capacity);
  assert.ok(local.sourceSide.includes("s"));
  assert.ok(local.sinkSide.includes("t"));
});

test("edge and vertex connectivity agree with direct failure semantics", () => {
  for (let seed = 1; seed <= 14; seed += 1) {
    const graph = generatedMultigraph(seed);
    assert.equal(Number(core.edgeConnectivity(graph)), bruteEdgeConnectivity(graph), "seed " + seed);
  }
  const path = core.parseGraphText("a,b,c,d", "a b; b c; c d");
  const cycle = core.parseGraphText("a,b,c,d", "a b; b c; c d; d a");
  const complete = core.parseGraphText("a,b,c,d", "a b; a c; a d; b c; b d; c d");
  const disconnected = core.parseGraphText("a,b,c", "a b");
  assert.equal(core.vertexConnectivity(path), 1);
  assert.equal(core.vertexConnectivity(cycle), 2);
  assert.equal(core.vertexConnectivity(complete), 3);
  assert.equal(core.vertexConnectivity(disconnected), 0);
});

test("deleting a bridge or articulation changes the visible component count", () => {
  const graph = core.graphFromPreset("blocks");
  const edgeDeleted = finish({
    mode: "bridges",
    graph,
    removedEdges: ["e4"],
  });
  assert.equal(edgeDeleted.current.baseComponentCount, 1);
  assert.equal(edgeDeleted.current.components.length, 2);

  const vertexDeleted = finish({
    mode: "articulation",
    graph,
    removedVertices: ["d"],
  });
  assert.equal(vertexDeleted.current.components.length, 3);
  assert.ok(!vertexDeleted.graph.nodes.some(({ id }) => id === "d"));
});

test("empty, singleton, disconnected and equal-cut graphs have explicit outcomes", () => {
  const empty = core.normalizeGraph({ nodes: [], edges: [] });
  assert.deepEqual(core.connectedComponents(empty), []);
  assert.equal(core.globalMinimumCut(empty), null);
  assert.deepEqual(core.lowLinkAnalysis(empty, false).result.bridges, []);

  const singleton = core.graphFromPreset("singleton");
  assert.equal(core.globalMinimumCut(singleton), null);
  assert.equal(core.edgeConnectivity(singleton), 0n);
  assert.equal(core.vertexConnectivity(singleton), 0);

  const disconnected = core.graphFromPreset("disconnected");
  assert.equal(core.globalMinimumCut(disconnected).capacity, 0n);

  const equalCuts = core.globalMinimumCut(core.graphFromPreset("equalCuts"));
  assert.equal(equalCuts.capacity, 2n);
  assert.deepEqual(equalCuts.sourceSide, ["a"]);
});

test("huge capacities remain exact and cut enumeration is safely bounded", () => {
  const graph = core.parseGraphText(
    "s,a,b,t",
    "s a 900719925474099312345678; a t 900719925474099312345678; " +
      "s b 800000000000000000000000; b t 800000000000000000000000"
  );
  const cut = core.minimumSTCut(graph, "s", "t");
  assert.equal(cut.capacity, 1700719925474099312345678n);
  const state = core.createState({ mode: "s-t-cut", graph, source: "s", sink: "t" });
  assert.ok(state.frames.length < 2 ** (graph.nodes.length - 2) + 3);
  assert.doesNotMatch(JSON.stringify(state), /Infinity|NaN|e\+/);
  assert.throws(() => core.parseCapacity(Number.MAX_SAFE_INTEGER + 1), /строкой/);
});

test("parser is strict while preserving parallel edges and loops", () => {
  const graph = core.parseGraphText("a,b", "a b 0; a b 4; a a 7");
  assert.deepEqual(core.graphText(graph), {
    vertices: "a, b",
    edges: "a b 0; a b 4; a a 7",
  });
  assert.throws(() => core.parseGraphText("a,b", "a b -1"), /неотрицательное/);
  assert.throws(() => core.parseGraphText("a,b", "a b 1 extra"), /формат/);
  assert.throws(() => core.parseGraphText("a", "a z 1"), /неизвестную вершину/);
  assert.throws(() => core.parseCapacity("9".repeat(37)), /36 цифр/);
  assert.throws(() => core.createState({
    mode: "s-t-cut",
    graph,
    source: "a",
    sink: "a",
  }), /разные/);
});

test("all five playback modes terminate within the common frame bound", () => {
  for (const mode of core.MODES) {
    const options = { mode, preset: "blocks" };
    if (mode === "s-t-cut") Object.assign(options, { source: "a", sink: "g" });
    const state = finish(options);
    assert.equal(state.current.phase, "finish", mode);
    assert.ok(state.frames.length <= 4096);
  }
});

test("adapter reuses full-width graph runtimes and exposes failure controls", () => {
  const adapterSource = fs.readFileSync(adapterPath, "utf8");
  for (const mode of core.MODES) assert.match(adapterSource, new RegExp('value="' + mode + '"'));
  assert.match(adapterSource, /AtlasGraphLabRuntime/);
  assert.match(adapterSource, /graphRuntime\.mount/);
  assert.match(adapterSource, /runtime\.mount/);
  assert.match(adapterSource, /toggle-vertex/);
  assert.match(adapterSource, /toggle-edge/);
  assert.match(adapterSource, /maxAutomaticSteps:\s*4096/);
  assert.doesNotMatch(adapterSource, /\beval\s*\(|new Function/);
});

test("chapter contract includes strict formulas, exercises and primary sources", () => {
  const chapterSource = fs.readFileSync(chapterPath, "utf8");
  assert.match(chapterSource, /atlas-block--fullwidth/);
  assert.match(chapterSource, /data-atlas-lab="connectivity-cuts-network-design"/);
  assert.match(chapterSource, /connectivity-cuts-network-design-core\.js/);
  assert.ok((chapterSource.match(/data-formula-id=/g) || []).length >= 14);
  assert.ok((chapterSource.match(/notation-id-(?:connectivity|graph)-/g) || []).length >= 38);
  assert.ok((chapterSource.match(/class="atlas-exercise"/g) || []).length >= 10);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.4064\/fm-10-1-96-115/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1137\/0201010/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1137\/0109047/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1145\/263867\.263872/);
});
