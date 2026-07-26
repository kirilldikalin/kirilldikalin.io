(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Euler439Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function triangular(value) {
    const n = BigInt(value);
    return n * (n + 1n) / 2n;
  }

  function gcd(left, right) {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  }

  function divisors(value) {
    const result = [];
    for (let divisor = 1; divisor * divisor <= value; divisor += 1) {
      if (value % divisor !== 0) continue;
      result.push(divisor);
      if (divisor * divisor !== value) result.push(value / divisor);
    }
    return result.sort((left, right) => left - right);
  }

  function sigma(value) {
    return divisors(value).reduce((sum, divisor) => sum + BigInt(divisor), 0n);
  }

  function mobius(value) {
    if (value === 1) return 1;
    let n = value;
    let primeFactors = 0;
    for (let prime = 2; prime * prime <= n; prime += 1) {
      if (n % prime !== 0) continue;
      n /= prime;
      primeFactors += 1;
      if (n % prime === 0) return 0;
      while (n % prime === 0) n /= prime;
    }
    if (n > 1) primeFactors += 1;
    return primeFactors % 2 === 0 ? 1 : -1;
  }

  function sigmaProductIdentity(left, right) {
    return divisors(gcd(left, right)).reduce((sum, divisor) => {
      return sum
        + BigInt(mobius(divisor))
        * BigInt(divisor)
        * sigma(left / divisor)
        * sigma(right / divisor);
    }, 0n);
  }

  function summatorySigmaDirect(limit) {
    let total = 0n;
    for (let value = 1; value <= limit; value += 1) total += sigma(value);
    return total;
  }

  function summatorySigmaByDivisors(limit) {
    let total = 0n;
    for (let divisor = 1; divisor <= limit; divisor += 1) {
      total += BigInt(divisor) * BigInt(Math.floor(limit / divisor));
    }
    return total;
  }

  function summatorySigmaBlocks(limit) {
    let total = 0n;
    for (let left = 1; left <= limit;) {
      const quotient = Math.floor(limit / left);
      const right = Math.floor(limit / quotient);
      total += BigInt(right - left + 1) * triangular(quotient);
      left = right + 1;
    }
    return total;
  }

  function mobiusSieve(limit) {
    const mu = new Int32Array(limit + 1);
    const primes = [];
    const composite = new Uint8Array(limit + 1);
    mu[1] = 1;
    for (let value = 2; value <= limit; value += 1) {
      if (!composite[value]) {
        primes.push(value);
        mu[value] = -1;
      }
      for (const prime of primes) {
        const product = value * prime;
        if (product > limit) break;
        composite[product] = 1;
        if (value % prime === 0) {
          mu[product] = 0;
          break;
        }
        mu[product] = -mu[value];
      }
    }
    return mu;
  }

  function weightedMobiusPrefix(limit) {
    const mu = mobiusSieve(limit);
    const prefix = new Array(limit + 1).fill(0n);
    for (let value = 1; value <= limit; value += 1) {
      prefix[value] = prefix[value - 1] + BigInt(value * mu[value]);
    }
    return { mu, prefix };
  }

  function createWeightedMobiusSummatory(cutoff) {
    const { prefix } = weightedMobiusPrefix(cutoff);
    const memo = new Map();

    function W(limit) {
      if (limit <= cutoff) return prefix[limit];
      if (memo.has(limit)) return memo.get(limit);
      let result = 1n;
      for (let left = 2; left <= limit;) {
        const quotient = Math.floor(limit / left);
        const right = Math.floor(limit / quotient);
        const coefficient = triangular(right) - triangular(left - 1);
        result -= coefficient * W(quotient);
        left = right + 1;
      }
      memo.set(limit, result);
      return result;
    }

    return { W, memo, cutoff, prefix };
  }

  function euler439Sum(limit, options = {}) {
    const cutoff = options.cutoff ?? Math.max(1, Math.floor(Math.sqrt(limit)));
    const weighted = createWeightedMobiusSummatory(cutoff);
    const summatoryCache = new Map();

    function A(value) {
      if (!summatoryCache.has(value)) {
        summatoryCache.set(value, summatorySigmaBlocks(value));
      }
      return summatoryCache.get(value);
    }

    let total = 0n;
    for (let left = 1; left <= limit;) {
      const quotient = Math.floor(limit / left);
      const right = Math.floor(limit / quotient);
      const weight = weighted.W(right) - weighted.W(left - 1);
      const sigmaSum = A(quotient);
      total += weight * sigmaSum * sigmaSum;
      left = right + 1;
    }
    return {
      total,
      cutoff,
      weightedMemoSize: weighted.memo.size,
      summatoryCacheSize: summatoryCache.size,
    };
  }

  function doubleSigmaSumDirect(limit) {
    let total = 0n;
    for (let left = 1; left <= limit; left += 1) {
      for (let right = 1; right <= limit; right += 1) {
        total += sigma(left * right);
      }
    }
    return total;
  }

  return {
    createWeightedMobiusSummatory,
    divisors,
    doubleSigmaSumDirect,
    euler439Sum,
    gcd,
    mobius,
    mobiusSieve,
    sigma,
    sigmaProductIdentity,
    summatorySigmaBlocks,
    summatorySigmaByDivisors,
    summatorySigmaDirect,
    triangular,
    weightedMobiusPrefix,
  };
});
