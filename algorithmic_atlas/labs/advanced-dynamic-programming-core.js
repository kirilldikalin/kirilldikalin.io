(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AdvancedDynamicProgrammingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCENARIOS = Object.freeze({
    monge: Object.freeze({
      id: "monge",
      label: "Суммарный вес интервала: условия выполнены",
      values: Object.freeze([4, 1, 6, 2, 5, 3, 7]),
    }),
    irregular: Object.freeze({
      id: "irregular",
      label: "Нерегулярная цена: монотонность ломается",
      values: Object.freeze([2, 5, 1, 4, 3, 6, 2]),
    }),
  });

  function normalizeOptions(input) {
    const options = input || {};
    const scenario = SCENARIOS[options.scenario || "monge"];
    if (!scenario) throw new RangeError("Неизвестный сценарий матрицы переходов.");
    const size = Number(options.size === undefined ? 6 : options.size);
    if (!Number.isSafeInteger(size) || size < 4 || size > 7) {
      throw new RangeError("Размер должен быть целым числом от 4 до 7.");
    }
    const method = options.method || "full";
    if (method !== "full" && method !== "knuth") {
      throw new RangeError("Неизвестный способ просмотра переходов.");
    }
    return Object.freeze({ scenario: scenario.id, size: size, method: method, values: Object.freeze(scenario.values.slice(0, size)) });
  }

  function baseIntervalSum(values, i, j) {
    let result = 0;
    for (let index = i; index <= j; index += 1) result += values[index];
    return result;
  }

  function intervalWeight(options, i, j) {
    if (i > j) return 0;
    const base = baseIntervalSum(options.values, i, j);
    if (options.scenario === "monge") return base;
    const perturbation = ((i * 13 + j * 17 + (j - i) * 7) % 23);
    return base + perturbation;
  }

  function candidate(dp, options, i, j, split) {
    return dp[i][split] + dp[split + 1][j] + intervalWeight(options, i, j);
  }

  function emptyMatrix(size, fill) {
    return Array.from({ length: size }, function () { return Array(size).fill(fill); });
  }

  function solveFull(options) {
    const n = options.size;
    const dp = emptyMatrix(n, 0);
    const opt = emptyMatrix(n, null);
    const records = [];
    for (let i = 0; i < n; i += 1) opt[i][i] = i;
    for (let length = 2; length <= n; length += 1) {
      for (let i = 0; i + length <= n; i += 1) {
        const j = i + length - 1;
        let bestValue = Number.POSITIVE_INFINITY;
        let bestSplit = i;
        const candidates = [];
        for (let split = i; split < j; split += 1) {
          const value = candidate(dp, options, i, j, split);
          candidates.push(Object.freeze({ split: split, value: value, allowed: true }));
          if (value < bestValue) {
            bestValue = value;
            bestSplit = split;
          }
        }
        dp[i][j] = bestValue;
        opt[i][j] = bestSplit;
        records.push(Object.freeze({ i: i, j: j, lower: i, upper: j - 1, value: bestValue, split: bestSplit, candidates: Object.freeze(candidates) }));
      }
    }
    return Object.freeze({ dp: dp, opt: opt, records: Object.freeze(records) });
  }

  function solveKnuth(options) {
    const n = options.size;
    const dp = emptyMatrix(n, 0);
    const opt = emptyMatrix(n, null);
    const records = [];
    for (let i = 0; i < n; i += 1) opt[i][i] = i;
    for (let length = 2; length <= n; length += 1) {
      for (let i = 0; i + length <= n; i += 1) {
        const j = i + length - 1;
        const lower = Math.max(i, opt[i][j - 1]);
        const upper = Math.min(j - 1, opt[i + 1][j] === null ? j - 1 : opt[i + 1][j]);
        let bestValue = Number.POSITIVE_INFINITY;
        let bestSplit = lower;
        const candidates = [];
        for (let split = i; split < j; split += 1) {
          const allowed = split >= lower && split <= upper;
          const value = candidate(dp, options, i, j, split);
          candidates.push(Object.freeze({ split: split, value: value, allowed: allowed }));
          if (allowed && value < bestValue) {
            bestValue = value;
            bestSplit = split;
          }
        }
        dp[i][j] = bestValue;
        opt[i][j] = bestSplit;
        records.push(Object.freeze({ i: i, j: j, lower: lower, upper: upper, value: bestValue, split: bestSplit, candidates: Object.freeze(candidates) }));
      }
    }
    return Object.freeze({ dp: dp, opt: opt, records: Object.freeze(records) });
  }

  function analyzeConditions(options) {
    const n = options.size;
    let quadrangleViolation = null;
    let intervalViolation = null;
    for (let a = 0; a < n; a += 1) {
      for (let b = a; b < n; b += 1) {
        for (let c = b; c < n; c += 1) {
          for (let d = c; d < n; d += 1) {
            const left = intervalWeight(options, a, c) + intervalWeight(options, b, d);
            const right = intervalWeight(options, a, d) + intervalWeight(options, b, c);
            if (!quadrangleViolation && left > right) {
              quadrangleViolation = Object.freeze({ a: a, b: b, c: c, d: d, left: left, right: right });
            }
            const inner = intervalWeight(options, b, c);
            const outer = intervalWeight(options, a, d);
            if (!intervalViolation && inner > outer) {
              intervalViolation = Object.freeze({ a: a, b: b, c: c, d: d, inner: inner, outer: outer });
            }
          }
        }
      }
    }
    return Object.freeze({
      quadrangle: quadrangleViolation === null,
      intervalMonotone: intervalViolation === null,
      quadrangleViolation: quadrangleViolation,
      intervalViolation: intervalViolation,
    });
  }

  function optViolations(full) {
    const result = [];
    const n = full.opt.length;
    for (let length = 2; length <= n; length += 1) {
      for (let i = 0; i + length <= n; i += 1) {
        const j = i + length - 1;
        const lower = full.opt[i][j - 1];
        const value = full.opt[i][j];
        const upper = full.opt[i + 1][j];
        if (!(lower <= value && value <= upper)) {
          result.push(Object.freeze({ i: i, j: j, lower: lower, optimum: value, upper: upper }));
        }
      }
    }
    return Object.freeze(result);
  }

  function buildTrace(input) {
    const options = normalizeOptions(input);
    const full = solveFull(options);
    const knuth = solveKnuth(options);
    const conditions = analyzeConditions(options);
    const violations = optViolations(full);
    const chosen = options.method === "knuth" ? knuth : full;
    const fullByState = new Map(full.records.map(function (record) { return [record.i + ":" + record.j, record]; }));
    const events = chosen.records.map(function (record) {
      const reference = fullByState.get(record.i + ":" + record.j);
      return Object.freeze({
        i: record.i,
        j: record.j,
        lower: record.lower,
        upper: record.upper,
        value: record.value,
        split: record.split,
        candidates: record.candidates,
        exactValue: reference.value,
        exactSplit: reference.split,
        missedOptimum: record.value !== reference.value,
      });
    });
    return Object.freeze({
      options: options,
      full: full,
      knuth: knuth,
      conditions: conditions,
      optViolations: violations,
      events: Object.freeze(events),
      exactAnswer: full.dp[0][options.size - 1],
      chosenAnswer: chosen.dp[0][options.size - 1],
    });
  }

  function createState(input) {
    return Object.freeze({ trace: buildTrace(input), index: 0 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.index)) {
      throw new TypeError("Повреждено состояние продвинутой DP-лаборатории.");
    }
    if (state.index >= state.trace.events.length) return state;
    return Object.freeze({ trace: state.trace, index: state.index + 1 });
  }

  function isFinished(state) {
    return state.index >= state.trace.events.length;
  }

  function visualModel(state) {
    const trace = state.trace;
    const completed = trace.events.slice(0, state.index);
    const current = state.index > 0 ? trace.events[state.index - 1] : null;
    return Object.freeze({
      options: trace.options,
      conditions: trace.conditions,
      optViolations: trace.optViolations,
      current: current,
      completed: Object.freeze(completed),
      exactAnswer: trace.exactAnswer,
      chosenAnswer: trace.chosenAnswer,
      finished: isFinished(state),
      full: trace.full,
      knuth: trace.knuth,
    });
  }

  return Object.freeze({
    SCENARIOS: SCENARIOS,
    normalizeOptions: normalizeOptions,
    intervalWeight: intervalWeight,
    solveFull: solveFull,
    solveKnuth: solveKnuth,
    analyzeConditions: analyzeConditions,
    optViolations: optViolations,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    isFinished: isFinished,
    visualModel: visualModel,
  });
});
