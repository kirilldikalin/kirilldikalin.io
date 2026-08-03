"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const matrixCore = require("../labs/graph-matrix-core.js");
const linearCore = require("../labs/linear-algebra-for-graphs-core.js");
const spectralCore = require("../labs/spectral-graph-algorithms-core.js");

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    (label || "значения различаются") + ": " + actual + " vs " + expected);
}

function generatedLoopFreeGraph(seed) {
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  const size = 2 + next() % 7;
  const nodes = Array.from({ length: size }, function (_, index) { return { id: "v" + index }; });
  const edges = [];
  for (let left = 0; left < size; left += 1) {
    for (let right = left + 1; right < size; right += 1) {
      if (next() % 3 === 0) {
        edges.push({
          id: "e" + edges.length,
          source: nodes[left].id,
          target: nodes[right].id,
          directed: false,
          weight: next() % 10,
        });
      }
    }
  }
  return { directed: false, nodes: nodes, edges: edges };
}

test("общие матричные примитивы поддерживают квадратные и прямоугольные размеры", function () {
  assert.deepEqual(matrixCore.zeroMatrix(2, 3), [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(matrixCore.zeroMatrix(2), [[0, 0], [0, 0]]);
  assert.deepEqual(matrixCore.identityMatrix(3), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual(matrixCore.zeroMatrix(0, 4), []);
  assert.throws(function () { matrixCore.zeroMatrix(-1, 2); }, /от 0 до 10000/);
});

test("единый построитель сохраняет конвенцию петель и параллельных рёбер главы 5.12", function () {
  const graph = {
    directed: false,
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { id: "e1", source: "a", target: "b", directed: false, weight: 2 },
      { id: "e2", source: "a", target: "b", directed: false, weight: 3 },
      { id: "e3", source: "b", target: "c", directed: false, weight: 1 },
      { id: "e4", source: "c", target: "c", directed: false, weight: 4 },
    ],
  };
  const matrices = matrixCore.undirectedMatrices(graph);
  assert.deepEqual(matrices.adjacency, [[0, 5, 0], [5, 0, 1], [0, 1, 8]]);
  assert.deepEqual(matrices.degrees, [5, 6, 9]);
  assert.deepEqual(matrices.degreeMatrix, [[5, 0, 0], [0, 6, 0], [0, 0, 9]]);
  assert.deepEqual(matrices.laplacian, [[5, -5, 0], [-5, 6, -1], [0, -1, 1]]);
  assert.deepEqual(matrixCore.undirectedMatrices({ directed: false, nodes: [{ id: "z" }], edges: [] }).normalizedLaplacian, [[0]]);
});

test("обёртки 5.12 и 5.13 получают одинаковые матрицы на общей области определения", function () {
  for (let seed = 1; seed <= 100; seed += 1) {
    const graph = generatedLoopFreeGraph(seed);
    const spectral = spectralCore.matrices(graph);
    assert.deepEqual(linearCore.adjacencyMatrix(graph), spectral.adjacency, "A, seed=" + seed);
    assert.deepEqual(linearCore.degreeValues(graph), spectral.degrees, "d, seed=" + seed);
    assert.deepEqual(linearCore.laplacianMatrix(graph), spectral.laplacian, "L, seed=" + seed);
    assert.deepEqual(linearCore.normalizedLaplacian(graph), spectral.normalized, "normalized L, seed=" + seed);
  }
});

test("векторные операции и невязка собственного вектора согласованы", function () {
  assert.equal(matrixCore.dot([1, 2, 3], [4, 5, 6]), 32);
  assert.equal(matrixCore.norm([3, 4]), 5);
  assert.deepEqual(matrixCore.multiply([[2, 0], [0, 3]], [5, 7]), [10, 21]);
  assert.equal(matrixCore.residualNorm([[2, 0], [0, 3]], 2, [1, 0]), 0);
  assert.throws(function () { matrixCore.dot([1], [1, 2]); }, /одной длины/);
  assert.throws(function () { matrixCore.multiply([[1, 2]], [1]); }, /не согласованы/);
});

test("общий масштабированный Якоби воспроизводит известный спектр и большой масштаб", function () {
  const path = matrixCore.undirectedMatrices({
    directed: false,
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [
      { source: "a", target: "b", directed: false, weight: 1 },
      { source: "b", target: "c", directed: false, weight: 1 },
      { source: "c", target: "d", directed: false, weight: 1 },
    ],
  });
  const spectrum = matrixCore.symmetricEigen(path.laplacian);
  const expected = [0, 2 - Math.sqrt(2), 2, 2 + Math.sqrt(2)];
  expected.forEach(function (value, index) { close(spectrum.values[index], value, 1e-9, "P4"); });
  assert.equal(spectrum.converged, true);
  spectrum.vectors.forEach(function (vector, index) {
    close(matrixCore.norm(vector), 1, 1e-10, "норма");
    assert.ok(matrixCore.residualNorm(path.laplacian, spectrum.values[index], vector) < 1e-8);
  });

  const scale = 1000000000;
  const large = [[scale, -scale], [-scale, scale]];
  const largeSpectrum = matrixCore.symmetricEigen(large);
  assert.deepEqual(largeSpectrum.values, [0, 2 * scale]);
  largeSpectrum.vectors.forEach(function (vector, index) {
    const relativeResidual = matrixCore.residualNorm(large, largeSpectrum.values[index], vector) / scale;
    assert.ok(relativeResidual < 1e-12);
  });
  assert.throws(function () { matrixCore.symmetricEigen([[1, 2], [0, 1]]); }, /симметричную/);
});

test("публичные формы результата и локальная семантика поддержки не изменились", function () {
  assert.deepEqual(linearCore.eigenSymmetric([]), { values: [], vectors: [] });
  assert.deepEqual(spectralCore.symmetricEigen([]), {
    values: [], vectors: [], residuals: [], converged: true, iterations: 0,
  });
  assert.doesNotThrow(function () {
    linearCore.normalizeGraph({ nodes: [{ id: "a" }], edges: [{ source: "a", target: "a", weight: 1 }] });
  });
  assert.throws(function () {
    spectralCore.normalizeGraph({ nodes: [{ id: "a" }], edges: [{ source: "a", target: "a", weight: 1 }] });
  }, /Петли/);
  const tiny = spectralCore.normalizeGraph({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b", weight: 1e-11 }],
  });
  assert.deepEqual(spectralCore.supportComponents(tiny), [["a"], ["b"]]);
});

test("обе браузерные страницы загружают общее ядро до специализированного", function () {
  const atlas = path.join(__dirname, "..");
  ["linear-algebra-for-graphs", "spectral-graph-algorithms"].forEach(function (name) {
    const chapter = fs.readFileSync(path.join(atlas, "chapters", name + ".html"), "utf8");
    const matrixPosition = chapter.indexOf("../labs/graph-matrix-core.js");
    const chapterPosition = chapter.indexOf("../labs/" + name + "-core.js");
    assert.ok(matrixPosition >= 0, name + " подключает graph-matrix-core.js");
    assert.ok(matrixPosition < chapterPosition, name + " загружает общее ядро первым");
  });
});
