(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CorrectnessInvariantsTerminationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_ITEMS = 64;

  function parseArray(rawValue) {
    const text = String(rawValue).trim();
    if (!text) return Object.freeze([]);
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    if (parts.length > MAX_ITEMS) throw new RangeError("array contains more than " + MAX_ITEMS + " items");
    const values = parts.map(function (part) {
      if (!/^[+-]?\d+$/.test(part)) throw new Error("array accepts only integers");
      const value = Number(part);
      if (!Number.isSafeInteger(value)) throw new RangeError("array integer is outside the safe range");
      return value;
    });
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] < values[index - 1]) throw new Error("array must be sorted in nondecreasing order");
    }
    return Object.freeze(values);
  }

  function parseTarget(rawValue) {
    const text = String(rawValue).trim();
    if (!/^[+-]?\d+$/.test(text)) throw new Error("target must be an integer");
    const value = Number(text);
    if (!Number.isSafeInteger(value)) throw new RangeError("target is outside the safe range");
    return value;
  }

  function invariantEvidence(values, target, lo, hi) {
    const left = values.slice(0, lo).every(function (value) { return value < target; });
    const right = values.slice(hi).every(function (value) { return value >= target; });
    return Object.freeze({
      bounds: 0 <= lo && lo <= hi && hi <= values.length,
      leftStrictlyLess: left,
      rightAtLeastTarget: right,
      holds: 0 <= lo && lo <= hi && hi <= values.length && left && right,
    });
  }

  function createState(rawValues, rawTarget) {
    const values = Array.isArray(rawValues) ? parseArray(rawValues.join(",")) : parseArray(rawValues);
    const target = typeof rawTarget === "number" ? rawTarget : parseTarget(rawTarget);
    if (!Number.isSafeInteger(target)) throw new RangeError("target is outside the safe range");
    const evidence = invariantEvidence(values, target, 0, values.length);
    return Object.freeze({
      values: values,
      target: target,
      lo: 0,
      hi: values.length,
      stepNumber: 0,
      last: null,
      variant: values.length,
      invariant: evidence,
      finished: values.length === 0,
      foundIndex: values.length === 0 ? -1 : null,
    });
  }

  function step(state) {
    if (state.finished) return state;
    const mid = Math.floor((state.lo + state.hi) / 2);
    const value = state.values[mid];
    const goRight = value < state.target;
    const lo = goRight ? mid + 1 : state.lo;
    const hi = goRight ? state.hi : mid;
    const variant = hi - lo;
    const evidence = invariantEvidence(state.values, state.target, lo, hi);
    if (!evidence.holds || variant >= state.variant) {
      throw new Error("binary-search invariant or variant was broken");
    }
    const finished = lo === hi;
    const foundIndex = finished
      ? (lo < state.values.length && state.values[lo] === state.target ? lo : -1)
      : null;
    return Object.freeze({
      values: state.values,
      target: state.target,
      lo: lo,
      hi: hi,
      stepNumber: state.stepNumber + 1,
      last: Object.freeze({ mid: mid, value: value, comparison: goRight ? "less" : "at-least", previousVariant: state.variant }),
      variant: variant,
      invariant: evidence,
      finished: finished,
      foundIndex: foundIndex,
    });
  }

  function runToEnd(initialState) {
    let state = initialState;
    const trace = [state];
    while (!state.finished) {
      state = step(state);
      trace.push(state);
      if (trace.length > 70) throw new Error("binary search exceeded its guarded step count");
    }
    return Object.freeze({ state: state, trace: Object.freeze(trace) });
  }

  function visualModel(state) {
    return shared.deepFreeze({
      cells: state.values.map(function (value, index) {
        let status = index < state.lo || index >= state.hi ? "eliminated" : "candidate";
        if (state.finished && index === state.foundIndex) status = "found";
        return {
          index: index,
          value: value,
          status: status,
          isMid: Boolean(state.last && index === state.last.mid),
        };
      }),
      lo: state.lo,
      hi: state.hi,
      variant: state.variant,
      invariant: state.invariant,
      exact: true,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    parseArray: parseArray,
    parseTarget: parseTarget,
    invariantEvidence: invariantEvidence,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
    visualModel: visualModel,
  };
});
