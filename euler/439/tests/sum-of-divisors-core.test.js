const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../math/sum-of-divisors-core.js");

test("the sigma product identity needs the factor d", () => {
  for (let left = 1; left <= 50; left += 1) {
    for (let right = 1; right <= 50; right += 1) {
      assert.equal(core.sigmaProductIdentity(left, right), core.sigma(left * right));
    }
  }

  let wrongAt2 = 0n;
  for (let left = 1; left <= 2; left += 1) {
    for (let right = 1; right <= 2; right += 1) {
      wrongAt2 += core.divisors(core.gcd(left, right)).reduce((sum, divisor) => {
        return sum
          + BigInt(core.mobius(divisor))
          * core.sigma(left / divisor)
          * core.sigma(right / divisor);
      }, 0n);
    }
  }
  assert.equal(wrongAt2, 15n);
  assert.equal(core.doubleSigmaSumDirect(2), 14n);
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
