(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.EgyptianMultiplicationCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_DIGITS = 80;
  const MAX_EXACT_CELLS = 400n;
  const MAX_EXACT_SIDE = 40n;

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

  function createState(left, right) {
    if (typeof left !== "bigint" || typeof right !== "bigint") {
      throw new TypeError("createState expects two BigInt values");
    }
    const product = left * right;
    return Object.freeze({
      originalLeft: left,
      originalRight: right,
      multiplier: absolute(left),
      multiplicand: absolute(right),
      accumulator: 0n,
      sign: product < 0n ? -1n : 1n,
      targetMagnitude: absolute(product),
      stepNumber: 0,
      lastRule: "initial",
      finished: left === 0n,
    });
  }

  function invariantValue(state) {
    return state.accumulator + state.multiplier * state.multiplicand;
  }

  function invariantHolds(state) {
    return invariantValue(state) === state.targetMagnitude;
  }

  function step(state) {
    if (!state || typeof state.multiplier !== "bigint") {
      throw new TypeError("step expects a multiplication state");
    }
    if (state.finished) {
      return state;
    }

    const odd = state.multiplier % 2n === 1n;
    const next = Object.freeze({
      originalLeft: state.originalLeft,
      originalRight: state.originalRight,
      multiplier: state.multiplier / 2n,
      multiplicand: state.multiplicand * 2n,
      accumulator: state.accumulator + (odd ? state.multiplicand : 0n),
      sign: state.sign,
      targetMagnitude: state.targetMagnitude,
      stepNumber: state.stepNumber + 1,
      lastRule: odd ? "odd" : "even",
      finished: state.multiplier / 2n === 0n,
    });

    if (!invariantHolds(next)) {
      throw new Error("the multiplication invariant was broken");
    }
    return next;
  }

  function runToEnd(initialState) {
    const trace = [initialState];
    let current = initialState;
    const stepLimit = MAX_DIGITS * 4;

    while (!current.finished) {
      if (trace.length > stepLimit) {
        throw new Error("step limit exceeded");
      }
      current = step(current);
      trace.push(current);
    }

    return {
      state: current,
      trace: trace,
      result: signedResult(current),
    };
  }

  function signedResult(state) {
    if (!state.finished) {
      return null;
    }
    return state.sign * state.accumulator;
  }

  function nextRule(state) {
    if (state.finished) {
      return "halt";
    }
    return state.multiplier % 2n === 1n ? "odd" : "even";
  }

  function ratioToNumber(numerator, denominator) {
    if (denominator === 0n) {
      return 0;
    }
    const precision = 1000000n;
    return Number(numerator * precision / denominator) / Number(precision);
  }

  function geometryModel(state) {
    if (!state || typeof state.multiplier !== "bigint") {
      throw new TypeError("geometryModel expects a multiplication state");
    }

    const remainingBefore = state.multiplier * state.multiplicand;
    if (state.finished) {
      return Object.freeze({
        finished: true,
        exact: state.targetMagnitude <= MAX_EXACT_CELLS,
        targetArea: state.targetMagnitude,
        accumulatorBefore: state.accumulator,
        accumulatorAfter: state.accumulator,
        remainingBefore: 0n,
        remainingAfter: 0n,
        extractedStrip: 0n,
        accumulatorFraction: state.targetMagnitude === 0n
          ? 1
          : ratioToNumber(state.accumulator, state.targetMagnitude),
        remainingFraction: 0,
      });
    }

    const odd = state.multiplier % 2n === 1n;
    const extractedStrip = odd ? state.multiplicand : 0n;
    const nextMultiplier = state.multiplier / 2n;
    const nextMultiplicand = state.multiplicand * 2n;
    const accumulatorAfter = state.accumulator + extractedStrip;
    const remainingAfter = nextMultiplier * nextMultiplicand;
    const maximumSide = [
      state.multiplier,
      state.multiplicand,
      nextMultiplier,
      nextMultiplicand,
    ].reduce(function (current, value) {
      return value > current ? value : current;
    }, 0n);
    const exact = maximumSide <= MAX_EXACT_SIDE &&
      remainingBefore <= MAX_EXACT_CELLS &&
      remainingAfter <= MAX_EXACT_CELLS;

    if (state.accumulator + remainingBefore !== state.targetMagnitude ||
        accumulatorAfter + remainingAfter !== state.targetMagnitude) {
      throw new Error("geometry model does not preserve the multiplication invariant");
    }

    return Object.freeze({
      finished: false,
      exact: exact,
      rule: odd ? "odd" : "even",
      targetArea: state.targetMagnitude,
      before: Object.freeze({
        width: state.multiplier,
        height: state.multiplicand,
        area: remainingBefore,
      }),
      after: Object.freeze({
        width: nextMultiplier,
        height: nextMultiplicand,
        area: remainingAfter,
      }),
      accumulatorBefore: state.accumulator,
      accumulatorAfter: accumulatorAfter,
      remainingBefore: remainingBefore,
      remainingAfter: remainingAfter,
      extractedStrip: extractedStrip,
      accumulatorFraction: state.targetMagnitude === 0n
        ? 1
        : ratioToNumber(accumulatorAfter, state.targetMagnitude),
      remainingFraction: state.targetMagnitude === 0n
        ? 0
        : ratioToNumber(remainingAfter, state.targetMagnitude),
      stripFraction: state.targetMagnitude === 0n
        ? 0
        : ratioToNumber(extractedStrip, state.targetMagnitude),
    });
  }

  return {
    MAX_DIGITS: MAX_DIGITS,
    MAX_EXACT_CELLS: MAX_EXACT_CELLS,
    MAX_EXACT_SIDE: MAX_EXACT_SIDE,
    absolute: absolute,
    parseInteger: parseInteger,
    createState: createState,
    invariantValue: invariantValue,
    invariantHolds: invariantHolds,
    step: step,
    runToEnd: runToEnd,
    signedResult: signedResult,
    nextRule: nextRule,
    ratioToNumber: ratioToNumber,
    geometryModel: geometryModel,
  };
});
