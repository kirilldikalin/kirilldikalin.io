(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreedyAlgorithmsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  const SCENARIOS = deepFreeze({
    exchange: {
      title: "Обменное доказательство",
      objective: "cardinality",
      intervals: [
        { id: "b", start: 0, end: 2, weight: 1, lane: 0 },
        { id: "a", start: 0, end: 3, weight: 1, lane: 1 },
        { id: "c", start: 2, end: 4, weight: 1, lane: 0 },
        { id: "d", start: 3, end: 5, weight: 1, lane: 1 },
        { id: "e", start: 4, end: 6, weight: 1, lane: 0 },
        { id: "f", start: 5, end: 7, weight: 1, lane: 1 },
      ],
      witness: ["a", "d", "f"],
      exchanges: [
        { remove: "a", add: "b", result: ["b", "d", "f"] },
        { remove: "d", add: "c", result: ["b", "c", "f"] },
        { remove: "f", add: "e", result: ["b", "c", "e"] },
      ],
    },
    weighted: {
      title: "Контрпример с весами",
      objective: "weight",
      intervals: [
        { id: "a", start: 0, end: 2, weight: 2, lane: 0 },
        { id: "b", start: 2, end: 4, weight: 2, lane: 0 },
        { id: "c", start: 4, end: 6, weight: 2, lane: 0 },
        { id: "h", start: 0, end: 6, weight: 10, lane: 1 },
      ],
      witness: ["h"],
      exchanges: [],
    },
  });
  const POLICIES = deepFreeze(["earliest-finish", "shortest-first", "highest-weight"]);

  function scenario(name) {
    const value = SCENARIOS[name];
    if (!value) throw new RangeError("Неизвестный сценарий жадной лаборатории");
    return value;
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const scenarioId = options.scenario || "exchange";
    const policy = options.policy || "earliest-finish";
    scenario(scenarioId);
    if (!POLICIES.includes(policy)) throw new RangeError("Неизвестное правило выбора");
    return deepFreeze({ scenario: scenarioId, policy: policy });
  }

  function byId(intervals) {
    const map = new Map();
    intervals.forEach(function (interval) { map.set(interval.id, interval); });
    return map;
  }

  function compatible(left, right) {
    return left.end <= right.start || right.end <= left.start;
  }

  function isFeasible(intervals, ids) {
    const map = byId(intervals);
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return false;
    const selected = ids.map(function (id) { return map.get(id); });
    if (selected.some(function (interval) { return !interval; })) return false;
    for (let i = 0; i < selected.length; i += 1) {
      for (let j = i + 1; j < selected.length; j += 1) {
        if (!compatible(selected[i], selected[j])) return false;
      }
    }
    return true;
  }

  function score(intervals, ids, objective) {
    const map = byId(intervals);
    if (objective === "cardinality") return ids.length;
    return ids.reduce(function (total, id) { return total + map.get(id).weight; }, 0);
  }

  function orderedIntervals(intervals, policy) {
    return intervals.slice().sort(function (left, right) {
      if (policy === "earliest-finish") {
        return left.end - right.end || left.start - right.start || left.id.localeCompare(right.id);
      }
      if (policy === "shortest-first") {
        return (left.end - left.start) - (right.end - right.start) || left.end - right.end || left.id.localeCompare(right.id);
      }
      return right.weight - left.weight || left.end - right.end || left.id.localeCompare(right.id);
    });
  }

  function greedySchedule(intervals, policy) {
    if (!POLICIES.includes(policy)) throw new RangeError("Неизвестное правило выбора");
    const selected = [];
    const decisions = [];
    orderedIntervals(intervals, policy).forEach(function (interval) {
      const accepted = selected.every(function (id) {
        return compatible(interval, intervals.find(function (candidate) { return candidate.id === id; }));
      });
      if (accepted) selected.push(interval.id);
      decisions.push(deepFreeze({ id: interval.id, accepted: accepted, selected: selected.slice() }));
    });
    return deepFreeze({ selected: selected, decisions: decisions });
  }

  function exactOptimum(intervals, objective) {
    if (!Array.isArray(intervals) || intervals.length > 20) throw new RangeError("Слишком много интервалов для эталонного перебора");
    let best = [];
    let bestScore = -Infinity;
    const count = 1 << intervals.length;
    for (let mask = 0; mask < count; mask += 1) {
      const ids = intervals.filter(function (_, index) { return (mask & (1 << index)) !== 0; })
        .map(function (interval) { return interval.id; });
      if (!isFeasible(intervals, ids)) continue;
      const value = score(intervals, ids, objective);
      if (value > bestScore || (value === bestScore && ids.length > best.length)) {
        best = ids;
        bestScore = value;
      }
    }
    return deepFreeze({ selected: best, score: bestScore });
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const data = scenario(options.scenario);
    const greedy = greedySchedule(data.intervals, options.policy);
    const optimum = exactOptimum(data.intervals, data.objective);
    const frames = [deepFreeze({
      phase: "start", currentId: null, selected: [], witness: data.witness.slice(),
      message: "Правило ещё не применялось: сравните интервалы и предскажите первый выбор",
    })];
    greedy.decisions.forEach(function (decision) {
      frames.push(deepFreeze({
        phase: "choice", currentId: decision.id, accepted: decision.accepted,
        selected: decision.selected.slice(), witness: data.witness.slice(),
        message: decision.accepted
          ? "Интервал совместим с уже выбранными и добавлен в жадное решение"
          : "Интервал пересекает выбранный и потому отвергнут этим правилом",
      }));
    });
    if (options.scenario === "exchange" && options.policy === "earliest-finish") {
      let witness = data.witness.slice();
      data.exchanges.forEach(function (exchange, index) {
        const before = witness.slice();
        witness = exchange.result.slice();
        if (!isFeasible(data.intervals, witness) || witness.length !== before.length) {
          throw new Error("Некорректный обмен в учебном свидетельстве");
        }
        frames.push(deepFreeze({
          phase: "exchange", currentId: exchange.add, removedId: exchange.remove,
          selected: greedy.selected.slice(), witness: witness.slice(), exchangeIndex: index,
          message: "Заменяем " + exchange.remove + " на " + exchange.add +
            ": допустимость и число интервалов сохраняются",
        }));
      });
    }
    frames.push(deepFreeze({
      phase: "result", currentId: null, selected: greedy.selected.slice(),
      witness: optimum.selected.slice(),
      message: score(data.intervals, greedy.selected, data.objective) === optimum.score
        ? "Жадное решение совпало с эталонным оптимумом для выбранной цели"
        : "Получен контрпример: локально естественное правило уступило оптимуму",
    }));
    return deepFreeze({ options: options, data: data, greedy: greedy, optimum: optimum, frames: frames });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) throw new TypeError("Некорректное состояние жадной лаборатории");
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({ trace: state.trace, cursor: cursor, finished: cursor === state.trace.frames.length - 1 });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) throw new TypeError("Некорректное состояние визуализации");
    const frame = state.trace.frames[state.cursor];
    return deepFreeze({
      options: state.trace.options,
      scenario: state.trace.data,
      frame: frame,
      intervals: state.trace.data.intervals.map(function (interval) {
        return Object.assign({}, interval, {
          selected: frame.selected.includes(interval.id),
          witness: frame.witness.includes(interval.id),
          current: frame.currentId === interval.id,
          removed: frame.removedId === interval.id,
        });
      }),
      greedyScore: score(state.trace.data.intervals, state.trace.greedy.selected, state.trace.data.objective),
      optimumScore: state.trace.optimum.score,
    });
  }

  return deepFreeze({
    SCENARIOS: SCENARIOS,
    POLICIES: POLICIES,
    normalizeOptions: normalizeOptions,
    compatible: compatible,
    isFeasible: isFeasible,
    score: score,
    greedySchedule: greedySchedule,
    exactOptimum: exactOptimum,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
