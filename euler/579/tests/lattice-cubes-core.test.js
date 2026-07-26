const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../math/lattice-cubes-core.js");

const axial = [
  [3, 0, 0],
  [0, 3, 0],
  [0, 0, 3],
];

const tilted = [
  [1, 2, 2],
  [2, -2, 1],
  [2, 1, -2],
];

test("edge triples are integral, orthogonal and equal in length", () => {
  assert.equal(core.validateEdges(axial), true);
  assert.equal(core.validateEdges(tilted), true);
  assert.equal(core.edgeLength(axial), 3);
  assert.equal(core.edgeLength(tilted), 3);
  for (let left = 0; left < 3; left += 1) {
    for (let right = left + 1; right < 3; right += 1) {
      assert.equal(core.dot(tilted[left], tilted[right]), 0);
    }
  }
});

test("quaternion normalization covers g = 1, 2 and 4", () => {
  assert.equal(core.quaternionDivisor([1, 0, 0, 0]), 1);
  assert.equal(core.quaternionDivisor([1, 1, 1, 0]), 1);
  assert.equal(core.quaternionDivisor([1, 1, 0, 0]), 2);
  assert.equal(core.quaternionDivisor([1, 1, 1, 1]), 4);

  for (const quaternion of [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 1, 1, 1],
  ]) {
    const generated = core.edgesFromQuaternion(quaternion);
    assert.equal(generated.length, core.quaternionNorm(quaternion) / generated.divisor);
    assert.equal(core.validateEdges(generated.edges), true);
  }
});

test("direct and quaternion generators agree on small lengths", () => {
  const direct = core.enumerateDirectOrientations(6);
  const quaternion = core.enumerateQuaternionOrientations(6);
  assert.deepEqual(
    new Set(quaternion.map((orientation) => orientation.key)),
    new Set(direct.map((orientation) => orientation.key))
  );
  assert.equal(new Set(direct.map((orientation) => orientation.key)).size, direct.length);
  assert.equal(new Set(quaternion.map((orientation) => orientation.key)).size, quaternion.length);
});

test("coordinate spans equal sums of absolute edge components", () => {
  assert.deepEqual(core.coordinateSpans(axial), [3, 3, 3]);
  assert.deepEqual(core.coordinateSpans(tilted), [5, 5, 5]);
  assert.deepEqual(core.coordinateSpans(tilted), core.componentSpanSums(tilted));
  assert.equal(core.placementCount(tilted, 5), 1);
  assert.equal(core.placementCount(tilted, 6), 8);
});

test("point formula gives 64 axial and 40 tilted points", () => {
  assert.equal(core.pointCount(axial), 64);
  assert.equal(core.pointCount(tilted), 40);
  assert.equal(core.pointCount(tilted.map((edge) => core.scale(edge, 2))), 259);
});

test("enumerated lattice points match the formula and classification", () => {
  const axialPoints = core.latticePoints(axial);
  const tiltedPoints = core.latticePoints(tilted);
  assert.equal(axialPoints.length, core.pointCount(axial));
  assert.equal(tiltedPoints.length, core.pointCount(tilted));
  assert.equal(axialPoints.filter(({ kind }) => kind === "vertex").length, 8);
  assert.equal(tiltedPoints.filter(({ kind }) => kind === "vertex").length, 8);
  assert.equal(tiltedPoints.filter(({ kind }) => kind === "interior").length, 20);
});

test("small C(n) and S(n) checks are reproduced exactly", () => {
  const orientations = core.enumerateQuaternionOrientations(10);
  const checks = new Map([
    [1, { C: 1, S: 8 }],
    [2, { C: 9, S: 91 }],
    [4, { C: 100, S: 1878 }],
    [5, { C: 229, S: 5832 }],
    [10, { C: 4469, S: 387003 }],
  ]);
  for (const [n, expected] of checks) {
    const actual = core.cubeTotals(n, orientations);
    assert.equal(actual.C, expected.C);
    assert.equal(actual.S, expected.S);
  }
});
