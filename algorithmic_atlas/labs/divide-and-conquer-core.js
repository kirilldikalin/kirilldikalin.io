(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DivideAndConquerCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_INPUT_SIZE = 64;
  const MAX_NODES = 1600;
  const SCENARIOS = Object.freeze({
    binary: Object.freeze({
      title: "Двоичный поиск",
      recurrence: "T(n)=T(⌊n/2⌋)+1",
      complexity: "Θ(log n)",
    }),
    merge: Object.freeze({
      title: "Сортировка слиянием",
      recurrence: "T(n)=T(⌊n/2⌋)+T(⌈n/2⌉)+n",
      complexity: "Θ(n log n)",
    }),
    karatsuba: Object.freeze({
      title: "Умножение Карацубы",
      recurrence: "T(n)=3T(⌈n/2⌉)+n",
      complexity: "Θ(n^log₂3)",
    }),
    power: Object.freeze({
      title: "Быстрое возведение в степень",
      recurrence: "T(n)=T(⌊n/2⌋)+O(1)",
      complexity: "Θ(log n)",
    }),
    unbalanced: Object.freeze({
      title: "Несбалансированное разбиение",
      recurrence: "T(n)=T(n−1)+T(1)+n",
      complexity: "Θ(n²)",
    }),
  });

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function boundedInteger(raw, label, minimum, maximum) {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return value;
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const scenario = options.scenario || "merge";
    if (!SCENARIOS[scenario]) throw new RangeError("Неизвестный сценарий рекурсии");
    const size = boundedInteger(options.size === undefined ? 16 : options.size, "size", 2, MAX_INPUT_SIZE);
    return deepFreeze({ scenario: scenario, size: size });
  }

  function childSizes(scenario, size) {
    if (size <= 1) return [];
    if (scenario === "binary" || scenario === "power") return [Math.floor(size / 2)];
    if (scenario === "merge") return [Math.floor(size / 2), Math.ceil(size / 2)];
    if (scenario === "karatsuba") {
      const half = Math.ceil(size / 2);
      return [half, half, half];
    }
    if (scenario === "unbalanced") return [size - 1, 1];
    throw new RangeError("Неизвестный сценарий рекурсии");
  }

  function localCost(scenario, size) {
    if (size <= 1) return 1;
    if (scenario === "binary") return 1;
    if (scenario === "power") return size % 2 === 0 ? 1 : 2;
    return size;
  }

  function buildTree(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const nodes = [];
    let nextId = 0;

    function visit(size, parentId, depth, childIndex, path) {
      if (nodes.length >= MAX_NODES) throw new RangeError("Дерево превысило безопасный предел узлов");
      const id = nextId++;
      const node = {
        id: id,
        parentId: parentId,
        depth: depth,
        childIndex: childIndex,
        path: path,
        size: size,
        localCost: localCost(options.scenario, size),
        childIds: [],
      };
      nodes.push(node);
      childSizes(options.scenario, size).forEach(function (childSize, index) {
        node.childIds.push(visit(childSize, id, depth + 1, index, path + String(index)));
      });
      return id;
    }

    visit(options.size, null, 0, 0, "");
    const byId = new Map(nodes.map(function (node) { return [node.id, node]; }));
    function span(id) {
      const node = byId.get(id);
      if (node.childIds.length === 0) return node.localCost;
      return node.localCost + Math.max.apply(null, node.childIds.map(span));
    }
    const levels = [];
    nodes.forEach(function (node) {
      if (!levels[node.depth]) levels[node.depth] = { depth: node.depth, nodes: 0, work: 0, sizes: [] };
      levels[node.depth].nodes += 1;
      levels[node.depth].work += node.localCost;
      levels[node.depth].sizes.push(node.size);
    });
    return deepFreeze({
      options: options,
      nodes: nodes,
      levels: levels,
      totalWork: nodes.reduce(function (sum, node) { return sum + node.localCost; }, 0),
      span: span(0),
      maximumDepth: levels.length - 1,
      description: SCENARIOS[options.scenario],
    });
  }

  function buildEvents(tree) {
    const byId = new Map(tree.nodes.map(function (node) { return [node.id, node]; }));
    const events = [];
    function traverse(id, stack) {
      const node = byId.get(id);
      events.push({
        type: "enter",
        nodeId: id,
        stack: stack.concat(id),
        message: node.childIds.length
          ? "Подзадача делится; дочерние вызовы должны вернуть результаты до combine"
          : "Базовый случай вычисляется непосредственно",
      });
      node.childIds.forEach(function (childId) { traverse(childId, stack.concat(id)); });
      events.push({
        type: node.childIds.length ? "combine" : "return",
        nodeId: id,
        stack: stack.concat(id),
        message: node.childIds.length
          ? "Результаты дочерних подзадач объединяются в родительский результат"
          : "Базовый результат возвращается родителю",
      });
    }
    traverse(0, []);
    return deepFreeze(events);
  }

  function createState(options) {
    const tree = buildTree(options);
    const events = buildEvents(tree);
    return deepFreeze({ tree: tree, events: events, cursor: 0, finished: events.length === 1 });
  }

  function step(state) {
    if (!state || !state.tree || !Array.isArray(state.events)) {
      throw new TypeError("Некорректное состояние дерева рекурсии");
    }
    if (state.cursor >= state.events.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({
      tree: state.tree,
      events: state.events,
      cursor: cursor,
      finished: cursor === state.events.length - 1,
    });
  }

  function visualModel(state) {
    if (!state || !state.events || !state.events[state.cursor]) {
      throw new TypeError("Некорректное состояние визуализации рекурсии");
    }
    const entered = new Set();
    const completed = new Set();
    for (let index = 0; index <= state.cursor; index += 1) {
      const event = state.events[index];
      if (event.type === "enter") entered.add(event.nodeId);
      else completed.add(event.nodeId);
    }
    const event = state.events[state.cursor];
    return deepFreeze({
      event: event,
      tree: state.tree,
      nodes: state.tree.nodes.map(function (node) {
        return Object.assign({}, node, {
          status: node.id === event.nodeId
            ? "current"
            : completed.has(node.id)
              ? "combined"
              : entered.has(node.id)
                ? "waiting"
                : "unseen",
        });
      }),
      enteredCount: entered.size,
      completedCount: completed.size,
      finished: state.finished,
    });
  }

  function solveRecurrence(options) {
    const tree = buildTree(options);
    return deepFreeze({
      totalWork: tree.totalWork,
      span: tree.span,
      levels: tree.levels.map(function (level) {
        return { depth: level.depth, nodes: level.nodes, work: level.work };
      }),
    });
  }

  return {
    MAX_INPUT_SIZE: MAX_INPUT_SIZE,
    MAX_NODES: MAX_NODES,
    SCENARIOS: SCENARIOS,
    normalizeOptions: normalizeOptions,
    childSizes: childSizes,
    localCost: localCost,
    buildTree: buildTree,
    buildEvents: buildEvents,
    createState: createState,
    step: step,
    visualModel: visualModel,
    solveRecurrence: solveRecurrence,
  };
});
