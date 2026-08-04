"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/modular-algorithms-primality-core.js");

function finish(state) { while (!state.finished) state = core.step(state); return state; }

test("обратный элемент существует ровно при взаимной простоте", () => {
  assert.equal(17n * core.modularInverse(17n, 43n) % 43n, 1n);
  assert.throws(() => core.modularInverse(6n, 15n), /не существует/);
});

test("CRT объединяет взаимно простые и совместимые непростые модули", () => {
  const coprime = core.crtFrames([{ residue: "2", modulus: "3" }, { residue: "3", modulus: "5" }, { residue: "2", modulus: "7" }]).at(-1).current;
  assert.deepEqual(coprime, { residue: 23n, modulus: 105n });
  const compatible = core.combineCongruences({ residue: 2n, modulus: 6n }, { residue: 5n, modulus: 9n });
  assert.deepEqual(compatible, { residue: 14n, modulus: 18n });
});

test("несовместимая система сравнений отклоняется", () => {
  assert.throws(() => core.combineCongruences({ residue: 0n, modulus: 4n }, { residue: 1n, modulus: 2n }), /несовместна/);
});

test("разложение n−1 корректно отделяет степень двойки", () => {
  assert.deepEqual(core.decomposeMinusOne(561n), { s: 4, d: 35n });
});

test("детерминированные основания классифицируют контрольный набор меньше 2^64", () => {
  [2n, 3n, 5n, 97n, 2147483647n, 18446744073709551557n].forEach((n) => assert.equal(core.isPrime64(n), true, String(n)));
  [0n, 1n, 4n, 9n, 341n, 561n, 1105n, 3215031751n].forEach((n) => assert.equal(core.isPrime64(n), false, String(n)));
  assert.throws(() => core.isPrime64(1n << 64n), /2\^64/);
});

test("witness строит конечную цепочку и распознаёт сертификат составности", () => {
  const trace = core.witnessTrace(561n, 2n);
  assert.equal(trace.at(-1).composite, true);
  assert.ok(trace.length <= trace[0].s + 2);
});

test("witness не выдаёт простое за составное на тривиальном основании", () => {
  assert.equal(core.witnessTrace(3n, 2n).at(-1).passed, true);
  assert.throws(() => core.witnessTrace(5n, 5n), /от 2 до n−2/);
  assert.throws(() => core.decomposeMinusOne(1n), /n ≥ 3/);
});

test("число сравнений и длина видимой witness-цепочки ограничены", () => {
  const tooMany = Array.from({ length: core.MAX_CRT_CONGRUENCES + 1 }, (_, index) => ({ residue: String(index), modulus: "101" }));
  assert.throws(() => core.crtFrames(tooMany), /не более/);
  const highPowerOfTwo = (1n << BigInt(core.MAX_WITNESS_FRAMES + 2)) + 1n;
  assert.throws(() => core.witnessTrace(highPowerOfTwo, 2n), /слишком много/);
});

test("агрегированная окружность сохраняет относительное положение остатка", () => {
  assert.equal(core.aggregateResidueSector(0n, 25n, 16), 0);
  assert.equal(core.aggregateResidueSector(12n, 25n, 16), 7);
  assert.equal(core.aggregateResidueSector(24n, 25n, 16), 15);
  assert.equal(core.aggregateResidueSector(-1n, 25n, 16), 15);
});

test("максимальная допустимая witness-цепочка помещается в шесть строк", () => {
  const n = (1n << 94n) + 1n;
  const trace = core.witnessTrace(n, 2n);
  assert.equal(trace.length, 95);
  assert.ok(Math.ceil(trace.length / 16) <= 6);
});

test("решето воспроизводит простые до 30 и проверяет границу", () => {
  assert.deepEqual(core.sieve(30), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  assert.throws(() => core.sieve(1000001), /1000000/);
});

test("сравнение методов отделяет точную проверку, вероятностный раунд и концептуальный AKS", () => {
  const carmichael = core.comparisonFrames(561n, 2n);
  assert.deepEqual(carmichael.map((frame) => frame.phase), [
    "trial", "sieve", "fermat", "miller-rabin", "aks",
  ]);
  assert.match(carmichael[0].result, /делитель 3/);
  assert.match(carmichael[2].result, /простота не доказана/);
  assert.match(carmichael[3].result, /составное/);
  assert.match(carmichael[4].result, /не фиктивный benchmark/);

  const prime = core.comparisonFrames(97n, 5n);
  assert.match(prime[0].result, /точно простое/);
  assert.match(prime[3].result, /простое в 64-битном диапазоне/);
  assert.equal(core.integerSqrt(10n), 3n);
});

test("аналитический режим не запускает огромный пробный цикл", () => {
  const large = 18446744073709551557n;
  const frames = core.comparisonFrames(large, 2n);
  assert.match(frames[0].result, /только оценка/);
  assert.equal(frames.length, 5);
  assert.throws(() => core.comparisonFrames(1n, 2n), /n ≥ 2/);
});

test("оба режима используют общий неизменяемый playback", () => {
  [core.createState(), core.createState({ mode: "crt" })].forEach((state) => {
    assert.ok(Object.isFrozen(state));
    assert.equal(core.step(state).cursor, Math.min(1, state.frames.length - 1));
    assert.equal(finish(state).finished, true);
  });
});

test("страница и адаптер используют общий контракт численной лаборатории", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/modular-algorithms-primality.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/modular-algorithms-primality.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="modular-algorithms-primality"/);
  assert.match(chapter, /data-atlas-block="lab"[^>]*>[\s\S]*data-atlas-lab="modular-algorithms-primality"/);
  assert.match(chapter, /numeric-lab-core\.js/);
  assert.match(chapter, /numeric-lab-runtime\.js/);
  assert.match(chapter, /numeric-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.doesNotMatch(chapter.match(/class="atlas-chapter-intro">([^<]+)/)[1], /[.!?…]$/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.match(adapter, /drawWitnessChain/);
  assert.match(adapter, /role:\s*"listitem"/);
  assert.match(adapter, /aria-label.*exactLabel/);
  assert.doesNotMatch(adapter, /residue\s*%\s*16n/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
