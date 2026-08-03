"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/spectral-graph-algorithms-core.js");

function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-8), (message || "числа различаются") + ": " + actual + " vs " + expected);
}

function closeArray(actual, expected, tolerance) {
  assert.equal(actual.length, expected.length);
  actual.forEach(function (value, index) { close(value, expected[index], tolerance, "index=" + index); });
}

function dot(left, right) { return left.reduce(function (sum, value, index) { return sum + value * right[index]; }, 0); }

function independentCut(graph, ids) {
  const side = new Set(ids);
  const degree = Object.fromEntries(graph.nodes.map(function (node) { return [node.id, 0]; }));
  let boundary = 0;
  graph.edges.forEach(function (edge) {
    degree[edge.source] += edge.weight; degree[edge.target] += edge.weight;
    if (side.has(edge.source) !== side.has(edge.target)) boundary += edge.weight;
  });
  const volume = Array.from(side).reduce(function (sum, id) { return sum + degree[id]; }, 0);
  const total = Object.values(degree).reduce(function (sum, value) { return sum + value; }, 0);
  const other = total - volume;
  return volume > 0 && other > 0 ? boundary / Math.min(volume, other) : null;
}

function independentBest(graph) {
  const n = graph.nodes.length;
  let best = null;
  for (let mask = 1; mask < (1 << n) - 1; mask += 1) {
    if (!(mask & 1)) continue;
    const ids = graph.nodes.filter(function (_, index) { return mask & (1 << index); }).map(function (node) { return node.id; });
    const value = independentCut(graph, ids);
    if (value !== null && (best === null || value < best)) best = value;
  }
  return best;
}

function deterministicGraph(seed) {
  let value = seed >>> 0;
  function random() { value = (1664525 * value + 1013904223) >>> 0; return value; }
  const n = 3 + seed % 5;
  const nodes = Array.from({ length: n }, function (_, index) { return { id: "v" + index }; });
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || random() % 100 < 38) edges.push({ id: "e" + edges.length, source: "v" + i, target: "v" + j, weight: (random() % 9) / 2 });
    }
  }
  return { directed: false, nodes: nodes, edges: edges };
}

test("известные спектры P4, C4 и K4 вычисляются с правильной кратностью", function () {
  closeArray(core.spectrum(core.preset("path4")).laplacian.values, [0, 2 - Math.sqrt(2), 2, 2 + Math.sqrt(2)], 1e-8);
  closeArray(core.spectrum(core.preset("path4")).normalized.values, [0, 0.5, 1.5, 2], 1e-8);
  closeArray(core.spectrum(core.preset("cycle4")).laplacian.values, [0, 2, 2, 4], 1e-8);
  closeArray(core.spectrum(core.preset("complete4")).laplacian.values, [0, 4, 4, 4], 1e-8);
});

test("метод Якоби возвращает ортонормированные векторы с малым невязком", function () {
  for (let seed = 1; seed <= 35; seed += 1) {
    const spectral = core.spectrum(deterministicGraph(seed));
    [spectral.laplacian, spectral.normalized].forEach(function (eigen) {
      assert.ok(eigen.residuals.every(function (value) { return value < 1e-7; }), "seed=" + seed);
      eigen.vectors.forEach(function (vector, i) {
        close(dot(vector, vector), 1, 1e-7);
        eigen.vectors.forEach(function (other, j) { if (i !== j) close(dot(vector, other), 0, 1e-7); });
      });
    });
  }
});

test("кратность нуля совпадает с числом компонент положительной поддержки", function () {
  ["path4", "disconnected", "isolate", "zeroEdge"].forEach(function (name) {
    const spectral = core.spectrum(core.preset(name));
    assert.equal(spectral.zeroMultiplicity, spectral.components.length, name);
  });
  assert.equal(core.spectrum(core.preset("cycle4")).repeatedFiedler, true);
});

test("вектор Фидлера ортогонален константе на связном графе", function () {
  ["path4", "bottleneck", "weighted"].forEach(function (name) {
    const spectral = core.spectrum(core.preset(name));
    close(spectral.fiedlerVector.reduce(function (sum, value) { return sum + value; }, 0), 0, 1e-7);
    assert.ok(spectral.algebraicConnectivity > 0);
  });
});

test("метрики разреза совпадают с независимым подсчётом", function () {
  const graph = core.preset("bottleneck");
  const metrics = core.cutMetrics(graph, ["a", "b", "c"]);
  close(metrics.boundaryWeight, 0.3, 1e-12);
  close(metrics.conductance, independentCut(graph, ["a", "b", "c"]), 1e-12);
  assert.equal(metrics.sideIds.length, 3);
  assert.equal(metrics.complementIds.length, 3);
});

test("полный перебор проводимости совпадает с независимым оракулом", function () {
  Object.keys(core.PRESETS).forEach(function (name) {
    const graph = core.preset(name);
    close(core.bruteForceBestConductance(graph).value, independentBest(graph), 1e-10, name);
  });
  for (let seed = 1; seed <= 45; seed += 1) {
    const graph = core.normalizeGraph(deterministicGraph(500 + seed));
    close(core.bruteForceBestConductance(graph).value, independentBest(graph), 1e-10, "seed=" + seed);
  }
});

test("sweep перебирает все непустые префиксы и синхронно меняет спектры сторон", function () {
  const graph = core.preset("bottleneck");
  const frames = core.sweepFrames(graph);
  assert.equal(frames.length, graph.nodes.length - 1);
  frames.forEach(function (frame, index) {
    assert.equal(frame.sideIds.length, index + 1);
    assert.equal(frame.leftSpectrum.length, frame.sideIds.length);
    assert.equal(frame.rightSpectrum.length, frame.complementIds.length);
    close(frame.metrics.conductance, independentCut(graph, frame.sideIds), 1e-12);
  });
  const bestSweep = Math.min.apply(null, frames.map(function (frame) { return frame.metrics.conductance; }));
  assert.ok(bestSweep <= Math.sqrt(2 * core.spectrum(graph).normalizedGap) + 1e-8);
});

