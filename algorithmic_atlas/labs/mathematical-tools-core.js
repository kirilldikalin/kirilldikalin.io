(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasMathToolsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function boundedInteger(rawValue, label, minimum, maximum) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(
        (label || "Значение") + ": требуется целое число от " +
        minimum + " до " + maximum + "."
      );
    }
    return value;
  }

  function gcdBigInt(left, right) {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function rational(numerator, denominator) {
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
      throw new TypeError("rational values require BigInt numerator and denominator");
    }
    if (denominator === 0n) {
      throw new RangeError("rational denominator cannot be zero");
    }
    let n = numerator;
    let d = denominator;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const divisor = gcdBigInt(n, d);
    return Object.freeze({
      numerator: n / divisor,
      denominator: d / divisor,
    });
  }

  function addRational(left, right) {
    return rational(
      left.numerator * right.denominator + right.numerator * left.denominator,
      left.denominator * right.denominator
    );
  }

  function subtractRational(left, right) {
    return rational(
      left.numerator * right.denominator - right.numerator * left.denominator,
      left.denominator * right.denominator
    );
  }

  function multiplyRational(left, right) {
    return rational(
      left.numerator * right.numerator,
      left.denominator * right.denominator
    );
  }

  function divideRational(left, right) {
    if (right.numerator === 0n) {
      throw new RangeError("division by zero rational");
    }
    return rational(
      left.numerator * right.denominator,
      left.denominator * right.numerator
    );
  }

  function rationalToNumber(value) {
    const precision = 1000000000000n;
    const scaled = value.numerator * precision / value.denominator;
    return Number(scaled) / Number(precision);
  }

  function log10BigInt(value) {
    if (typeof value !== "bigint" || value <= 0n) {
      throw new TypeError("value must be a positive BigInt");
    }
    const text = value.toString();
    const headLength = Math.min(16, text.length);
    const head = Number(text.slice(0, headLength));
    const mantissa = head / Math.pow(10, headLength - 1);
    return text.length - 1 + Math.log10(mantissa);
  }

  function logFactorial(value) {
    const n = boundedInteger(value, "n", 0, 1000000);
    if (n < 2) {
      return 0;
    }
    if (n <= 10000) {
      let sum = 0;
      for (let item = 2; item <= n; item += 1) {
        sum += Math.log10(item);
      }
      return sum;
    }
    const x = n;
    const natural = x * Math.log(x) - x +
      0.5 * Math.log(2 * Math.PI * x) + 1 / (12 * x);
    return natural / Math.LN10;
  }

  function normalizedShare(value, minimum, maximum) {
    if (![value, minimum, maximum].every(Number.isFinite)) {
      return value === -Infinity ? 0 : value === Infinity ? 1 : 0.5;
    }
    if (maximum === minimum) {
      return 0.5;
    }
    return clamp((value - minimum) / (maximum - minimum), 0, 1);
  }

  function sampleIntegers(minimum, maximum, count, logarithmic) {
    const start = boundedInteger(minimum, "minimum", 1, 1000000000);
    const end = boundedInteger(maximum, "maximum", start, 1000000000);
    const amount = boundedInteger(count, "count", 2, 256);
    const values = [];
    const logStart = Math.log(start);
    const logEnd = Math.log(end);
    for (let index = 0; index < amount; index += 1) {
      const share = index / (amount - 1);
      const raw = logarithmic
        ? Math.exp(logStart + share * (logEnd - logStart))
        : start + share * (end - start);
      values.push(clamp(Math.round(raw), start, end));
    }
    values.push(start, end);
    return Object.freeze(Array.from(new Set(values)).sort(function (a, b) {
      return a - b;
    }));
  }

  function normalizeSeed(rawSeed) {
    const value = Number(rawSeed);
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("seed must be a safe integer");
    }
    const normalized = value >>> 0;
    return normalized === 0 ? 0x9e3779b9 : normalized;
  }

  function randomStep(rawState) {
    let state = normalizeSeed(rawState);
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return Object.freeze({
      state: state === 0 ? 0x9e3779b9 : state,
      value: state / 4294967296,
    });
  }

  return {
    assert: assert,
    deepFreeze: deepFreeze,
    clamp: clamp,
    boundedInteger: boundedInteger,
    gcdBigInt: gcdBigInt,
    rational: rational,
    addRational: addRational,
    subtractRational: subtractRational,
    multiplyRational: multiplyRational,
    divideRational: divideRational,
    rationalToNumber: rationalToNumber,
    log10BigInt: log10BigInt,
    logFactorial: logFactorial,
    normalizedShare: normalizedShare,
    sampleIntegers: sampleIntegers,
    normalizeSeed: normalizeSeed,
    randomStep: randomStep,
  };
});
