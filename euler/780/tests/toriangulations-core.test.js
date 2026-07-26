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

test("every strip control changes the diagram model", () => {
  const base = core.stripDiagramModel(1, 1, 1, 2);
  assert.deepEqual(base.end, [1, 1]);
  assert.deepEqual(base.offsets, [0]);
  assert.deepEqual(base.pairFractions, [1 / 3, 2 / 3]);

  assert.deepEqual(core.stripDiagramModel(4, 1, 1, 2).end, [4, 1]);
  assert.deepEqual(core.stripDiagramModel(1, 5, 1, 2).end, [1, 5]);
  assert.equal(core.stripDiagramModel(1, 1, 4, 2).offsets.length, 4);
  assert.equal(core.stripDiagramModel(1, 1, 1, 18).pairFractions.length, 18);
});

test("regular triangular grids have three strip directions", () => {
  assert.equal(core.stripDirectionCount(false), 1);
  assert.equal(core.stripDirectionCount(true), 3);

  const ordinary = core.countDiagramModel(6, false);
  const regular = core.countDiagramModel(6, true);
  const large = core.countDiagramModel(100, false);
  assert.deepEqual(ordinary.directionAngles, [0]);
  assert.deepEqual(regular.directionAngles, [0, 60, -60]);
  assert.equal(ordinary.counts.total, 14);
  assert.ok(large.bandCount > ordinary.bandCount);
  assert.ok(large.latticeRadius > ordinary.latticeRadius);
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
