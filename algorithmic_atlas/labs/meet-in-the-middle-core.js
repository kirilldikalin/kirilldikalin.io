(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MeetInTheMiddleCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ITEMS = 14;
  const MAX_ABS_VALUE = 1000000000000n;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function parseInteger(value, label) {
    const text = String(value).trim();
    if (!/^[+-]?\d+$/.test(text)) throw new TypeError(label + " должен быть целым числом");
    const parsed = BigInt(text);
    if (parsed < -MAX_ABS_VALUE || parsed > MAX_ABS_VALUE) {
      throw new RangeError(label + " слишком велик для учебной визуализации");
    }
    return parsed;
  }

  function parseValues(value) {
    const parts = Array.isArray(value)
      ? value.map(String)
      : String(value).split(/[\s,;]+/).filter(Boolean);
    if (!parts.length || parts.length > MAX_ITEMS) {
      throw new RangeError("Нужно от 1 до " + MAX_ITEMS + " целых чисел");
    }
    return deepFreeze(parts.map(function (part, index) {
      return parseInteger(part, "Элемент " + (index + 1));
    }));
  }

  function enumerateSubsets(values, offset) {
    if (!Array.isArray(values) || values.length > 20) {
      throw new RangeError("Половина слишком велика для полного списка сумм");
    }
    const result = [];
    const count = 1 << values.length;
    for (let mask = 0; mask < count; mask += 1) {
      let sum = 0n;
      const items = [];
      for (let bit = 0; bit < values.length; bit += 1) {
        if ((mask & (1 << bit)) !== 0) {
          sum += values[bit];
          items.push((offset || 0) + bit);
        }
      }
      result.push(deepFreeze({ mask: mask, sum: sum, items: items }));
    }
    return deepFreeze(result);
  }

  function compareEntries(left, right) {
    if (left.sum < right.sum) return -1;
    if (left.sum > right.sum) return 1;
    return left.mask - right.mask;
  }

  function lowerBound(entries, target) {
    let left = 0;
    let right = entries.length;
    let comparisons = 0;
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2);
      comparisons += 1;
      if (entries[middle].sum < target) left = middle + 1;
      else right = middle;
    }
    return deepFreeze({ index: left, comparisons: comparisons });
  }

  function absolute(value) {
    return value < 0n ? -value : value;
  }

  function solveMeetInMiddle(rawValues, rawTarget) {
    const values = parseValues(rawValues);
    const target = parseInteger(rawTarget, "Цель");
    const middle = Math.floor(values.length / 2);
    const leftValues = values.slice(0, middle);
    const rightValues = values.slice(middle);
    const leftEntries = enumerateSubsets(leftValues, 0);
    const rightEntries = enumerateSubsets(rightValues, middle);
    const sortedRight = deepFreeze(rightEntries.slice().sort(compareEntries));
    const searches = [];
    const exactPairs = [];
    let comparisons = 0;
    let best = null;

    leftEntries.forEach(function (leftEntry) {
      const complement = target - leftEntry.sum;
      const search = lowerBound(sortedRight, complement);
      comparisons += search.comparisons;
      const candidateIndices = [];
      if (search.index < sortedRight.length) candidateIndices.push(search.index);
      if (search.index > 0) candidateIndices.push(search.index - 1);
      let selected = null;
      candidateIndices.forEach(function (index) {
        const rightEntry = sortedRight[index];
        const total = leftEntry.sum + rightEntry.sum;
        const distance = absolute(total - target);
        if (!selected || distance < selected.distance) {
          selected = { index: index, entry: rightEntry, total: total, distance: distance };
        }
        if (!best || distance < best.distance) {
          best = {
            left: leftEntry,
            right: rightEntry,
            total: total,
            distance: distance,
          };
        }
      });
      if (search.index < sortedRight.length && sortedRight[search.index].sum === complement) {
        let index = search.index;
        while (index < sortedRight.length && sortedRight[index].sum === complement) {
          exactPairs.push(deepFreeze({ left: leftEntry, right: sortedRight[index] }));
          index += 1;
        }
      }
      searches.push(deepFreeze({
        left: leftEntry,
        complement: complement,
        insertionIndex: search.index,
        comparisons: search.comparisons,
        selectedRight: selected ? selected.entry : null,
        total: selected ? selected.total : null,
        distance: selected ? selected.distance : null,
      }));
    });
    if (!best) throw new Error("Не удалось построить ни одной пары половин");
    return deepFreeze({
      values: values,
      target: target,
      middle: middle,
      leftValues: leftValues,
      rightValues: rightValues,
      leftEntries: leftEntries,
      rightEntries: rightEntries,
      sortedRight: sortedRight,
      searches: searches,
      exactPairs: exactPairs,
      best: best,
      comparisons: comparisons,
      memoryEntries: leftEntries.length + rightEntries.length,
    });
  }

  function buildTrace(rawValues, rawTarget) {
    const solution = solveMeetInMiddle(rawValues, rawTarget);
    const frames = [
      deepFreeze({
        phase: "split",
        searchIndex: -1,
        message: "Переменные разделены на две независимые половины",
      }),
      deepFreeze({
        phase: "enumerate-left",
        searchIndex: -1,
        message: "Перечислены все суммы подмножеств левой половины",
      }),
      deepFreeze({
        phase: "enumerate-right",
        searchIndex: -1,
        message: "Перечислены все суммы подмножеств правой половины",
      }),
      deepFreeze({
        phase: "sort-right",
        searchIndex: -1,
        message: "Правый список отсортирован для бинарного поиска дополнений",
      }),
    ];
    solution.searches.forEach(function (search, index) {
      frames.push(deepFreeze({
        phase: "pair",
        searchIndex: index,
        search: search,
        message: search.total === solution.target
          ? "Найдена точная пара сумм двух половин"
          : "Бинарный поиск проверил ближайшее дополнение к текущей левой сумме",
      }));
    });
    frames.push(deepFreeze({
      phase: "finish",
      searchIndex: solution.searches.length - 1,
      message: solution.exactPairs.length
        ? "Точная целевая сумма найдена без перебора всех 2^n подмножеств"
        : "Точного решения нет; показана ближайшая найденная сумма",
    }));
    return deepFreeze({ solution: solution, frames: frames });
  }

  function createState(values, target) {
    const trace = buildTrace(values, target);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) {
      throw new TypeError("Некорректное состояние meet-in-the-middle");
    }
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({
      trace: state.trace,
      cursor: cursor,
      finished: cursor === state.trace.frames.length - 1,
    });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) {
      throw new TypeError("Некорректное состояние визуализации");
    }
    const frame = state.trace.frames[state.cursor];
    const solution = state.trace.solution;
    const processedSearches = frame.phase === "finish"
      ? solution.searches.length
      : Math.max(0, frame.searchIndex + 1);
    return deepFreeze({
      frame: frame,
      values: solution.values,
      target: solution.target,
      middle: solution.middle,
      leftEntries: solution.leftEntries,
      rightEntries: frame.phase === "split" || frame.phase === "enumerate-left"
        ? solution.rightEntries
        : solution.sortedRight,
      rightSorted: !["split", "enumerate-left", "enumerate-right"].includes(frame.phase),
      activeSearch: frame.search || null,
      processedSearches: processedSearches,
      totalSearches: solution.searches.length,
      comparisons: solution.searches.slice(0, processedSearches).reduce(function (sum, search) {
        return sum + search.comparisons;
      }, 0),
      exactPairCount: solution.exactPairs.length,
      best: solution.best,
      memoryEntries: solution.memoryEntries,
    });
  }

  function bruteForce(rawValues, rawTarget) {
    const values = parseValues(rawValues);
    const target = parseInteger(rawTarget, "Цель");
    if (values.length > 20) throw new RangeError("Эталонный перебор ограничен");
    const entries = enumerateSubsets(values, 0);
    const exact = entries.filter(function (entry) { return entry.sum === target; });
    let best = entries[0];
    entries.forEach(function (entry) {
      if (absolute(entry.sum - target) < absolute(best.sum - target)) best = entry;
    });
    return deepFreeze({ exact: exact, best: best });
  }

  return deepFreeze({
    MAX_ITEMS: MAX_ITEMS,
    parseInteger: parseInteger,
    parseValues: parseValues,
    enumerateSubsets: enumerateSubsets,
    lowerBound: lowerBound,
    solveMeetInMiddle: solveMeetInMiddle,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
    bruteForce: bruteForce,
  });
});
