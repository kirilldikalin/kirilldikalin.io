(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ExhaustiveSearchCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ITEMS = 9;
  const PRESETS = Object.freeze({
    classic: Object.freeze({ items: Object.freeze([7, 5, 4, 3, 2, 1]), target: 12 }),
    tight: Object.freeze({ items: Object.freeze([9, 8, 6, 5, 4, 3, 2]), target: 17 }),
    bound: Object.freeze({ items: Object.freeze([12, 11, 8, 7, 5, 4, 3]), target: 21 }),
  });
  const BRANCH_ORDERS = Object.freeze(["include-first", "exclude-first"]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function boundedInteger(rawValue, label, minimum, maximum) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return value;
  }

  function preset(name) {
    const selected = PRESETS[name];
    if (!selected) {
      throw new RangeError("Неизвестный набор для поиска");
    }
    return { items: selected.items.slice(), target: selected.target };
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const base = options.preset ? preset(options.preset) : null;
    const rawItems = options.items || (base && base.items) || PRESETS.classic.items;
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
      throw new RangeError("Набор должен содержать от 1 до " + MAX_ITEMS + " положительных чисел");
    }
    const items = rawItems.map(function (value, index) {
      return boundedInteger(value, "items[" + index + "]", 1, 99);
    });
    const total = items.reduce(function (sum, value) { return sum + value; }, 0);
    const target = boundedInteger(
      options.target === undefined ? ((base && base.target) || Math.ceil(total / 2)) : options.target,
      "target",
      1,
      total
    );
    const branchOrder = options.branchOrder || "include-first";
    if (!BRANCH_ORDERS.includes(branchOrder)) {
      throw new RangeError("Неизвестный порядок ветвления");
    }
    const incumbentMode = options.incumbentMode || "empty";
    if (incumbentMode !== "empty" && incumbentMode !== "greedy") {
      throw new RangeError("Неизвестный способ начального incumbent");
    }
    return deepFreeze({
      items: items,
      target: target,
      branchOrder: branchOrder,
      useFeasibilityPruning: Boolean(options.useFeasibilityPruning),
      useBound: Boolean(options.useBound),
      incumbentMode: incumbentMode,
    });
  }

  function greedyIncumbent(items, target) {
    const candidates = items.map(function (value, index) {
      return { value: value, index: index };
    }).sort(function (left, right) {
      return right.value - left.value || left.index - right.index;
    });
    let sum = 0;
    const selected = [];
    candidates.forEach(function (candidate) {
      if (sum + candidate.value <= target) {
        sum += candidate.value;
        selected.push(candidate.index);
      }
    });
    selected.sort(function (left, right) { return left - right; });
    return deepFreeze({ value: sum, selected: selected });
  }

  function exactOptimum(rawItems, rawTarget) {
    const options = normalizeOptions({ items: rawItems, target: rawTarget });
    let bestValue = 0;
    let bestMask = 0;
    const combinations = 1 << options.items.length;
    for (let mask = 0; mask < combinations; mask += 1) {
      let sum = 0;
      for (let index = 0; index < options.items.length; index += 1) {
        if ((mask & (1 << index)) !== 0) sum += options.items[index];
      }
      if (sum <= options.target && sum > bestValue) {
        bestValue = sum;
        bestMask = mask;
      }
    }
    return deepFreeze({
      value: bestValue,
      selected: options.items.map(function (_, index) { return index; }).filter(function (index) {
        return (bestMask & (1 << index)) !== 0;
      }),
    });
  }

  function remainingPotential(items, index) {
    let sum = 0;
    for (let cursor = index; cursor < items.length; cursor += 1) sum += items[cursor];
    return sum;
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const exact = exactOptimum(options.items, options.target);
    const seed = options.incumbentMode === "greedy"
      ? greedyIncumbent(options.items, options.target)
      : { value: 0, selected: [] };
    let incumbentValue = seed.value;
    let incumbentSelection = seed.selected.slice();
    let visited = 0;
    let pruned = 0;
    let nextId = 0;
    const nodes = [];
    const frames = [];
    const stack = [{
      id: nextId++, parentId: null, depth: 0, index: 0, sum: 0,
      selected: [], decision: "root", path: "",
    }];

    while (stack.length) {
      const candidate = stack.pop();
      visited += 1;
      const remaining = remainingPotential(options.items, candidate.index);
      const optimisticBound = candidate.sum > options.target
        ? -Infinity
        : Math.min(options.target, candidate.sum + remaining);
      let prunedReason = null;
      let incumbentChanged = false;

      if (candidate.sum <= options.target && candidate.sum > incumbentValue) {
        incumbentValue = candidate.sum;
        incumbentSelection = candidate.selected.slice();
        incumbentChanged = true;
      }
      if (options.useFeasibilityPruning && candidate.sum > options.target) {
        prunedReason = "infeasible";
      } else if (options.useBound && optimisticBound <= incumbentValue) {
        prunedReason = "bound";
      }

      const isLeaf = candidate.index === options.items.length;
      if (prunedReason) pruned += 1;
      const node = Object.assign({}, candidate, {
        visitOrder: visited,
        optimisticBound: optimisticBound,
        prunedReason: prunedReason,
        isLeaf: isLeaf,
      });
      nodes.push(node);

      if (!isLeaf && !prunedReason) {
        const value = options.items[candidate.index];
        const includeChild = {
          id: nextId++, parentId: candidate.id, depth: candidate.depth + 1,
          index: candidate.index + 1, sum: candidate.sum + value,
          selected: candidate.selected.concat(candidate.index), decision: "include",
          path: candidate.path + "1",
        };
        const excludeChild = {
          id: nextId++, parentId: candidate.id, depth: candidate.depth + 1,
          index: candidate.index + 1, sum: candidate.sum,
          selected: candidate.selected.slice(), decision: "exclude",
          path: candidate.path + "0",
        };
        if (options.branchOrder === "include-first") {
          stack.push(excludeChild, includeChild);
        } else {
          stack.push(includeChild, excludeChild);
        }
      }

      const message = prunedReason === "infeasible"
        ? "Ветка отсечена: сумма уже превышает цель, а все числа положительны"
        : prunedReason === "bound"
          ? "Ветка отсечена: даже оптимистическая оценка не улучшает incumbent"
          : incumbentChanged
            ? "Найдено новое лучшее допустимое частичное решение"
            : isLeaf
              ? "Достигнут лист дерева решений"
              : "Частичное решение разветвляется на взять и пропустить";
      frames.push(deepFreeze({
        cursor: frames.length,
        currentNodeId: candidate.id,
        visited: visited,
        pruned: pruned,
        frontierIds: stack.map(function (entry) { return entry.id; }),
        incumbentValue: incumbentValue,
        incumbentSelection: incumbentSelection.slice(),
        message: message,
        finished: stack.length === 0,
      }));
    }

    if (incumbentValue !== exact.value) {
      throw new Error("Отсечение потеряло оптимальное решение");
    }
    return deepFreeze({ options: options, nodes: nodes, frames: frames, optimum: exact });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) {
      throw new TypeError("Некорректное состояние лаборатории поиска");
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
      throw new TypeError("Некорректное состояние визуализации поиска");
    }
    const frame = state.trace.frames[state.cursor];
    const visibleNodes = state.trace.nodes.filter(function (node) {
      return node.visitOrder <= frame.visited;
    });
    const frontier = new Set(frame.frontierIds);
    return deepFreeze({
      frame: frame,
      options: state.trace.options,
      nodes: visibleNodes.map(function (node) {
        return Object.assign({}, node, {
          current: node.id === frame.currentNodeId,
          frontier: frontier.has(node.id),
        });
      }),
      optimum: state.trace.optimum,
      totalVisited: state.trace.nodes.length,
      finished: state.finished,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    PRESETS: PRESETS,
    BRANCH_ORDERS: BRANCH_ORDERS,
    normalizeOptions: normalizeOptions,
    greedyIncumbent: greedyIncumbent,
    exactOptimum: exactOptimum,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
