"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/traveling-salesman-exact-core.js");

function result(mode, instance) {
  return core.buildTrace(instance, { mode: mode });
}

function costOf(instance, tourIds) {
  if (tourIds === null) return null;
  const byId = new Map(instance.cities.map(function (city, index) { return [city.id, index]; }));
  return core.tourCost(instance, tourIds.map(function (id) { return byId.get(id); }));
}

function assertHamiltonian(trace) {
  if (trace.tour === null) return;
  const n = trace.instance.cities.length;
  if (n === 0) { assert.deepEqual(trace.tour, []); return; }
  assert.equal(trace.tour.length, n + 1);
  assert.equal(trace.tour[0], trace.tour[trace.tour.length - 1]);
  assert.equal(new Set(trace.tour.slice(0, -1)).size, n);
  assert.equal(costOf(trace.instance, trace.tour).toString(), trace.cost);
}

function deterministicMatrix(seed, n, symmetric) {
  let value = seed >>> 0;
  function random() {
    value = (1664525 * value + 1013904223) >>> 0;
    return value;
  }
  const matrix = Array.from({ length: n }, function () { return Array(n).fill(0); });
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      if (symmetric && j < i) matrix[i][j] = matrix[j][i];
      else matrix[i][j] = 1 + random() % 50;
    }
  }
  return {
    id: "random-" + seed,
    symmetric: symmetric,
    cities: Array.from({ length: n }, function (_, index) { return { id: "v" + index, x: index, y: index % 3 }; }),
    matrix: matrix,
  };
}

test("три точных метода совпадают с полным перебором на сценариях", function () {
  ["metric", "multiple", "asymmetric", "violation", "huge"].forEach(function (name) {
    const instance = core.preset(name);
    const oracle = result("brute-force", instance);
    ["held-karp", "branch-bound"].forEach(function (mode) {
      const actual = result(mode, instance);
      assert.equal(actual.cost, oracle.cost, name + ": " + mode);
      assertHamiltonian(actual);
    });
    assertHamiltonian(oracle);
  });
});

test("Held–Karp и ветвление совпадают с оракулом на детерминированных матрицах", function () {
  for (let seed = 1; seed <= 36; seed += 1) {
    const n = 3 + seed % 5;
    [true, false].forEach(function (symmetric) {
      const instance = deterministicMatrix(seed * 97 + (symmetric ? 1 : 2), n, symmetric);
      const oracle = result("brute-force", instance);
      const dynamic = result("held-karp", instance);
      const bounded = result("branch-bound", instance);
      assert.equal(dynamic.cost, oracle.cost, "DP seed=" + seed + ", symmetric=" + symmetric);
      assert.equal(bounded.cost, oracle.cost, "B&B seed=" + seed + ", symmetric=" + symmetric);
      assertHamiltonian(dynamic);
      assertHamiltonian(bounded);
    });
  }
});

test("Held–Karp строит состояния подмножеств и восстанавливает допустимый тур", function () {
  const trace = result("held-karp", core.preset("metric"));
  assert.ok(trace.states > 0);
  assert.ok(trace.frames.some(function (frame) { return frame.reason === "base"; }));
  assert.ok(trace.frames.some(function (frame) { return frame.reason === "recurrence" && frame.predecessor; }));
  assert.equal(trace.frames.at(-1).reason, "dp-complete");
  assertHamiltonian(trace);
});

test("несколько оптимальных туров не ломают детерминированную реконструкцию", function () {
  const instance = core.preset("multiple");
  const brute = result("brute-force", instance);
  const optimalCandidates = brute.frames.filter(function (frame) { return frame.cost === brute.cost; });
  assert.ok(optimalCandidates.length >= 6);
  assert.deepEqual(result("held-karp", instance).tour, result("held-karp", instance).tour);
});

test("пустой граф, один город и отсутствие цикла обработаны явно", function () {
  const empty = { cities: [], matrix: [], symmetric: true };
  const singleton = { cities: [{ id: "A" }], matrix: [[0]], symmetric: true };
  ["brute-force", "held-karp", "branch-bound"].forEach(function (mode) {
    assert.deepEqual(result(mode, empty).tour, []);
    assert.equal(result(mode, empty).cost, "0");
    assert.deepEqual(result(mode, singleton).tour, ["A", "A"]);
    assert.equal(result(mode, core.preset("noTour")).tour, null);
  });
});

test("BigInt сохраняет точность далеко за Number.MAX_SAFE_INTEGER", function () {
  const instance = core.preset("huge");
  const expected = 2400719925474099312345678n;
  ["brute-force", "held-karp", "branch-bound"].forEach(function (mode) {
    assert.equal(BigInt(result(mode, instance).cost), expected);
  });
  assert.throws(function () { core.parseDistance(Number.MAX_SAFE_INTEGER + 1); }, /строкой/);
});

