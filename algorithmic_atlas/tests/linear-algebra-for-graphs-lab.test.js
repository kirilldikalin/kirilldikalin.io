"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/linear-algebra-for-graphs-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterPath = path.join(atlasRoot, "labs/linear-algebra-for-graphs.js");
const chapterPath = path.join(atlasRoot, "chapters/linear-algebra-for-graphs.html");

function close(actual, expected, tolerance = 1e-8, message = "") {
  assert.ok(Math.abs(actual - expected) <= tolerance, message + `: ${actual} ≠ ${expected}`);
}

function multiply(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function generatedGraph(seed, size = 7, edgeCount = 15) {
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  const nodes = Array.from({ length: size }, (_, index) => ({ id: "v" + index }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: "e" + index,
    source: nodes[next() % size].id,
    target: nodes[next() % size].id,
    directed: false,
    weight: next() % 7,
  }));
  return { directed: false, nodes, edges };
}

function independentComponents(rawGraph) {
  const graph = core.normalizeGraph(rawGraph);
  const adjacency = Object.fromEntries(graph.nodes.map(({ id }) => [id, []]));
  graph.edges.forEach((edge) => {
    if (edge.weight > 0 && edge.source !== edge.target) {
      adjacency[edge.source].push(edge.target);
      adjacency[edge.target].push(edge.source);
    }
  });
  const seen = new Set();
  let count = 0;
  graph.nodes.forEach(({ id }) => {
    if (seen.has(id)) return;
    count += 1;
    const queue = [id];
    seen.add(id);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      adjacency[queue[cursor]].forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
  });
  return count;
}

function bruteTreeWeight(rawGraph) {
  const graph = core.normalizeGraph(rawGraph);
  const size = graph.nodes.length;
  if (size === 0) return 0n;
  if (size === 1) return 1n;
  const eligible = graph.edges.filter((edge) => edge.source !== edge.target);
  if (eligible.length > 20) throw new RangeError("reference graph too large");
  let total = 0n;
  for (let mask = 0; mask < 2 ** eligible.length; mask += 1) {
    let bits = 0;
    for (let value = mask; value; value >>>= 1) bits += value & 1;
    if (bits !== size - 1) continue;
    const parent = Array.from({ length: size }, (_, index) => index);
    const index = new Map(graph.nodes.map(({ id }, position) => [id, position]));
    function find(item) {
      while (parent[item] !== item) {
        parent[item] = parent[parent[item]];
        item = parent[item];
      }
      return item;
    }
    let product = 1n;
    let valid = true;
    eligible.forEach((edge, edgeIndex) => {
      if (!(mask & (2 ** edgeIndex)) || !valid) return;
      let left = find(index.get(edge.source));
      let right = find(index.get(edge.target));
      if (left === right) {
        valid = false;
        return;
      }
      parent[right] = left;
      product *= BigInt(edge.weight);
    });
    if (valid && Array.from({ length: size }, (_, item) => find(item)).every((root) => root === find(0))) {
      total += product;
    }
  }
  return total;
}

test("A, D and L follow the stated loop and parallel-edge convention", () => {
  const graph = core.graphFromPreset("multigraph");
  assert.deepEqual(core.adjacencyMatrix(graph), [
    [0, 5, 0],
    [5, 0, 1],
    [0, 1, 8],
  ]);
  assert.deepEqual(core.degreeMatrix(graph), [
    [5, 0, 0],
    [0, 6, 0],
    [0, 0, 9],
  ]);
  assert.deepEqual(core.laplacianMatrix(graph), [
    [5, -5, 0],
    [-5, 6, -1],
    [0, -1, 1],
  ]);
});

test("oriented incidence factorization BWB^T equals D-A exactly", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const graph = core.graphFromPreset(preset);
    assert.deepEqual(core.incidenceProduct(graph), core.laplacianMatrix(graph), preset);
  }
  for (let seed = 1; seed <= 30; seed += 1) {
    const graph = generatedGraph(seed);
    assert.deepEqual(core.incidenceProduct(graph), core.laplacianMatrix(graph), "seed " + seed);
  }
});

test("quadratic matrix form equals the independent sum of edge energies", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const graph = generatedGraph(seed);
    const vector = graph.nodes.map((_, index) => ((seed * 11 + index * 7) % 13) - 6);
    const matrixValue = core.quadraticForm(core.laplacianMatrix(graph), vector);
    const edgeValue = graph.edges.reduce((sum, edge) => {
      const left = Number(edge.source.slice(1));
      const right = Number(edge.target.slice(1));
      return sum + edge.weight * (vector[left] - vector[right]) ** 2;
    }, 0);
    assert.equal(matrixValue, edgeValue, "seed " + seed);
    assert.equal(core.edgeEnergy(graph, vector), edgeValue);
    assert.ok(matrixValue >= 0);
  }
});

