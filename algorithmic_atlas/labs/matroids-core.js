(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MatroidsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  const SYSTEMS = deepFreeze({
    uniform: {
      title: "Равномерный матроид U₂,₄", kind: "uniform", rank: 2,
      elements: [
        { id: "a", label: "a", weight: 8 }, { id: "b", label: "b", weight: 6 },
        { id: "c", label: "c", weight: 4 }, { id: "d", label: "d", weight: 2 },
      ],
      initialA: ["c"], initialB: ["a", "b"],
    },
    partition: {
      title: "Матроид разбиения", kind: "partition",
      groups: { warm: 1, cool: 2 },
      elements: [
        { id: "r", label: "r", group: "warm", weight: 9 },
        { id: "o", label: "o", group: "warm", weight: 5 },
        { id: "b", label: "b", group: "cool", weight: 7 },
        { id: "g", label: "g", group: "cool", weight: 4 },
        { id: "v", label: "v", group: "cool", weight: 1 },
      ],
      initialA: ["o"], initialB: ["r", "b", "g"],
    },
    graphic: {
      title: "Графический матроид", kind: "graphic",
      vertices: ["1", "2", "3", "4"],
      elements: [
        { id: "e12", label: "12", u: "1", v: "2", weight: 8 },
        { id: "e23", label: "23", u: "2", v: "3", weight: 7 },
        { id: "e34", label: "34", u: "3", v: "4", weight: 6 },
        { id: "e14", label: "14", u: "1", v: "4", weight: 5 },
        { id: "e13", label: "13", u: "1", v: "3", weight: 2 },
      ],
      initialA: ["e13"], initialB: ["e12", "e23", "e34"],
    },
    matching: {
      title: "Паросочетания пути: не матроид", kind: "matching",
      vertices: ["a", "b", "c", "d"],
      elements: [
        { id: "e1", label: "ab", u: "a", v: "b", weight: 2 },
        { id: "e2", label: "bc", u: "b", v: "c", weight: 3 },
        { id: "e3", label: "cd", u: "c", v: "d", weight: 2 },
      ],
      initialA: ["e2"], initialB: ["e1", "e3"],
    },
  });

  function system(name) {
    const value = SYSTEMS[name];
    if (!value) throw new RangeError("Неизвестная система независимости");
    return value;
  }

  function normalizeSet(data, rawIds, label) {
    if (!Array.isArray(rawIds)) throw new TypeError(label + " должно быть массивом");
    const valid = new Set(data.elements.map(function (element) { return element.id; }));
    const ids = [];
    rawIds.forEach(function (id) {
      if (!valid.has(id)) throw new RangeError(label + " содержит неизвестный элемент " + id);
      if (!ids.includes(id)) ids.push(id);
    });
    return ids.sort();
  }

  function isIndependent(data, rawIds) {
    const ids = normalizeSet(data, rawIds, "множество");
    if (data.kind === "uniform") return ids.length <= data.rank;
    if (data.kind === "partition") {
      const elements = new Map(data.elements.map(function (element) { return [element.id, element]; }));
      const counts = {};
      ids.forEach(function (id) {
        const group = elements.get(id).group;
        counts[group] = (counts[group] || 0) + 1;
      });
      return Object.keys(counts).every(function (group) { return counts[group] <= data.groups[group]; });
    }
    if (data.kind === "matching") {
      const elements = new Map(data.elements.map(function (element) { return [element.id, element]; }));
      const used = new Set();
      return ids.every(function (id) {
        const edge = elements.get(id);
        if (used.has(edge.u) || used.has(edge.v)) return false;
        used.add(edge.u); used.add(edge.v); return true;
      });
    }
    if (data.kind === "graphic") {
      const parent = new Map(data.vertices.map(function (vertex) { return [vertex, vertex]; }));
      function find(vertex) {
        let current = vertex;
        while (parent.get(current) !== current) current = parent.get(current);
        return current;
      }
      const edges = new Map(data.elements.map(function (element) { return [element.id, element]; }));
      return ids.every(function (id) {
        const edge = edges.get(id);
        const left = find(edge.u); const right = find(edge.v);
        if (left === right) return false;
        parent.set(left, right); return true;
      });
    }
    throw new RangeError("Неизвестный тип системы независимости");
  }

  function exchangeCandidates(data, rawA, rawB) {
    const a = normalizeSet(data, rawA, "A");
    const b = normalizeSet(data, rawB, "B");
    if (!isIndependent(data, a) || !isIndependent(data, b) || a.length >= b.length) return [];
    return b.filter(function (id) { return !a.includes(id) && isIndependent(data, a.concat(id)); });
  }

  function subsets(elements) {
    const result = [];
    for (let mask = 0; mask < (1 << elements.length); mask += 1) {
      result.push(elements.filter(function (_, index) { return (mask & (1 << index)) !== 0; })
        .map(function (element) { return element.id; }));
    }
    return result;
  }

  function checkAxioms(data) {
    const all = subsets(data.elements);
    const independent = all.filter(function (ids) { return isIndependent(data, ids); });
    const hereditaryFailure = independent.find(function (ids) {
      return subsets(ids.map(function (id) { return { id: id }; }))
        .some(function (subset) { return !isIndependent(data, subset); });
    });
    let exchangeFailure = null;
    for (const a of independent) {
      for (const b of independent) {
        if (a.length < b.length && exchangeCandidates(data, a, b).length === 0) {
          exchangeFailure = { A: a.slice(), B: b.slice() };
          break;
        }
      }
      if (exchangeFailure) break;
    }
    return deepFreeze({
      empty: isIndependent(data, []),
      hereditary: !hereditaryFailure,
      exchange: !exchangeFailure,
      hereditaryFailure: hereditaryFailure || null,
      exchangeFailure: exchangeFailure,
      isMatroid: isIndependent(data, []) && !hereditaryFailure && !exchangeFailure,
    });
  }

  function greedyMaxWeight(data) {
    const selected = [];
    const decisions = [];
    data.elements.slice().sort(function (left, right) {
      return right.weight - left.weight || left.id.localeCompare(right.id);
    }).forEach(function (element) {
      const accepted = isIndependent(data, selected.concat(element.id));
      if (accepted) selected.push(element.id);
      decisions.push({ id: element.id, accepted: accepted, selected: selected.slice() });
    });
    const weight = selected.reduce(function (sum, id) {
      return sum + data.elements.find(function (element) { return element.id === id; }).weight;
    }, 0);
    return deepFreeze({ selected: selected.sort(), weight: weight, decisions: decisions });
  }

  function exactMaxWeight(data) {
    let best = []; let bestWeight = -Infinity;
    subsets(data.elements).forEach(function (ids) {
      if (!isIndependent(data, ids)) return;
      const weight = ids.reduce(function (sum, id) {
        return sum + data.elements.find(function (element) { return element.id === id; }).weight;
      }, 0);
      if (weight > bestWeight) { best = ids.slice(); bestWeight = weight; }
    });
    return deepFreeze({ selected: best.sort(), weight: bestWeight });
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const systemId = options.system || "uniform";
    const data = system(systemId);
    return deepFreeze({
      system: systemId,
      A: normalizeSet(data, options.A === undefined ? data.initialA : options.A, "A"),
      B: normalizeSet(data, options.B === undefined ? data.initialB : options.B, "B"),
    });
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const data = system(options.system);
    const axioms = checkAxioms(data);
    const candidates = exchangeCandidates(data, options.A, options.B);
    const greedy = greedyMaxWeight(data);
    const optimum = exactMaxWeight(data);
    const frames = [deepFreeze({
      phase: "sets", currentId: null,
      message: "Сначала проверяем, принадлежат ли выбранные A и B семейству независимых множеств",
    })];
    data.elements.forEach(function (element) {
      frames.push(deepFreeze({
        phase: "exchange", currentId: element.id,
        message: candidates.includes(element.id)
          ? "Элемент " + element.label + " можно перенести из B в A, не потеряв независимость"
          : "Элемент " + element.label + " не является допустимым обменом для этой пары",
      }));
    });
    greedy.decisions.forEach(function (decision) {
      frames.push(deepFreeze({
        phase: "greedy", currentId: decision.id, selected: decision.selected.slice(),
        message: decision.accepted
          ? "Жадный алгоритм принимает следующий по весу элемент: независимость сохраняется"
          : "Жадный алгоритм пропускает элемент: добавление нарушило бы независимость",
      }));
    });
    frames.push(deepFreeze({
      phase: "result", currentId: null, selected: greedy.selected.slice(),
      message: greedy.weight === optimum.weight
        ? "Жадный результат совпал с точным максимумом веса"
        : "Система не матроид: жадный результат оказался хуже точного максимума",
    }));
    return deepFreeze({ options: options, data: data, axioms: axioms, candidates: candidates, greedy: greedy, optimum: optimum, frames: frames });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) throw new TypeError("Некорректное состояние лаборатории матроидов");
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({ trace: state.trace, cursor: cursor, finished: cursor === state.trace.frames.length - 1 });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) throw new TypeError("Некорректное состояние визуализации");
    const frame = state.trace.frames[state.cursor];
    return deepFreeze({
      options: state.trace.options, data: state.trace.data, frame: frame,
      candidates: state.trace.candidates, axioms: state.trace.axioms,
      greedy: state.trace.greedy, optimum: state.trace.optimum,
      elements: state.trace.data.elements.map(function (element) {
        return Object.assign({}, element, {
          inA: state.trace.options.A.includes(element.id),
          inB: state.trace.options.B.includes(element.id),
          candidate: state.trace.candidates.includes(element.id),
          current: frame.currentId === element.id,
          greedySelected: (frame.selected || []).includes(element.id),
        });
      }),
    });
  }

  return deepFreeze({
    SYSTEMS: SYSTEMS,
    system: system,
    normalizeSet: normalizeSet,
    normalizeOptions: normalizeOptions,
    isIndependent: isIndependent,
    exchangeCandidates: exchangeCandidates,
    checkAxioms: checkAxioms,
    greedyMaxWeight: greedyMaxWeight,
    exactMaxWeight: exactMaxWeight,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
