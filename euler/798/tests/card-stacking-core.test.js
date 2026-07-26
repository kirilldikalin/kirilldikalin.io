"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

require("../interactive/card-stacking-core.js");

const core = globalThis.Euler798Core;

test("closed Grundy formula agrees with recursive mex on small decks", () => {
  for (let n = 1; n <= 9; n += 1) {
    const byFormula = core.enumerateDistribution(n);
    const byMex = core.enumerateDistribution(n, core.grundyByMex);
    assert.deepEqual(byFormula, byMex);
  }
});

test("frequency formulas reproduce the complete small distributions", () => {
  const expected = [
    [2],
    [3, 1],
    [4, 3, 1],
    [6, 6, 3, 1],
    [10, 11, 6, 4, 1],
    [18, 20, 11, 10, 4, 1],
  ];

  expected.forEach((distribution, index) => {
    const n = index + 1;
    assert.deepEqual(core.formulaDistribution(n), distribution);
    assert.deepEqual(core.enumerateDistribution(n), distribution);
    assert.equal(distribution.reduce((sum, value) => sum + value, 0), 2 ** n);
  });
});

test("Hadamard stages square to the expected scaled identity", () => {
  const values = [4, 3, 1, 0];
  const transformed = core.hadamardStages(values).at(-1);
  const restored = core.hadamardStages(transformed).at(-1);
  assert.deepEqual(restored, values.map((value) => value * values.length));
});

test("XOR convolution reproduces both published checks", () => {
  assert.equal(core.xorZeroCount(core.formulaDistribution(3), 2), 26);
  assert.equal(
    core.xorZeroCountMod(core.formulaDistribution(13), 4),
    540_318_329n,
  );
});
