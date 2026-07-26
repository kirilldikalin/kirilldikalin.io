const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../interactive/sad-integers-core.js");

test("one processing step preserves the number of stones", () => {
  for (let n = 1; n <= 20; n += 1) {
    for (let steps = 0; steps <= 8; steps += 1) {
      assert.equal(core.simulateSteps(n, steps).visibleStoneCount, n);
    }
  }
});

test("residue pairs satisfy x^2 = -x - 2", () => {
  const pairs = core.residuePairs(20);
  assert.deepEqual(pairs[0], { u: 0, v: 1 });
  assert.deepEqual(pairs[1], { u: 1, v: 0 });
  for (let index = 2; index < pairs.length; index += 1) {
    assert.equal(pairs[index].u, -pairs[index - 1].u - 2 * pairs[index - 2].u);
    assert.equal(pairs[index].v, -pairs[index - 1].v - 2 * pairs[index - 2].v);
  }
});

test("lonely sets require gaps of at least three", () => {
  assert.equal(core.isLonelySet([2, 5, 8, 13]), true);
  assert.equal(core.isLonelySet([1, 13]), true);
  assert.equal(core.isLonelySet([2, 4, 13]), false);
});

test("both public singleton sets reconstruct their candidates", () => {
  const first = core.candidateForSet([2, 5, 8, 13]);
  assert.deepEqual(first.residue, { u: 0, v: 68 });
  assert.equal(first.n, 68);
  assert.equal(first.valid, true);
  assert.equal(first.reconstruction.minQ, 8);
  assert.equal(first.reconstruction.tailValue, 16);

  const second = core.candidateForSet([1, 13]);
  assert.deepEqual(second.residue, { u: 0, v: 90 });
  assert.equal(second.n, 90);
  assert.equal(second.valid, true);
  assert.equal(second.reconstruction.minQ, 11);
  assert.equal(second.reconstruction.tailValue, 22);
});

test("meet-in-the-middle keeps enough boundary information", () => {
  const summary = core.meetInTheMiddleSummary([2, 5, 8, 13], 7);
  assert.deepEqual(summary.left.positions, [2, 5]);
  assert.deepEqual(summary.right.positions, [8, 13]);
  assert.equal(summary.left.mask, "10");
  assert.equal(summary.right.mask, "01");
  assert.equal(summary.compatible, true);
  assert.deepEqual(summary.combinedResidue, { u: 0, v: 68 });
});

test("incompatible masks and non-constant residues are rejected", () => {
  assert.equal(core.boundaryCompatible([5], [7], 7), false);
  const candidate = core.candidateForSet([2, 6]);
  assert.equal(candidate.valid, false);
  assert.notEqual(candidate.residue.u, 0);
});