test("Jacobi eigensystem has small residuals and orthonormal vectors", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const matrix = core.laplacianMatrix(generatedGraph(seed));
    const spectrum = core.eigenSymmetric(matrix);
    spectrum.vectors.forEach((vector, index) => {
      const product = multiply(matrix, vector);
      product.forEach((value, row) => close(value, spectrum.values[index] * vector[row], 2e-7, "residual"));
      close(dot(vector, vector), 1, 2e-8, "norm");
      for (let other = 0; other < index; other += 1) {
        close(dot(vector, spectrum.vectors[other]), 0, 2e-8, "orthogonality");
      }
    });
    spectrum.values.forEach((value) => assert.ok(value >= -2e-8));
  }
});

test("zero eigenvalue multiplicity equals positive-support component count", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const graph = core.graphFromPreset(preset);
    const spectrum = core.eigenSymmetric(core.laplacianMatrix(graph));
    assert.equal(spectrum.values.filter((value) => Math.abs(value) <= 1e-8).length,
      independentComponents(graph), preset);
  }
  for (let seed = 1; seed <= 40; seed += 1) {
    const graph = generatedGraph(seed);
    const spectrum = core.eigenSymmetric(core.laplacianMatrix(graph));
    assert.equal(spectrum.values.filter((value) => Math.abs(value) <= 1e-8).length,
      independentComponents(graph), "seed " + seed);
  }
});

test("scaled Jacobi remains stable across the full supported weight range", () => {
  const graph = core.parseGraphText(
    "a,b,c,d,e,f,g,h,i,j",
    "a b 1000000000; b c 999999937; c d 800000003; d e 700000009; " +
      "e f 1; f g 600000011; g h 500000003; h i 400000009; i j 300000007; " +
      "j a 2; a f 123456789; c h 98765431"
  );
  const matrix = core.laplacianMatrix(graph);
  const spectrum = core.eigenSymmetric(matrix);
  assert.equal(spectrum.values.filter((value) => value === 0).length, 1);
  const matrixScale = Math.max(1, ...matrix.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
  spectrum.vectors.forEach((vector, index) => {
    const product = multiply(matrix, vector);
    const scale = Math.max(matrixScale, Math.abs(spectrum.values[index]));
    product.forEach((value, row) => close(
      value / scale,
      spectrum.values[index] * vector[row] / scale,
      2e-7,
      "scaled residual"
    ));
  });
  const state = core.runToEnd(core.createState({ graph, vector: "0,1,2,3,4,5,6,7,8,9" }));
  assert.equal(state.current.nullity, state.current.components.length);
  assert.equal(state.current.eigenvalues[0], 0);
});

test("normalized Laplacian spectrum remains in [0,2]", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const values = core.eigenSymmetric(core.normalizedLaplacian(generatedGraph(seed))).values;
    values.forEach((value) => {
      assert.ok(value >= -2e-8, "negative eigenvalue");
      assert.ok(value <= 2 + 2e-8, "eigenvalue above two");
    });
  }
});

test("random-walk rows sum to one and the degree distribution is stationary", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const graph = core.graphFromPreset(preset);
    const walk = core.randomWalk(graph);
    walk.transition.forEach((row) => close(row.reduce((sum, value) => sum + value, 0), 1, 1e-12, preset));
    const after = walk.stationary.map((_, column) => walk.stationary.reduce((sum, mass, row) => {
      return sum + mass * walk.transition[row][column];
    }, 0));
    after.forEach((value, index) => close(value, walk.stationary[index], 1e-12, preset));
  }
});

test("matrix-tree theorem matches known graphs and exact weighted enumeration", () => {
  assert.equal(core.matrixTreeWeight(core.graphFromPreset("path")), 1n);
  assert.equal(core.matrixTreeWeight(core.graphFromPreset("weighted")), 117n);
  assert.equal(core.matrixTreeWeight(core.graphFromPreset("disconnected")), 0n);
  assert.equal(core.matrixTreeWeight(core.graphFromPreset("singleton")), 1n);
  assert.equal(core.matrixTreeWeight({ nodes: [], edges: [] }), 0n);
  const cycle = core.parseGraphText("a,b,c,d,e", "a b; b c; c d; d e; e a");
  assert.equal(core.matrixTreeWeight(cycle), 5n);
  const complete4 = core.parseGraphText("a,b,c,d", "a b; a c; a d; b c; b d; c d");
  assert.equal(core.matrixTreeWeight(complete4), 16n);
  for (let seed = 1; seed <= 24; seed += 1) {
    const graph = generatedGraph(seed, 5, 9);
    assert.equal(core.matrixTreeWeight(graph), bruteTreeWeight(graph), "seed " + seed);
  }
});

