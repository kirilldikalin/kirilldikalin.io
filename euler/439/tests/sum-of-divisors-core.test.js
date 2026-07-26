const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../math/sum-of-divisors-core.js");

test("the sigma product identity needs the factor d", () => {
  for (let left = 1; left <= 50; left += 1) {
    for (let right = 1; right <= 50; right += 1) {
      assert.equal(core.sigmaProductIdentity(left, right), core.sigma(left * right));
    }
  }

  for (let limit = 1; limit <= 10; limit += 1) {
    const comparison = core.compareIdentityGrid(limit);
    assert.equal(comparison.mismatchCount, 0);
    assert.equal(comparison.directTotal, core.doubleSigmaSumDirect(limit));
    assert.equal(comparison.identityTotal, comparison.directTotal);
  }

  const wrongAt2 = core.compareIdentityGrid(2, false);
  assert.equal(wrongAt2.directTotal, 14n);
  assert.equal(wrongAt2.identityTotal, 15n);
  assert.equal(wrongAt2.mismatchCount, 1);
});

test("quotient blocks cover every index exactly once", () => {
  for (let limit = 1; limit <= 200; limit += 1) {
    const blocks = core.quotientBlocks(limit);
    let next = 1;
    for (const block of blocks) {
      assert.equal(block.left, next);
      assert.equal(block.length, block.right - block.left + 1);
      assert.equal(block.quotient, Math.floor(limit / block.left));
      assert.equal(block.quotient, Math.floor(limit / block.right));
      next = block.right + 1;
    }
    assert.equal(next, limit + 1);
  }
});

test("all three forms of A(M) agree", () => {
  for (let limit = 1; limit <= 200; limit += 1) {
    const direct = core.summatorySigmaDirect(limit);
    assert.equal(core.summatorySigmaByDivisors(limit), direct);
    assert.equal(core.summatorySigmaBlocks(limit), direct);
  }
});

test("recursive W(n) agrees with the sieve", () => {
  const through = 10_000;
  const sieve = core.weightedMobiusPrefix(through);
  const recursive = core.createWeightedMobiusSummatory(80);
  for (let value = 1; value <= through; value += 37) {
    assert.equal(recursive.W(value), sieve.prefix[value]);
  }
});

test("blocked final sum agrees with the double sum for small N", () => {
  for (let limit = 1; limit <= 20; limit += 1) {
    assert.equal(core.euler439Sum(limit, { cutoff: 4 }).total, core.doubleSigmaSumDirect(limit));
  }
});

test("official checks are reproduced without the final target", () => {
  assert.equal(core.euler439Sum(3).total, 59n);
  assert.equal(core.euler439Sum(1_000).total, 563_576_517_282n);
  assert.equal(core.euler439Sum(100_000).total % 1_000_000_000n, 215_766_508n);
});
