(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DynamicProgrammingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRESETS = Object.freeze({
    classic: Object.freeze({
      capacity: 10,
      items: Object.freeze([
        Object.freeze({ weight: 6, value: 30, label: "A" }),
        Object.freeze({ weight: 3, value: 14, label: "B" }),
        Object.freeze({ weight: 4, value: 16, label: "C" }),
        Object.freeze({ weight: 2, value: 9, label: "D" }),
      ]),
    }),
    collision: Object.freeze({
      capacity: 7,
      items: Object.freeze([
        Object.freeze({ weight: 2, value: 4, label: "A" }),
        Object.freeze({ weight: 3, value: 7, label: "B" }),
        Object.freeze({ weight: 4, value: 8, label: "C" }),
        Object.freeze({ weight: 1, value: 3, label: "D" }),
      ]),
    }),
    dense: Object.freeze({
      capacity: 12,
      items: Object.freeze([
        Object.freeze({ weight: 2, value: 5, label: "A" }),
        Object.freeze({ weight: 5, value: 13, label: "B" }),
        Object.freeze({ weight: 4, value: 10, label: "C" }),
        Object.freeze({ weight: 6, value: 14, label: "D" }),
        Object.freeze({ weight: 3, value: 7, label: "E" }),
      ]),
    }),
  });

  function normalizeOptions(input) {
    const options = input || {};
    const items = Array.isArray(options.items) ? options.items.map(function (item, index) {
      const weight = Number(item.weight);
      const value = Number(item.value);
      if (!Number.isSafeInteger(weight) || weight <= 0 || weight > 20) {
        throw new RangeError("Вес каждого предмета должен быть целым от 1 до 20.");
      }
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
        throw new RangeError("Ценность каждого предмета должна быть целой от 0 до 1000.");
      }
      return Object.freeze({ weight: weight, value: value, label: String(item.label || index + 1) });
    }) : [];
    if (!items.length || items.length > 7) {
      throw new RangeError("Лаборатория поддерживает от 1 до 7 предметов.");
    }
    const capacity = Number(options.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 14) {
      throw new RangeError("Вместимость должна быть целым числом от 1 до 14.");
    }
    const method = options.method || "tabulation";
    if (method !== "tabulation" && method !== "memoization") {
      throw new RangeError("Неизвестный порядок вычисления DP.");
    }
    const stateModel = options.stateModel || "prefix-capacity";
    if (stateModel !== "prefix-capacity" && stateModel !== "capacity-only") {
      throw new RangeError("Неизвестная модель состояния.");
    }
    return Object.freeze({ items: Object.freeze(items), capacity: capacity, method: method, stateModel: stateModel });
  }

  function key(i, capacity) {
    return i + ":" + capacity;
  }

  function computeTable(options) {
    const n = options.items.length;
    const dp = Array.from({ length: n + 1 }, function () {
      return Array(options.capacity + 1).fill(0);
    });
    const choose = Array.from({ length: n + 1 }, function () {
      return Array(options.capacity + 1).fill(false);
    });
    for (let i = 1; i <= n; i += 1) {
      const item = options.items[i - 1];
      for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
        const skip = dp[i - 1][capacity];
        const take = item.weight <= capacity
          ? dp[i - 1][capacity - item.weight] + item.value
          : Number.NEGATIVE_INFINITY;
        if (take > skip) {
          dp[i][capacity] = take;
          choose[i][capacity] = true;
        } else {
          dp[i][capacity] = skip;
        }
      }
    }
    return Object.freeze({ dp: dp, choose: choose });
  }

  function stateCollision(options, table) {
    for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
      const values = new Map();
      for (let i = 0; i <= options.items.length; i += 1) {
        const value = table.dp[i][capacity];
        if (!values.has(value)) values.set(value, []);
        values.get(value).push(i);
      }
      if (values.size > 1) {
        const groups = Array.from(values.entries());
        return Object.freeze({
          capacity: capacity,
          first: Object.freeze({ i: groups[0][1][0], value: groups[0][0] }),
          second: Object.freeze({ i: groups[1][1][0], value: groups[1][0] }),
        });
      }
    }
    return null;
  }

  function dependencies(options, i, capacity) {
    if (i === 0) return [];
    const item = options.items[i - 1];
    const result = [Object.freeze({ i: i - 1, capacity: capacity, kind: "skip" })];
    if (item.weight <= capacity) {
      result.push(Object.freeze({ i: i - 1, capacity: capacity - item.weight, kind: "take" }));
    }
    return result;
  }

  function tabulationEvents(options, table) {
    const events = [];
    for (let i = 1; i <= options.items.length; i += 1) {
      for (let capacity = 0; capacity <= options.capacity; capacity += 1) {
        events.push(Object.freeze({
          type: "compute",
          i: i,
          capacity: capacity,
          value: table.dp[i][capacity],
          chose: table.choose[i][capacity],
          dependencies: Object.freeze(dependencies(options, i, capacity)),
        }));
      }
    }
    return events;
  }

  function memoizationEvents(options, table) {
    const events = [];
    const resolved = new Set();
    function solve(i, capacity) {
      const stateKey = key(i, capacity);
      if (i === 0) return 0;
      if (resolved.has(stateKey)) {
        events.push(Object.freeze({ type: "memo-hit", i: i, capacity: capacity, value: table.dp[i][capacity] }));
        return table.dp[i][capacity];
      }
      const deps = dependencies(options, i, capacity);
      deps.forEach(function (dep) { solve(dep.i, dep.capacity); });
      resolved.add(stateKey);
      events.push(Object.freeze({
        type: "compute",
        i: i,
        capacity: capacity,
        value: table.dp[i][capacity],
        chose: table.choose[i][capacity],
        dependencies: Object.freeze(deps),
      }));
      return table.dp[i][capacity];
    }
    solve(options.items.length, options.capacity);
    return events;
  }

  function reconstruct(options, table) {
    const events = [];
    const selected = [];
    let i = options.items.length;
    let capacity = options.capacity;
    while (i > 0) {
      const item = options.items[i - 1];
      const take = table.choose[i][capacity];
      events.push(Object.freeze({
        type: "reconstruct",
        i: i,
        capacity: capacity,
        take: take,
        itemIndex: i - 1,
      }));
      if (take) {
        selected.push(i - 1);
        capacity -= item.weight;
      }
      i -= 1;
    }
    return Object.freeze({ events: events, selected: Object.freeze(selected.reverse()) });
  }

  function buildTrace(input) {
    const options = normalizeOptions(input);
    const table = computeTable(options);
    if (options.stateModel === "capacity-only") {
      const collision = stateCollision(options, table);
      return Object.freeze({
        options: options,
        validState: false,
        collision: collision,
        table: table,
        events: Object.freeze([Object.freeze({ type: "invalid-state", collision: collision })]),
        optimum: null,
        selected: Object.freeze([]),
      });
    }
    const computeEvents = options.method === "memoization"
      ? memoizationEvents(options, table)
      : tabulationEvents(options, table);
    const reconstruction = reconstruct(options, table);
    return Object.freeze({
      options: options,
      validState: true,
      collision: null,
      table: table,
      events: Object.freeze(computeEvents.concat(reconstruction.events)),
      optimum: table.dp[options.items.length][options.capacity],
      selected: reconstruction.selected,
    });
  }

  function createState(input) {
    return Object.freeze({ trace: buildTrace(input), index: 0 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.index)) {
      throw new TypeError("Повреждено состояние лаборатории DP.");
    }
    if (state.index >= state.trace.events.length) return state;
    return Object.freeze({ trace: state.trace, index: state.index + 1 });
  }

  function isFinished(state) {
    return state.index >= state.trace.events.length;
  }

  function visualModel(state) {
    const trace = state.trace;
    const resolved = new Set();
    for (let capacity = 0; capacity <= trace.options.capacity; capacity += 1) {
      resolved.add(key(0, capacity));
    }
    const selected = [];
    let memoHits = 0;
    for (let index = 0; index < state.index; index += 1) {
      const event = trace.events[index];
      if (event.type === "compute") resolved.add(key(event.i, event.capacity));
      if (event.type === "memo-hit") memoHits += 1;
      if (event.type === "reconstruct" && event.take) selected.push(event.itemIndex);
    }
    const current = state.index > 0 ? trace.events[state.index - 1] : null;
    return Object.freeze({
      options: trace.options,
      validState: trace.validState,
      collision: trace.collision,
      table: trace.table,
      resolved: resolved,
      current: current,
      selected: Object.freeze(selected),
      optimum: trace.optimum,
      finalSelection: trace.selected,
      memoHits: memoHits,
      finished: isFinished(state),
      eventCount: trace.events.length,
    });
  }

  return Object.freeze({
    PRESETS: PRESETS,
    normalizeOptions: normalizeOptions,
    computeTable: computeTable,
    dependencies: dependencies,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    isFinished: isFinished,
    visualModel: visualModel,
  });
});
