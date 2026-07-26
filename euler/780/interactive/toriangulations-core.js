(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Euler780Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function toBigInt(value) {
    return typeof value === "bigint" ? value : BigInt(value);
  }

  function gcd(left, right) {
    let a = Math.abs(Number(left));
    let b = Math.abs(Number(right));
    while (b !== 0) {
      [a, b] = [b, a % b];
    }
    return a;
  }

  function integerSquareRoot(value) {
    const n = toBigInt(value);
    if (n < 0n) throw new RangeError("square root of a negative integer");
    if (n < 2n) return n;

    let left = 1n;
    let right = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    while (left <= right) {
      const middle = (left + right) >> 1n;
      const square = middle * middle;
      if (square === n) return middle;
      if (square < n) left = middle + 1n;
      else right = middle - 1n;
    }
    return right;
  }

  function floorSqrt3Multiple(value) {
    const t = toBigInt(value);
    if (t < 0n) throw new RangeError("value must be non-negative");
    return integerSquareRoot(3n * t * t);
  }

  function maxInclinedProduct(upperM, k) {
    const upper = toBigInt(upperM);
    const stripCount = toBigInt(k);
    let left = 0n;
    let right = upper / stripCount;
    while (left <= right) {
      const middle = (left + right) >> 1n;
      const product = stripCount * middle;
      if (3n * product * product < upper * upper) left = middle + 1n;
      else right = middle - 1n;
    }
    return Number(right);
  }

  function isPrimitiveDirection(a, b) {
    return Number(a) > 0 && Number(b) >= 0 && gcd(a, b) === 1;
  }

  function isInclinedStripValid(a, b, k, m) {
    const aa = toBigInt(a);
    const bb = toBigInt(b);
    const kk = toBigInt(k);
    const mm = toBigInt(m);
    if (aa <= 0n || bb <= 0n || kk <= 0n || mm <= 0n) return false;
    if (!isPrimitiveDirection(Number(aa), Number(bb))) return false;
    const product = aa * bb * kk;
    return mm * mm > 3n * product * product;
  }

  function stripParameters(a, b, k, m, branch = 1) {
    const aa = Number(a);
    const bb = Number(b);
    const kk = Number(k);
    const mm = Number(m);
    const valid = isInclinedStripValid(aa, bb, kk, mm);
    const primitive = isPrimitiveDirection(aa, bb);
    const n = 2 * kk * mm;
    if (!valid) {
      return {
        a: aa,
        b: bb,
        k: kk,
        m: mm,
        n,
        primitive,
        valid,
      };
    }

    const root3 = Math.sqrt(3);
    const plus = Math.sqrt(mm * mm + root3 * aa * bb * kk * mm);
    const minus = Math.sqrt(mm * mm - root3 * aa * bb * kk * mm);
    const signedMinus = branch < 0 ? -minus : minus;
    const A = (plus + signedMinus) / 2;
    const B = (plus - signedMinus) / 2;
    const u = A / aa;
    const v = B / bb;

    return {
      a: aa,
      b: bb,
      k: kk,
      m: mm,
      n,
      primitive,
      valid,
      branch: branch < 0 ? -1 : 1,
      A,
      B,
      u,
      v,
      area: u * v,
      expectedArea: root3 * n / 4,
      pathLength: Math.hypot(aa * u, bb * v),
    };
  }

  function stripDiagramModel(a, b, k, m) {
    const values = [a, b, k, m].map(Number);
    if (values.some((value) => !Number.isInteger(value) || value < 1)) {
      throw new Error("Параметры схемы полос должны быть положительными целыми");
    }
    const [horizontalTurns, verticalTurns, stripCount, pairsPerStrip] = values;
    return {
      start: [0, 0],
      end: [horizontalTurns, verticalTurns],
      offsets: Array.from(
        { length: stripCount },
        (_, index) => index - (stripCount - 1) / 2,
      ),
      pairFractions: Array.from(
        { length: pairsPerStrip },
        (_, index) => (index + 1) / (pairsPerStrip + 1),
      ),
    };
  }

  function distinctPrimeFactorWeights(limit) {
    const values = new Array(limit + 1).fill(1);
    if (limit >= 0) values[0] = 0;
    for (let prime = 2; prime <= limit; prime += 1) {
      if (values[prime] !== 1) continue;
      for (let multiple = prime; multiple <= limit; multiple += prime) {
        values[multiple] *= 2;
      }
    }
    return values;
  }

  function factorization(value) {
    let n = value;
    const factors = [];
    for (let prime = 2; prime * prime <= n; prime += 1) {
      if (n % prime !== 0) continue;
      let exponent = 0;
      while (n % prime === 0) {
        n /= prime;
        exponent += 1;
      }
      factors.push([prime, exponent]);
    }
    if (n > 1) factors.push([n, 1]);
    return factors;
  }

  function eisensteinWeight(value) {
    if (value < 1) return 0;
    return factorization(value).reduce((product, [prime, exponent]) => {
      const factor = prime % 3 === 1
        ? (exponent + 1) * (exponent + 1)
        : exponent + 1;
      return product * factor;
    }, 1);
  }

  function divisorSummatory(limit) {
    let total = 0;
    for (let divisor = 1; divisor <= limit; divisor += 1) {
      total += Math.floor(limit / divisor);
    }
    return total;
  }

  function countToriangulations(limit) {
    const M = Math.floor(limit / 2);
    const L = Math.floor(limit / 4);
    const weights = distinctPrimeFactorWeights(maxInclinedProduct(M, 1));

    let inclined = 0;
    for (let k = 1; k <= M; k += 1) {
      const upperM = Math.floor(M / k);
      if (upperM < 2) break;
      const maxX = maxInclinedProduct(upperM, k);
      for (let x = 1; x <= maxX; x += 1) {
        const lowerM = Number(floorSqrt3Multiple(BigInt(k * x)));
        const choices = upperM - lowerM;
        if (choices > 0) inclined += 4 * weights[x] * choices;
      }
    }

    const axial = 2 * divisorSummatory(M);
    let regular = 0;
    for (let m = 1; m <= L; m += 1) {
      regular += 2 * eisensteinWeight(m);
    }
    const raw = axial + inclined;
    return {
      limit,
      axial,
      inclined,
      raw,
      regular,
      correction: 2 * regular,
      total: raw - 2 * regular,
    };
  }

  function stripDirectionCount(regular) {
    return regular ? 3 : 1;
  }

  function countDiagramModel(limit, regular) {
    const value = Number(limit);
    if (!Number.isInteger(value) || value < 2 || value > 100) {
      throw new Error("Размер схемы подсчёта должен быть целым от 2 до 100");
    }
    const counts = countToriangulations(value);
    return {
      limit: value,
      regular: Boolean(regular),
      directionAngles: regular ? [0, 60, -60] : [0],
      bandCount: Math.min(7, 1 + Math.floor(Math.log2(value))),
      latticeRadius: Math.min(8, 2 + Math.floor(Math.sqrt(value) / 2)),
      counts,
    };
  }

  return {
    countDiagramModel,
    countToriangulations,
    distinctPrimeFactorWeights,
    divisorSummatory,
    eisensteinWeight,
    factorization,
    floorSqrt3Multiple,
    gcd,
    integerSquareRoot,
    isInclinedStripValid,
    isPrimitiveDirection,
    maxInclinedProduct,
    stripDiagramModel,
    stripDirectionCount,
    stripParameters,
  };
});