test("теорема Чигера проверяется только при выполнении предпосылок", function () {
  ["path4", "cycle4", "complete4", "bottleneck", "weighted"].forEach(function (name) {
    const report = core.cheegerReport(core.preset(name));
    assert.equal(report.applicable, true);
    assert.equal(report.lowerHolds, true);
    assert.equal(report.upperHolds, true);
  });
  assert.equal(core.cheegerReport(core.preset("disconnected")).applicable, false);
  assert.equal(core.cheegerReport(core.preset("isolate")).applicable, false);
});

test("ленивое блуждание стохастично и сходится к стационарному распределению", function () {
  const graph = core.preset("bottleneck");
  const walk = core.lazyWalk(graph);
  walk.transition.forEach(function (row) { close(row.reduce(function (sum, value) { return sum + value; }, 0), 1, 1e-12); });
  const transported = walk.stationary.map(function (_, j) { return walk.stationary.reduce(function (sum, probability, i) { return sum + probability * walk.transition[i][j]; }, 0); });
  closeArray(transported, walk.stationary, 1e-10);
  const early = core.walkDistribution(graph, "a", 2);
  const late = core.walkDistribution(graph, "a", 2000);
  assert.ok(late.totalVariation < early.totalVariation);
  assert.ok(late.totalVariation < 1e-6);
});

test("несвязность и изолированные вершины не получают ложного обещания смешивания", function () {
  assert.equal(core.lazyWalk(core.preset("disconnected")).uniqueStationary, false);
  assert.equal(core.lazyWalk(core.preset("isolate")).uniqueStationary, false);
  const isolated = core.walkDistribution(core.preset("isolate"), "z", 100);
  assert.equal(isolated.distribution[3], 1);
});

test("малый решатель Lx=b проверяет совместимость и невязку", function () {
  const solved = core.solveLaplacian(core.preset("path4"), [1, 0, 0, -1]);
  assert.ok(solved.residualNorm < 1e-8);
  assert.throws(function () { core.solveLaplacian(core.preset("path4"), [1, 0, 0, 0]); }, /нулевой/);
  assert.doesNotThrow(function () { core.solveLaplacian(core.preset("disconnected"), [1, -1, 2, -2]); });
  assert.throws(function () { core.solveLaplacian(core.preset("disconnected"), [1, 0, -1, 0]); }, /компоненте/);
});

test("нулевые веса, ошибки входа и безопасные пределы обрабатываются явно", function () {
  assert.deepEqual(core.supportComponents(core.preset("zeroEdge")), [["a", "b"], ["c"]]);
  assert.throws(function () { core.finiteWeight(-1); }, /от 0/);
  assert.throws(function () { core.normalizeGraph({ directed: true, nodes: [{ id: "a" }], edges: [] }); }, /неориентированный/);
  assert.throws(function () { core.normalizeGraph({ nodes: [{ id: "a" }], edges: [{ source: "a", target: "a", weight: 1 }] }); }, /Петли/);
  const nodes = Array.from({ length: core.MAX_NODES + 1 }, function (_, i) { return { id: "v" + i }; });
  assert.throws(function () { core.normalizeGraph({ nodes: nodes, edges: [] }); }, /от 0 до/);
});

test("playback неизменяем и seek выбирает точный порог", function () {
  const state = core.createState(core.preset("bottleneck"));
  assert.ok(Object.isFrozen(state));
  const next = core.step(state);
  assert.equal(state.playback.cursor, 0);
  assert.equal(next.playback.cursor, 1);
  const last = core.seek(state, state.playback.frames.length - 1);
  assert.equal(last.playback.finished, true);
  assert.equal(core.visualModel(last).frame.sideIds.length, state.graph.nodes.length - 1);
});

test("страница использует общие runtime и строгий контракт интерактивных формул", function () {
  const atlas = path.join(__dirname, "..");
  const chapter = fs.readFileSync(path.join(atlas, "chapters", "spectral-graph-algorithms.html"), "utf8");
  const adapter = fs.readFileSync(path.join(atlas, "labs", "spectral-graph-algorithms.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="spectral-graph-algorithms"/);
  assert.match(chapter, /data-atlas-lab="spectral-graph-algorithms"/);
  assert.match(chapter, /graph-lab-runtime\.js/);
  assert.doesNotMatch(chapter + adapter, /\beval\s*\(|\bFunction\s*\(/);
  assert.ok((chapter.match(/<details>/g) || []).length >= 20);
  const formulas = chapter.match(/<div\s+class="atlas-math atlas-notation-formula"[\s\S]*?<\/div>/g) || [];
  assert.ok(formulas.length >= 14);
  const formulaIds = formulas.map(function (formula) { return formula.match(/data-formula-id="([a-z0-9-]+)"/)[1]; });
  assert.equal(formulaIds.length, new Set(formulaIds).size);
  formulas.forEach(function (formula) {
    assert.match(formula, /data-notation-coverage="interactive"/);
    const required = formula.match(/data-required-notations="([a-z0-9,-]+)"/)[1].split(",");
    const tokens = Array.from(formula.matchAll(/notation-id-([a-z0-9-]+)/g), function (match) { return match[1]; });
    assert.equal(required.length, new Set(required).size);
    assert.equal(tokens.length, new Set(tokens).size, "в формуле нет повторных или вложенных токенов");
    assert.deepEqual(new Set(required), new Set(tokens));
  });
});