test("Rayleigh quotient is scale-invariant and rejects only the zero vector", () => {
  const matrix = core.laplacianMatrix(core.graphFromPreset("weighted"));
  const first = core.rayleighQuotient(matrix, [2, 0, -1, 1]);
  const second = core.rayleighQuotient(matrix, [20, 0, -10, 10]);
  close(first, second, 1e-12);
  assert.equal(core.rayleighQuotient(matrix, [0, 0, 0, 0]), null);
});

test("playback adds one edge at a time and keeps every representation synchronized", () => {
  const state = core.createState({ preset: "multigraph" });
  assert.equal(state.frames.length, state.graph.edges.length + 1);
  state.frames.forEach((frame, index) => {
    assert.equal(frame.includedEdgeIds.length, index);
    assert.equal(frame.quadraticForm, frame.edgeEnergy);
    assert.equal(frame.nullity, frame.components.length);
    assert.deepEqual(frame.laplacian, frame.laplacian.map((row, i) => row.map((value, j) => value)));
    frame.laplacian.forEach((row) => assert.equal(row.reduce((sum, value) => sum + value, 0), 0));
  });
  const finished = core.runToEnd(state);
  assert.equal(finished.finished, true);
  assert.equal(finished.cursor, state.frames.length - 1);
});

test("editing, parsing and bounds preserve loops, parallel edges and exact integer weights", () => {
  const graph = core.parseGraphText("a, b", "a b 0; a b 9; b b 4");
  assert.deepEqual(core.graphText(graph), {
    vertices: "a, b",
    edges: "a b 0; a b 9; b b 4",
  });
  const edited = core.updateEdgeWeight(graph, "e2", "12");
  assert.equal(edited.edges[1].weight, 12);
  assert.throws(() => core.updateEdgeWeight(graph, "missing", 1), /Неизвестное ребро/);
  assert.throws(() => core.parseGraphText("a,b", "a c 1"), /неизвестную вершину/);
  assert.throws(() => core.parseGraphText("a,b", "a b -1"), /целое число/);
  assert.throws(() => core.parseGraphText("a,b", "a b 1.5"), /целое число/);
  assert.throws(() => core.parseVector("1", 2), /ровно 2/);
});

test("empty, isolated, zero-weight and loop-only graphs have explicit spectral semantics", () => {
  const empty = core.normalizeGraph({ nodes: [], edges: [] });
  assert.deepEqual(core.laplacianMatrix(empty), []);
  assert.deepEqual(core.eigenSymmetric([]), { values: [], vectors: [] });
  assert.deepEqual(core.supportComponents(empty), []);
  assert.equal(core.matrixTreeWeight(empty), 0n);

  const singleton = core.graphFromPreset("singleton");
  assert.deepEqual(core.laplacianMatrix(singleton), [[0]]);
  assert.deepEqual(core.normalizedLaplacian(singleton), [[0]]);
  assert.equal(core.supportComponents(singleton).length, 1);

  const zero = core.graphFromPreset("zero");
  assert.equal(core.supportComponents(zero).length, 3);
  assert.deepEqual(core.laplacianMatrix(zero), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
});

test("chapter and adapter expose the shared atlas contract without unsafe evaluation", () => {
  const adapter = fs.readFileSync(adapterPath, "utf8");
  const chapter = fs.readFileSync(chapterPath, "utf8");
  assert.match(adapter, /AtlasLabRuntime/);
  assert.match(adapter, /AtlasGraphLabRuntime/);
  assert.match(adapter, /AtlasLabSvg/);
  assert.match(adapter, /data-field="edge-weight"/);
  assert.match(adapter, /data-matrix="adjacency"/);
  assert.match(adapter, /data-matrix="degree"/);
  assert.match(adapter, /data-matrix="laplacian"/);
  assert.doesNotMatch(adapter + chapter, /\beval\s*\(|new Function/);
  assert.match(chapter, /data-atlas-node-id="linear-algebra-for-graphs"/);
  assert.match(chapter, /data-atlas-lab="linear-algebra-for-graphs"/);
  assert.equal((chapter.match(/<article class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/class="atlas-math atlas-notation-formula"/g) || []).length >= 14);
  assert.ok((chapter.match(/data-atlas-block="proof"/g) || []).length >= 3);
  assert.ok((chapter.match(/data-required-notations=/g) || []).length >= 14);
  assert.doesNotMatch(chapter, /notation-id-[^"}]*\\class\{/);
  assert.match(chapter, /Kirchhoff|Кирхгоф/);
  assert.match(chapter, /Fiedler|Фидлер/);
  assert.match(chapter, /von Luxburg|фон Люксбург/);
});