test("метричность и метрическое замыкание находят нарушение треугольника", function () {
  const metric = core.metricAnalysis(core.preset("metric"));
  const violationInstance = core.preset("violation");
  const violation = core.metricAnalysis(violationInstance);
  assert.equal(metric.metric, true);
  assert.equal(violation.metric, false);
  assert.ok(violation.violations.some(function (item) { return item.from === "A" && item.via === "B" && item.to === "C"; }));
  const closureMatrix = core.metricClosure(violationInstance);
  const closure = {
    symmetric: true,
    cities: violationInstance.cities,
    matrix: closureMatrix,
  };
  assert.equal(core.metricAnalysis(closure).metric, true);
  for (let i = 0; i < closureMatrix.length; i += 1) for (let j = 0; j < closureMatrix.length; j += 1) {
    assert.ok(BigInt(closureMatrix[i][j]) <= BigInt(violationInstance.matrix[i][j]));
  }
});

test("MST- и 1-tree-границы не превосходят оптимальный тур", function () {
  ["metric", "multiple", "violation"].forEach(function (name) {
    const instance = core.preset(name);
    const optimum = BigInt(result("brute-force", instance).cost);
    assert.ok(core.mstWeight(instance) <= optimum);
    assert.ok(core.oneTreeBound(instance) <= optimum);
  });
  assert.equal(core.mstWeight(core.preset("asymmetric")), null);
  assert.equal(core.oneTreeBound(core.preset("asymmetric")), null);
});

test("каждое отсечение по границе сопровождается проверяемой причиной", function () {
  const trace = result("branch-bound", core.preset("metric"));
  const pruned = trace.frames.filter(function (frame) { return frame.reason === "bound-not-better"; });
  assert.ok(pruned.length > 0);
  pruned.forEach(function (frame) {
    assert.ok(BigInt(frame.lowerBound) >= BigInt(frame.incumbent));
    assert.equal(frame.stage, "prune");
  });
  assert.ok(trace.nodes < result("brute-force", core.preset("metric")).permutations);
});

test("воспроизведение неизменяемо и достигает последнего кадра", function () {
  const state = core.createState(core.preset("metric"), { mode: "held-karp" });
  assert.ok(Object.isFrozen(state));
  const next = core.step(state);
  assert.equal(state.playback.cursor, 0);
  assert.equal(next.playback.cursor, 1);
  const done = core.seek(state, state.trace.frames.length - 1);
  assert.equal(done.playback.finished, true);
  assert.equal(core.visualModel(done).frame.reason, "dp-complete");
});

test("валидация ограничивает размер, веса и режим", function () {
  const tooMany = Array.from({ length: core.MAX_CITIES + 1 }, function (_, i) { return { id: "v" + i }; });
  assert.throws(function () { core.normalizeInstance({ cities: tooMany, matrix: tooMany.map(function () { return Array(tooMany.length).fill(0); }) }); }, /не больше/);
  assert.throws(function () { core.normalizeInstance({ symmetric: true, cities: [{ id: "A" }, { id: "B" }], matrix: [[0, 1], [2, 0]] }); }, /разные встречные/);
  assert.throws(function () { core.parseDistance("-1"); }, /неотрицательное/);
  assert.throws(function () { core.buildTrace(core.preset("metric"), { mode: "unknown" }); }, /Неизвестный/);
});

test("страница использует общий runtime, не содержит eval и соблюдает контракт формул", function () {
  const root = path.join(__dirname, "..");
  const chapter = fs.readFileSync(path.join(root, "chapters", "traveling-salesman-exact.html"), "utf8");
  const adapter = fs.readFileSync(path.join(root, "labs", "traveling-salesman-exact.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="traveling-salesman-exact"/);
  assert.match(chapter, /data-atlas-lab="traveling-salesman-exact"/);
  assert.match(chapter, /graph-lab-runtime\.js/);
  assert.match(chapter, /traveling-salesman-exact-core\.js/);
  assert.match(chapter, /traveling-salesman-exact\.js/);
  assert.doesNotMatch(chapter + adapter, /\beval\s*\(/);
  assert.ok((chapter.match(/<details>/g) || []).length >= 10);
  assert.ok((chapter.match(/data-formula-id=/g) || []).length >= 12);
  const formulas = chapter.match(/<div\s+class="atlas-math atlas-notation-formula"[\s\S]*?<\/div>/g) || [];
  const formulaIds = formulas.map(function (formula) { return formula.match(/data-formula-id="([a-z0-9-]+)"/)[1]; });
  assert.equal(formulaIds.length, new Set(formulaIds).size, "ID формул уникальны");
  formulas.forEach(function (formula) {
    const required = (formula.match(/data-required-notations="([a-z0-9,-]+)"/) || [])[1];
    assert.ok(required);
    const requiredIds = required.split(",");
    const tokenIds = Array.from(formula.matchAll(/notation-id-([a-z0-9-]+)/g), function (match) { return match[1]; });
    assert.deepEqual(new Set(requiredIds), new Set(tokenIds));
    assert.equal(requiredIds.length, new Set(requiredIds).size);
    assert.equal(tokenIds.length, new Set(tokenIds).size, "в одной формуле нет вложенных или повторных токенов");
  });
});
