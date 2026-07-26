"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

require("../interactive/alternating-difference-core.js");

const core = globalThis.Euler1007Core;

test("tree counts follow the Catalan numbers used by the article", () => {
  const catalan = [1, 1, 2, 5, 14, 42, 132, 429];

  for (let n = 0; n <= 7; n += 1) {
    assert.equal(core.generateTrees(0, n + 1).length, catalan[n]);
  }
});

test("right edges produce the displayed coefficient polynomial for n=3", () => {
  const trees = core.generateTrees(0, 4);
  assert.deepEqual(core.aggregateCoefficients(trees, 4), [5, -5, 1, -1]);
});

test("tree values and aggregated coefficients give the same A(n)", () => {
  const expected = [0, -1, -2, -6, -20, -76, -314, -1409];

  for (let n = 0; n <= 7; n += 1) {
    const trees = core.generateTrees(0, n + 1);
    const fibonacci = core.fibonacciNumbers(n + 1);
    const directSum = trees.reduce(
      (sum, tree) => sum + core.evaluateTree(tree, fibonacci),
      0,
    );
    const coefficients = core.aggregateCoefficients(trees, n + 1);
    const coefficientSum = coefficients.reduce(
      (sum, coefficient, index) => sum + coefficient * fibonacci[index],
      0,
    );

    assert.equal(directSum, coefficientSum);
    assert.equal(directSum, expected[n]);
  }
});
