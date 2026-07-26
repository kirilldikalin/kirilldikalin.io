const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../interactive/toriangulations-core.js");

test("integer square root is exact around large boundaries", () => {
  const root = 1_732_050_807n;
  const value = 3n * 1_000_000_000n ** 2n;
  assert.equal(core.integerSquareRoot(value), root);
  assert.ok(root * root < value);
  assert.ok((root + 1n) * (root + 1n) > value);
});

test("sqrt(3) strip checks use integer comparisons", () => {
  assert.equal(core.floorSqrt3Multiple(4n), 6n);
  assert.equal(core.maxInclinedProduct(4, 1), 2);
  assert.equal(core.isInclinedStripValid(1, 1, 1, 2), true);
  assert.equal(core.isInclinedStripValid(1, 1, 2, 3), false);
});

test("only primitive directions describe a shortest torus loop", () => {
  assert.equal(core.isPrimitiveDirection(2, 3), true);
  assert.equal(core.isPrimitiveDirection(2, 4), false);
  assert.equal(core.stripParameters(2, 4, 1, 15).valid, false);
});

test("strip geometry satisfies both area and length equations", () => {
  const strip = core.stripParameters(1, 2, 1, 5);
  assert.equal(strip.valid, true);
  assert.ok(Math.abs(strip.area - strip.expectedArea) < 1e-10);
  assert.ok(Math.abs(strip.pathLength - strip.m) < 1e-10);
  assert.equal(strip.n, 10);
});

test("regular triangular grids have three strip directions", () => {
  assert.equal(core.stripDirectionCount(false), 1);
  assert.equal(core.stripDirectionCount(true), 3);
});

test("the arithmetic count reproduces all published checks", () => {
  const at6 = core.countToriangulations(6);
  assert.deepEqual(at6, {
    limit: 6,
    axial: 10,
    inclined: 8,
    raw: 18,
    regular: 2,
    correction: 4,
    total: 14,
  });

  assert.equal(core.countToriangulations(100).total, 8090);
  assert.equal(
    core.countToriangulations(100_000).total % 1_000_000_007,
    645_124_048
  );
});
