"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/minimum-spanning-trees-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterSource = fs.readFileSync(
  path.join(atlasRoot, "labs/minimum-spanning-trees.js"),
  "utf8"
);
const chapterSource = fs.readFileSync(
  path.join(atlasRoot, "chapters/minimum-spanning-trees.html"),
  "utf8"
);

function finish(options) {
  return core.runToEnd(core.createState(options));
}

function referenceComponents(graph) {
  const ids = graph.nodes.map(({ id }) => id);
  const parent = Object.fromEntries(ids.map((id) => [id, id]));
  function find(id) {
    while (parent[id] !== id) id = parent[id];
    return id;
  }
  function union(left, right) {
    left = find(left);
    right = find(right);
    if (left !== right) parent[right] = left;
  }
  graph.edges.forEach((edge) => {
    if (edge.source !== edge.target) union(edge.source, edge.target);
  });
  const groups = new Map();
  ids.forEach((id) => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });
  return { count: groups.size, find, originalParent: { ...parent } };
}

function bruteMinimumForests(rawGraph) {
  const graph = core.normalizeGraph(rawGraph);
  const components = referenceComponents(graph);
  const targetSize = graph.nodes.length - components.count;
  const eligible = graph.edges.filter((edge) => edge.source !== edge.target);
  if (eligible.length > 16) throw new RangeError("reference graph is too large");
  let minimum = null;
  let count = 0;
  const totalMasks = 1 << eligible.length;
  for (let mask = 0; mask < totalMasks; mask += 1) {
    let bits = 0;
    for (let value = mask; value; value >>>= 1) bits += value & 1;
    if (bits !== targetSize) continue;
    const ids = graph.nodes.map(({ id }) => id);
    const parent = Object.fromEntries(ids.map((id) => [id, id]));
    function find(id) {
      while (parent[id] !== id) {
        parent[id] = parent[parent[id]];
        id = parent[id];
      }
      return id;
    }
    let valid = true;
    let weight = 0n;
    for (let index = 0; index < eligible.length; index += 1) {
      if (!(mask & (1 << index))) continue;
      const edge = eligible[index];
      const left = find(edge.source);
      const right = find(edge.target);
      if (left === right) {
        valid = false;
        break;
      }
      parent[right] = left;
      weight += BigInt(edge.weight);
    }
    if (!valid) continue;
    for (const edge of graph.edges) {
      if (find(edge.source) !== find(edge.target)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    if (minimum === null || weight < minimum) {
      minimum = weight;
      count = 1;
    } else if (weight === minimum) count += 1;
  }
  return { weight: (minimum === null ? 0n : minimum).toString(), count };
}

function generatedGraph(seed) {
  const nodes = Array.from({ length: 6 }, (_, index) => ({ id: "v" + index }));
  const edges = [];
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  for (let index = 0; index < 10; index += 1) {
    const source = next() % nodes.length;
    const target = next() % nodes.length;
    edges.push({
      id: "e" + index,
      source: nodes[source].id,
      target: nodes[target].id,
      weight: String(Number(next() % 19) - 9),
      directed: false,
    });
  }
  return { directed: false, nodes, edges };
}

function assertExactState(value) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    assert.ok(Number.isSafeInteger(value));
  } else if (Array.isArray(value)) {
    value.forEach(assertExactState);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(assertExactState);
  }
}

test("Kruskal, Prim and Boruvka agree with exhaustive search on every preset", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const graph = core.graphFromPreset(preset);
    const reference = graph.edges.length <= 16 ? bruteMinimumForests(graph) : null;
    const results = core.MODES.map((mode) => finish({ mode, graph, root: graph.nodes[0]?.id || "" }));
    assert.equal(new Set(results.map((state) => state.current.totalWeight)).size, 1, preset);
    assert.equal(new Set(results.map((state) => state.current.selectedEdgeIds.length)).size, 1, preset);
    results.forEach((state) => {
      const verified = core.verifyForest(graph, state.current.selectedEdgeIds);
      assert.equal(verified.valid, true, preset + "/" + state.mode);
      assert.equal(state.optimality.optimal, true);
      if (reference) {
        assert.equal(state.current.totalWeight, reference.weight);
        assert.equal(state.optimality.unique, reference.count === 1);
      }
    });
  }
});

