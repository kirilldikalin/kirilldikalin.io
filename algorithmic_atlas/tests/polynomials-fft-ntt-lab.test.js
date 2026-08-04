"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/polynomials-fft-ntt-core.js");

function close(actual, expected, epsilon = 1e-8) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + " != " + expected); }

test("nextPowerOfTwo дополняет неполные длины без уменьшения", () => {
  assert.equal(core.nextPowerOfTwo(1), 1);
  assert.equal(core.nextPowerOfTwo(5), 8);
  assert.equal(core.nextPowerOfTwo(64), 64);
  assert.throws(() => core.nextPowerOfTwo(65), /64/);
});

test("обратная FFT восстанавливает исходные коэффициенты", () => {
  const input = [1, -2, 3.5, 4, 0, 7];
  const transformed = core.fftFrames(input, false).at(-1).values;
  const restored = core.fftFrames(transformed, true).at(-1).values;
  input.forEach((value, index) => { close(restored[index].re, value); close(restored[index].im, 0); });
});

test("FFT-свёртка совпадает с прямой свёрткой", () => {
  const left = [3, -1, 4, 1], right = [5, 9, -2];
  const expected = core.naiveConvolution(left, right);
  const actual = core.fftConvolution(left, right);
  expected.forEach((value, index) => close(actual[index], value, 1e-7));
});

test("NTT и обратное NTT образуют точную пару", () => {
  const input = [1n, 2n, 3n, 998244352n, 17n];
  const transformed = core.nttFrames(input, false).at(-1).values;
  const restored = core.nttFrames(transformed, true).at(-1).values;
  input.forEach((value, index) => assert.equal(restored[index], value));
});

test("точная NTT-свёртка совпадает с BigInt по модулю", () => {
  const left = [1000000000n, -3n, 17n], right = [9n, 8n, -7n, 6n];
  const expected = new Array(left.length + right.length - 1).fill(0n);
  left.forEach((a, i) => right.forEach((b, j) => { expected[i + j] = (expected[i + j] + a * b) % core.NTT_MODULUS; }));
  const actual = core.nttConvolution(left, right);
  expected.forEach((value, index) => assert.equal(actual[index], (value + core.NTT_MODULUS) % core.NTT_MODULUS));
});

test("неподходящий модуль явно отклоняет отсутствующий корень", () => {
  assert.throws(() => core.nttFrames([1n, 2n, 3n, 4n], false, 11n, 2n), /не делит/);
});

test("NTT отклоняет генератор с корнем меньшего порядка", () => {
  assert.throws(
    () => core.nttFrames([1n, 2n, 3n, 4n], false, 17n, 4n),
    /точного порядка/
  );
});

test("подходящий корень даёт точную свёртку и для малого поля", () => {
  assert.deepEqual(core.nttConvolution([1n, 2n], [3n, 4n], 17n), [3n, 10n, 8n]);
});

test("парсер различает Number и BigInt и запрещает NaN", () => {
  assert.deepEqual(core.parseCoefficients("1, -2, 3", false), [1, -2, 3]);
  assert.deepEqual(core.parseCoefficients("1, -2, 3", true), [1n, -2n, 3n]);
  assert.throws(() => core.parseCoefficients("1, nope", false), /конечным/);
});

test("комплексная FFT явно сообщает о переполнении Number", () => {
  assert.throws(() => core.fftConvolution([1e308, 1e308], [1e308, 1e308]), /диапазон Number/);
});

test("playback проходит каждую butterfly-стадию и остаётся неизменяемым", () => {
  let state = core.createState({ coefficients: "1,2,3,4" });
  assert.ok(Object.isFrozen(state));
  while (!state.finished) state = core.step(state);
  assert.equal(state.current.phase, "done");
  assert.equal(core.reset(state).cursor, 0);
});

test("страница и адаптер используют общий контракт численной лаборатории", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/polynomials-fft-ntt.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/polynomials-fft-ntt.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="polynomials-fft-ntt"/);
  assert.match(chapter, /data-atlas-block="lab"[^>]*>[\s\S]*data-atlas-lab="polynomials-fft-ntt"/);
  assert.match(chapter, /numeric-lab-core\.js/);
  assert.match(chapter, /numeric-lab-runtime\.js/);
  assert.match(chapter, /numeric-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.doesNotMatch(chapter.match(/class="atlas-chapter-intro">([^<]+)/)[1], /[.!?…]$/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
