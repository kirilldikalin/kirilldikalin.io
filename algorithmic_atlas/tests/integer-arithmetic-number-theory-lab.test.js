"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/integer-arithmetic-number-theory-core.js");

function finish(state) { while (!state.finished) state = core.step(state); return state; }

test("Евклид и коэффициенты Безу согласованы для знаков и нулей", () => {
  [[1071n, 462n], [-240n, 46n], [0n, 37n], [0n, 0n]].forEach(([a, b]) => {
    const frame = core.euclidFrames(a, b).at(-1);
    assert.equal(a * frame.x + b * frame.y, frame.gcd);
    assert.equal(frame.gcd, function gcd(x, y) { x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x; }(a, b));
  });
});

test("binary GCD совпадает с классическим на сетке малых значений", () => {
  for (let a = -40n; a <= 40n; a += 1n) for (let b = -40n; b <= 40n; b += 1n) {
    assert.equal(core.binaryGcd(a, b), core.euclidFrames(a, b).at(-1).gcd);
  }
});

test("двоичная степень сохраняет точное модульное значение", () => {
  const state = finish(core.createState({ mode: "power", a: "12345678901234567890", b: "12345", modulus: "1000000007" }));
  let direct = 1n, base = 12345678901234567890n % 1000000007n, exponent = 12345n;
  while (exponent) { if (exponent & 1n) direct = direct * base % 1000000007n; base = base * base % 1000000007n; exponent >>= 1n; }
  assert.equal(state.current.result, direct);
});

test("нулевая степень и отрицательное основание обработаны явно", () => {
  assert.equal(core.powerFrames(-7n, 0n, 13n).at(-1).result, 1n);
  assert.equal(core.powerFrames(-7n, 3n, 13n).at(-1).result, 8n);
  assert.throws(() => core.powerFrames(2n, -1n, 7n), /неотрицательным/);
});

test("безмодульная степень отклоняется до построения чрезмерного BigInt", () => {
  const excessiveExponent = core.MAX_UNMODULAR_POWER_BITS + 1n;
  assert.throws(() => core.powerFrames(2n, excessiveExponent, null), /безопасную границу/);
  assert.equal(core.powerFrames(2n, 64n, null).at(-1).result, 1n << 64n);
  assert.equal(core.powerFrames(-1n, excessiveExponent, null).at(-1).result, -1n);
});

test("Карацуба совпадает с BigInt на разных длинах и знаках", () => {
  const pairs = [[0n, 99n], [12n, 34n], [12345678n, 87654321n], [-999999999999n, 123456789n]];
  pairs.forEach(([a, b]) => assert.equal(core.karatsubaTrace(a, b).result, a * b));
});

test("ограничения визуальной трассы не допускают взрыва рекурсии", () => {
  assert.throws(() => core.karatsubaTrace(10n ** 81n, 2n), /80/);
  assert.throws(() => core.createState({ mode: "unknown" }), /Неизвестный/);
});

test("playback неизменяем, поддерживает step, seek и reset", () => {
  const state = core.createState({ mode: "euclid", a: "55", b: "34" });
  assert.ok(Object.isFrozen(state));
  assert.equal(core.step(state).cursor, 1);
  assert.equal(core.seek(state, state.frames.length - 1).finished, true);
  assert.equal(core.reset(core.step(state)).cursor, 0);
});

test("страница и адаптер используют общий контракт численной лаборатории", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/integer-arithmetic-number-theory.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/integer-arithmetic-number-theory.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="integer-arithmetic-number-theory"/);
  assert.match(chapter, /data-atlas-block="lab"[^>]*>[\s\S]*data-atlas-lab="integer-arithmetic-number-theory"/);
  assert.match(chapter, /numeric-lab-core\.js/);
  assert.match(chapter, /numeric-lab-runtime\.js/);
  assert.match(chapter, /numeric-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.doesNotMatch(chapter.match(/class="atlas-chapter-intro">([^<]+)/)[1], /[.!?…]$/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