test("all three algorithms match an independent brute-force oracle on generated multigraphs", () => {
  for (let seed = 1; seed <= 36; seed += 1) {
    const graph = generatedGraph(seed);
    const reference = bruteMinimumForests(graph);
    for (const mode of core.MODES) {
      const state = finish({ mode, graph, root: "v0" });
      assert.equal(state.current.totalWeight, reference.weight, "seed " + seed + "/" + mode);
      assert.equal(state.optimality.unique, reference.count === 1, "uniqueness " + seed + "/" + mode);
    }
  }
});

test("every displayed safe edge is a minimum edge of its displayed cut", () => {
  for (const preset of ["unique", "multiple", "parallel", "disconnected", "signed"]) {
    for (const mode of core.MODES) {
      const state = core.createState({ preset, mode });
      const byId = Object.fromEntries(state.graph.edges.map((edge) => [edge.id, edge]));
      state.frames.filter((frame) => frame.phase === "safe-edge").forEach((frame) => {
        const edge = byId[frame.safeEdgeId];
        const left = new Set(frame.cutLeft);
        assert.notEqual(left.has(edge.source), left.has(edge.target), preset + "/" + mode);
        const crossing = core.crossingEdges(state.graph, frame.cutLeft);
        assert.ok(crossing.length > 0);
        assert.equal(BigInt(edge.weight), BigInt(crossing[0].weight), preset + "/" + mode);
      });
    }
  }
});

test("components only merge, selected edges stay acyclic and frame totals are exact", () => {
  for (const mode of core.MODES) {
    const state = core.createState({ preset: "signed", mode });
    let previousComponents = state.graph.nodes.length;
    let previousSelected = 0;
    state.frames.forEach((frame) => {
      assert.ok(frame.components.length <= previousComponents);
      assert.ok(frame.selectedEdgeIds.length >= previousSelected);
      assert.equal(
        frame.totalWeight,
        core.forestWeight(state.graph, frame.selectedEdgeIds).toString()
      );
      previousComponents = frame.components.length;
      previousSelected = frame.selectedEdgeIds.length;
    });
    assertExactState(state);
  }
});

test("loops are rejected, parallel edges remain distinct and the cheaper one wins", () => {
  const graph = core.graphFromPreset("parallel");
  const state = finish({ mode: "kruskal", graph });
  assert.ok(!state.current.selectedEdgeIds.includes("e1"));
  assert.ok(!state.current.selectedEdgeIds.includes("e2"));
  assert.ok(state.current.selectedEdgeIds.includes("e3"));
  assert.ok(state.frames.some((frame) => frame.phase === "reject-loop" && frame.activeEdgeId === "e1"));
  assert.ok(state.frames.some((frame) => frame.phase === "reject-cycle" && frame.activeEdgeId === "e2"));
});

test("non-unique optimum includes a concrete equal-weight exchange witness", () => {
  for (const mode of core.MODES) {
    const state = finish({ preset: "multiple", mode });
    assert.equal(state.optimality.unique, false);
    assert.ok(state.optimality.witness);
    assert.equal(state.optimality.witness.weight, "1");
    const replacement = state.current.selectedEdgeIds
      .filter((id) => id !== state.optimality.witness.removeEdgeId)
      .concat(state.optimality.witness.addEdgeId);
    const verified = core.verifyForest(state.graph, replacement);
    assert.equal(verified.valid, true);
    assert.equal(verified.weight, state.current.totalWeight);
  }
});

test("disconnected, singleton and empty inputs terminate as bounded forests", () => {
  for (const mode of core.MODES) {
    const disconnected = finish({ preset: "disconnected", mode });
    assert.equal(disconnected.current.components.length, 2);
    assert.equal(disconnected.current.selectedEdgeIds.length, 4);

    const singleton = finish({ preset: "singleton", mode });
    assert.equal(singleton.current.totalWeight, "0");
    assert.deepEqual(singleton.current.selectedEdgeIds, []);
    assert.equal(singleton.optimality.unique, true);

    const empty = finish({
      mode,
      graph: { directed: false, nodes: [], edges: [] },
      root: "",
    });
    assert.equal(empty.current.totalWeight, "0");
    assert.deepEqual(empty.current.components, []);
  }
});

test("Prim validates its root and can start a new component without changing the optimum", () => {
  const graph = core.graphFromPreset("disconnected");
  assert.throws(() => core.createState({ mode: "prim", graph, root: "missing" }), /отсутствует/);
  const fromA = finish({ mode: "prim", graph, root: "A" });
  const fromZ = finish({ mode: "prim", graph, root: "Z" });
  assert.equal(fromA.current.totalWeight, fromZ.current.totalWeight);
  assert.ok(fromA.frames.filter((frame) => frame.phase === "component-start").length >= 2);
});

