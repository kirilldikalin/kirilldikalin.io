"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/matrices-linear-systems-stability-core.js");

function close(actual, expected, epsilon = 1e-9) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + " != " + expected); }

test("наивное и Strassen-умножение совпадают", () => {
  const matrix = [[1, 2, 3, 4], [5, 6, 7, 8], [2, 0, 1, 3], [-1, 4, 2, 5]];
  assert.deepEqual(core.strassenMultiply(matrix, matrix).result, core.multiplyMatrices(matrix, matrix));
});

test("Strassen дополняет порядок, не являющийся степенью двойки", () => {
  const matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
  assert.deepEqual(core.strassenMultiply(matrix, matrix).result, core.multiplyMatrices(matrix, matrix));
});

test("Гаусс с pivoting решает стандартную систему", () => {
  const solution = core.solve([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3], true);
  [2, 3, -1].forEach((value, index) => close(solution[index], value));
});

test("частичный выбор pivot спасает систему с нулём на диагонали", () => {
  const matrix = [[0, 1], [1, 1]], vector = [1, 2];
  assert.throws(() => core.solve(matrix, vector, false), /вырождена/);
  const solution = core.solve(matrix, vector, true);
  close(solution[0], 1); close(solution[1], 1);
});

test("критерий pivot сохраняет хорошо обусловленную систему при масштабировании", () => {
  const scale = 1e-12;
  const solution = core.solve([[scale, 0], [0, scale]], [scale, scale], true);
  close(solution[0], 1);
  close(solution[1], 1);
});

test("вырожденная матрица не выдаёт ложного решения", () => {
  assert.throws(() => core.solve([[1, 2], [2, 4]], [3, 6], true), /вырождена/);
});

test("остаток решения согласован с исходной системой", () => {
  const matrix = [[3, 1], [1, 2]], vector = [9, 8], solution = core.solve(matrix, vector, true);
  core.residual(matrix, solution, vector).forEach((value) => close(value, 0));
});

test("матрицы Гильберта демонстрируют рост обусловленности", () => {
  assert.ok(core.conditionInfinity(core.hilbert(5)) > core.conditionInfinity(core.hilbert(2)));
});

test("итерационное уточнение не создаёт NaN и сохраняет конечный residual", () => {
  const frames = core.iterativeRefinementFrames([[10, 7, 8], [7, 5, 6], [8, 6, 10]], [25, 18, 24], 5);
  frames.forEach((frame) => assert.ok(Number.isFinite(frame.residualNorm)));
  assert.ok(frames.at(-1).residualNorm <= frames[0].residualNorm + 1e-15);
});

test("парсер ловит несовпадающие размеры и бесконечности", () => {
  assert.throws(() => core.parseMatrix("1,2;3"), /одинаковую/);
  assert.throws(() => core.parseVector("1,2,3", 2), /ровно 2/);
  assert.throws(() => core.parseMatrix("1,Infinity;0,1"), /конечным/);
});

test("матричные операции отклоняют промежуточное переполнение Number", () => {
  assert.throws(() => core.multiplyMatrices([[1e308]], [[1e308]]), /диапазон Number/);
  assert.throws(
    () => core.solve([[1e308, 1e308], [1e308, -1e308]], [1, 1], true),
    /диапазон Number/
  );
});

test("режим Strassen честно сообщает о возможном округлении", () => {
  const frame = core.createState({ mode: "strassen", matrix: [[1, 2], [3, 4]], vector: [0, 0] }).frames.at(-1);
  assert.match(frame.message, /округление возможно/);
  assert.doesNotMatch(frame.message, /точное/);
});

test("playback поддерживает step, reset и конечное состояние", () => {
  let state = core.createState();
  assert.ok(Object.isFrozen(state));
  assert.equal(core.step(state).cursor, 1);
  while (!state.finished) state = core.step(state);
  assert.equal(state.current.phase, "done");
  assert.equal(core.reset(state).cursor, 0);
});

test("страница и адаптер используют общий контракт численной лаборатории", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/matrices-linear-systems-stability.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/matrices-linear-systems-stability.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="matrices-linear-systems-stability"/);
  assert.match(chapter, /data-atlas-block="lab"[^>]*>[\s\S]*data-atlas-lab="matrices-linear-systems-stability"/);
  assert.match(chapter, /numeric-lab-core\.js/);
  assert.match(chapter, /numeric-lab-runtime\.js/);
  assert.match(chapter, /numeric-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.doesNotMatch(chapter.match(/class="atlas-chapter-intro">([^<]+)/)[1], /[.!?…]$/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
