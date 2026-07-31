(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.EuclideanAlgorithmCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_DIGITS = 120;
  const MAX_FIBONACCI_INDEX = 570;
  const MAX_STEPS = MAX_DIGITS * 5 + 10;

  function absolute(value) {
    return value < 0n ? -value : value;
  }

  function parseInteger(rawValue, fieldName) {
    const label = fieldName || "Значение";
    const text = String(rawValue).trim();
    if (!text) {
      throw new Error(label + ": введите целое число.");
    }
    if (!/^[+-]?\d+$/.test(text)) {
      throw new Error(label + ": допустимы только целые числа.");
    }
    const digits = text.replace(/^[+-]?0*/, "") || "0";
    if (digits.length > MAX_DIGITS) {
      throw new Error(label + ": не больше " + MAX_DIGITS + " цифр.");
    }
    return BigInt(text);
  }

  function gcd(left, right) {
    let a = absolute(left);
    let b = absolute(right);
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function createState(left, right) {
    if (typeof left !== "bigint" || typeof right !== "bigint") {
      throw new TypeError("createState expects two BigInt values");
    }
    if (left === 0n && right === 0n) {
      throw new Error("НОД(0, 0) не определён: нужен хотя бы один ненулевой вход.");
    }

    let a = absolute(left);
    let b = absolute(right);
    if (a < b) {
      [a, b] = [b, a];
    }

    return Object.freeze({
      originalLeft: left,
      originalRight: right,
      originalGcd: gcd(a, b),
      a: a,
      b: b,
      stepNumber: 0,
      divisionCount: 0,
      subtractionCount: 0n,
      lastDivision: null,
      finished: b === 0n,
    });
  }

  function invariantHolds(state) {
    return gcd(state.a, state.b) === state.originalGcd;
  }

  function step(state) {
    if (!state || typeof state.a !== "bigint") {
      throw new TypeError("step expects a Euclidean algorithm state");
    }
    if (state.finished) {
      return state;
    }

    const quotient = state.a / state.b;
    const remainder = state.a % state.b;
    const phaseSubtractions = remainder === 0n ? quotient - 1n : quotient;
    const next = Object.freeze({
      originalLeft: state.originalLeft,
      originalRight: state.originalRight,
      originalGcd: state.originalGcd,
      a: state.b,
      b: remainder,
      stepNumber: state.stepNumber + 1,
      divisionCount: state.divisionCount + 1,
      subtractionCount: state.subtractionCount + phaseSubtractions,
      lastDivision: Object.freeze({
        dividend: state.a,
        divisor: state.b,
        quotient: quotient,
        remainder: remainder,
        subtractions: phaseSubtractions,
      }),
      finished: remainder === 0n,
    });

    if (!invariantHolds(next)) {
      throw new Error("the gcd invariant was broken");
    }
    return next;
  }

  function runToEnd(initialState) {
    const trace = [initialState];
    let current = initialState;

    while (!current.finished) {
      if (trace.length > MAX_STEPS) {
        throw new Error("step limit exceeded");
      }
      current = step(current);
      trace.push(current);
    }

    return {
      state: current,
      trace: trace,
      gcd: current.a,
      divisionCount: current.divisionCount,
      subtractionCount: current.subtractionCount,
    };
  }

  function subtractionRun(left, right, limit) {
    let a = absolute(left);
    let b = absolute(right);
    if (a === 0n && b === 0n) {
      throw new Error("gcd(0, 0) is undefined");
    }
    if (a === 0n) {
      return { gcd: b, steps: 0n, truncated: false };
    }
    if (b === 0n) {
      return { gcd: a, steps: 0n, truncated: false };
    }

    let steps = 0n;
    const maximum = typeof limit === "bigint" ? limit : 100000n;
    while (a !== b && steps < maximum) {
      if (a > b) {
        a -= b;
      } else {
        b -= a;
      }
      steps += 1n;
    }
    return {
      gcd: a === b ? a : null,
      steps: steps,
      truncated: a !== b,
    };
  }

  function fibonacci(index) {
    if (!Number.isInteger(index) || index < 0 || index > MAX_FIBONACCI_INDEX + 1) {
      throw new RangeError("Fibonacci index is out of range");
    }
    let previous = 0n;
    let current = 1n;
    for (let position = 0; position < index; position += 1) {
      [previous, current] = [current, previous + current];
    }
    return previous;
  }

  function fibonacciBadCase(index) {
    if (!Number.isInteger(index) || index < 2 || index > MAX_FIBONACCI_INDEX) {
      throw new RangeError(
        "bad-case index must be between 2 and " + MAX_FIBONACCI_INDEX
      );
    }
    const smaller = fibonacci(index);
    const larger = fibonacci(index + 1);
    return {
      index: index,
      larger: larger,
      smaller: smaller,
      expectedDivisionCount: index - 1,
    };
  }

  function decimalDigits(value) {
    return absolute(value).toString().length;
  }

  function bitLength(value) {
    const magnitude = absolute(value);
    return magnitude === 0n ? 1 : magnitude.toString(2).length;
  }

  function ratioToNumber(numerator, denominator, scale) {
    if (denominator === 0n) {
      return 0;
    }
    const precision = BigInt(scale || 1000000);
    return Number(numerator * precision / denominator) / Number(precision);
  }

  function geometryModel(state) {
    if (state.finished) {
      return {
        finished: true,
        a: state.a,
        b: state.b,
        sourceArea: 0n,
        tiledArea: 0n,
        remainderArea: 0n,
        identityHolds: true,
        isSlowQuotient: false,
        schematic: decimalDigits(state.a) > 15,
      };
    }
    const quotient = state.a / state.b;
    const remainder = state.a % state.b;
    const sourceArea = state.a * state.b;
    const tiledArea = quotient * state.b * state.b;
    const remainderArea = remainder * state.b;
    const schematic = quotient > 24n || decimalDigits(state.a) > 15;
    return {
      finished: false,
      a: state.a,
      b: state.b,
      quotient: quotient,
      remainder: remainder,
      sourceArea: sourceArea,
      tiledArea: tiledArea,
      remainderArea: remainderArea,
      identityHolds: tiledArea + remainderArea === sourceArea,
      nextPair: Object.freeze({
        a: state.b,
        b: remainder,
      }),
      isSlowQuotient: quotient === 1n && remainder > 0n,
      squareFraction: ratioToNumber(state.b, state.a),
      remainderFraction: ratioToNumber(remainder, state.a),
      visibleSquareCount: schematic ? 3 : Number(quotient),
      schematic: schematic,
    };
  }

  function minimumPairForDivisions(divisionCount) {
    if (!Number.isInteger(divisionCount) || divisionCount < 1) {
      throw new RangeError("division count must be positive");
    }
    return {
      larger: fibonacci(divisionCount + 2),
      smaller: fibonacci(divisionCount + 1),
    };
  }

  return {
    MAX_DIGITS: MAX_DIGITS,
    MAX_FIBONACCI_INDEX: MAX_FIBONACCI_INDEX,
    MAX_STEPS: MAX_STEPS,
    absolute: absolute,
    parseInteger: parseInteger,
    gcd: gcd,
    createState: createState,
    invariantHolds: invariantHolds,
    step: step,
    runToEnd: runToEnd,
    subtractionRun: subtractionRun,
    fibonacci: fibonacci,
    fibonacciBadCase: fibonacciBadCase,
    decimalDigits: decimalDigits,
    bitLength: bitLength,
    ratioToNumber: ratioToNumber,
    geometryModel: geometryModel,
    minimumPairForDivisions: minimumPairForDivisions,
  };
});