test("large signed integer weights and totals never pass through Number", () => {
  const graph = core.parseGraphText(
    "A, B, C",
    "A B -9999999999999999999999999999999999999999; " +
      "B C 8888888888888888888888888888888888888888; " +
      "A C 9999999999999999999999999999999999999999"
  );
  for (const mode of core.MODES) {
    const state = finish({ mode, graph, root: "A" });
    assert.equal(state.current.totalWeight, "-1111111111111111111111111111111111111111");
    assert.doesNotMatch(JSON.stringify(state), /Infinity|NaN|e\+/);
    assertExactState(state);
  }
  assert.throws(() => core.parseWeight(Number.MAX_SAFE_INTEGER + 1), /строкой/);
  assert.throws(() => core.parseWeight("9".repeat(41)), /40 цифр/);
});

test("editor parser is deterministic, strict and preserves loops and parallel lines", () => {
  const graph = core.parseGraphText("A, B", "A A -2; A B 5; A B 5");
  assert.deepEqual(core.graphText(graph), {
    vertices: "A, B",
    edges: "A A -2; A B 5; A B 5",
  });
  assert.equal(graph.edges.length, 3);
  assert.notEqual(graph.edges[1].id, graph.edges[2].id);
  assert.throws(() => core.parseGraphText("A,B", "A B 1 extra"), /формат/);
  assert.throws(() => core.parseGraphText("A", "A Z 1"), /неизвестную вершину/);
  assert.throws(() => core.parseWeight("1.5"), /целое число/);
  assert.throws(() => core.normalizeGraph({
    directed: true,
    nodes: [{ id: "A" }, { id: "B" }],
    edges: [{ id: "e", source: "A", target: "B", weight: "1", directed: true }],
  }), /неориентированного/);
});

test("invalid forests and a deliberately non-optimal tree are rejected with witnesses", () => {
  const graph = core.graphFromPreset("unique");
  assert.equal(core.verifyForest(graph, ["e1"]).valid, false);
  assert.equal(core.verifyForest(graph, ["missing"]).valid, false);
  assert.equal(core.verifyForest(graph, ["e1", "e1"]).valid, false);

  const expensiveTree = ["e1", "e3", "e5", "e6", "e8"];
  const verified = core.verifyForest(graph, expensiveTree);
  assert.equal(verified.valid, true);
  const analysis = core.analyzeOptimality(graph, expensiveTree);
  assert.equal(analysis.optimal, false);
  assert.ok(analysis.witness);
});

test("chapter and adapter reuse the shared full-width graph runtime without unsafe evaluation", () => {
  assert.match(chapterSource, /data-atlas-node-id="minimum-spanning-trees"/);
  assert.match(chapterSource, /atlas-block--fullwidth/);
  assert.match(chapterSource, /data-atlas-lab="minimum-spanning-trees"/);
  assert.match(chapterSource, /graph-lab-core\.js/);
  assert.match(chapterSource, /graph-lab-runtime\.js/);
  assert.match(chapterSource, /graph-labs\.css/);
  assert.match(adapterSource, /AtlasGraphLabRuntime/);
  assert.match(adapterSource, /graphRuntime\.mount/);
  assert.match(adapterSource, /runtime\.mount/);
  assert.match(adapterSource, /maxAutomaticSteps:\s*4096/);
  assert.doesNotMatch(adapterSource, /\beval\s*\(|new Function/);
});

test("chapter contains the required theory, semantic formulas, sources and exercises", () => {
  for (const token of [
    "свойство разреза", "Свойство цикла", "Kruskal", "Jarník", "Prim", "Borůvka",
    "disjoint-set union", "минимальный остовный лес", "деревом кратчайших путей",
    "фундаментального цикла", "чувствительность",
  ]) assert.match(chapterSource, new RegExp(token, "i"));
  assert.ok((chapterSource.match(/data-formula-id=/g) || []).length >= 12);
  assert.ok((chapterSource.match(/notation-id-(?:mst|graph|dsu)-/g) || []).length >= 35);
  assert.equal((chapterSource.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.match(chapterSource, /10\.1016\/S0012-365X\(00\)00224-7/);
  assert.match(chapterSource, /10\.1090\/S0002-9939-1956-0078686-7/);
  assert.match(chapterSource, /10\.1002\/j\.1538-7305\.1957\.tb01515\.x/);
  assert.match(chapterSource, /10\.1109\/MAHC\.1985\.10011/);
});
