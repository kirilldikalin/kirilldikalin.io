(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReductionsAndFormulationsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  const VERTICES = deepFreeze(["a", "b", "c", "d"]);
  const ALL_EDGES = deepFreeze([
    { id: "ab", u: "a", v: "b" }, { id: "ac", u: "a", v: "c" },
    { id: "ad", u: "a", v: "d" }, { id: "bc", u: "b", v: "c" },
    { id: "bd", u: "b", v: "d" }, { id: "cd", u: "c", v: "d" },
  ]);
  const PRESETS = deepFreeze({
    path: { title: "Путь P₄", edgeIds: ["ab", "bc", "cd"], budget: 2 },
    cycle: { title: "Цикл C₄", edgeIds: ["ab", "bc", "cd", "ad"], budget: 2 },
    triangleTail: { title: "Треугольник с хвостом", edgeIds: ["ab", "ac", "bc", "cd"], budget: 2 },
    complete: { title: "Полный граф K₄", edgeIds: ["ab", "ac", "ad", "bc", "bd", "cd"], budget: 3 },
  });

  function boundedInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return number;
  }

  function normalizeIds(rawIds, allowed, label) {
    if (!Array.isArray(rawIds)) throw new TypeError(label + " должно быть массивом");
    const result = [];
    rawIds.forEach(function (id) {
      if (!allowed.includes(id)) throw new RangeError(label + " содержит неизвестный идентификатор " + id);
      if (!result.includes(id)) result.push(id);
    });
    return result.sort();
  }

  function edgesFromIds(edgeIds) {
    return edgeIds.map(function (id) {
      return ALL_EDGES.find(function (edge) { return edge.id === id; });
    });
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const presetId = options.preset || "triangleTail";
    const preset = PRESETS[presetId];
    if (!preset) throw new RangeError("Неизвестный графовый сценарий");
    const edgeIds = normalizeIds(
      options.edgeIds === undefined ? preset.edgeIds : options.edgeIds,
      ALL_EDGES.map(function (edge) { return edge.id; }),
      "edgeIds"
    );
    const selected = normalizeIds(options.selected || [], VERTICES, "selected");
    return deepFreeze({
      preset: presetId,
      edgeIds: edgeIds,
      edges: edgesFromIds(edgeIds),
      budget: boundedInteger(options.budget === undefined ? preset.budget : options.budget, "budget", 0, VERTICES.length),
      selected: selected,
    });
  }

  function isVertexCover(edges, selected) {
    const chosen = new Set(selected);
    return edges.every(function (edge) { return chosen.has(edge.u) || chosen.has(edge.v); });
  }

  function combinations(values, size) {
    const result = [];
    function visit(index, chosen) {
      if (chosen.length === size) { result.push(chosen.slice()); return; }
      for (let cursor = index; cursor <= values.length - (size - chosen.length); cursor += 1) {
        chosen.push(values[cursor]); visit(cursor + 1, chosen); chosen.pop();
      }
    }
    if (size >= 0 && size <= values.length) visit(0, []);
    return result;
  }

  function satClauses(vertices, edges, budget) {
    const edgeClauses = edges.map(function (edge) {
      return deepFreeze({ id: "edge-" + edge.id, kind: "edge", literals: [edge.u, edge.v] });
    });
    const budgetClauses = budget >= vertices.length ? [] : combinations(vertices, budget + 1).map(function (group, index) {
      return deepFreeze({ id: "budget-" + index, kind: "budget", literals: group.map(function (vertex) { return "!" + vertex; }) });
    });
    return deepFreeze(edgeClauses.concat(budgetClauses));
  }

  function evaluateLiteral(literal, selected) {
    const negated = literal.startsWith("!");
    const vertex = negated ? literal.slice(1) : literal;
    const value = selected.includes(vertex);
    return negated ? !value : value;
  }

  function evaluateSAT(clauses, selected) {
    const results = clauses.map(function (clause) {
      return deepFreeze({
        id: clause.id,
        satisfied: clause.literals.some(function (literal) { return evaluateLiteral(literal, selected); }),
      });
    });
    return deepFreeze({
      clauses: results,
      satisfied: results.every(function (result) { return result.satisfied; }),
    });
  }

  function mipEvaluation(vertices, edges, budget, selected) {
    const edgeConstraints = edges.map(function (edge) {
      const left = Number(selected.includes(edge.u)) + Number(selected.includes(edge.v));
      return deepFreeze({ id: edge.id, left: left, satisfied: left >= 1 });
    });
    const budgetLeft = vertices.filter(function (vertex) { return selected.includes(vertex); }).length;
    return deepFreeze({
      edgeConstraints: edgeConstraints,
      budgetLeft: budgetLeft,
      budgetSatisfied: budgetLeft <= budget,
      integral: selected.every(function (vertex) { return vertices.includes(vertex); }),
      feasible: edgeConstraints.every(function (item) { return item.satisfied; }) && budgetLeft <= budget,
    });
  }

  function allAssignments(vertices) {
    const result = [];
    for (let mask = 0; mask < (1 << vertices.length); mask += 1) {
      result.push(vertices.filter(function (_, index) { return (mask & (1 << index)) !== 0; }));
    }
    return result;
  }

  function exactMinimumCover(vertices, edges) {
    let best = null;
    allAssignments(vertices).forEach(function (selected) {
      if (!isVertexCover(edges, selected)) return;
      if (best === null || selected.length < best.length) best = selected.slice();
    });
    return deepFreeze(best || []);
  }

  function partialStatus(vertices, edges, budget, index, selected) {
    if (selected.length > budget) return "budget";
    const assigned = new Set(vertices.slice(0, index));
    const chosen = new Set(selected);
    const impossibleEdge = edges.find(function (edge) {
      return assigned.has(edge.u) && assigned.has(edge.v) && !chosen.has(edge.u) && !chosen.has(edge.v);
    });
    if (impossibleEdge) return "uncovered";
    if (index === vertices.length) return isVertexCover(edges, selected) ? "solution" : "uncovered";
    return "open";
  }

  function buildSearch(vertices, edges, budget) {
    let nextId = 0;
    const nodes = [];
    const frames = [];
    const stack = [{ id: nextId++, parentId: null, index: 0, selected: [], decision: "root", path: "" }];
    while (stack.length) {
      const node = stack.pop();
      const status = partialStatus(vertices, edges, budget, node.index, node.selected);
      const stored = deepFreeze(Object.assign({}, node, { status: status, visitOrder: nodes.length + 1 }));
      nodes.push(stored);
      frames.push(deepFreeze({
        currentNodeId: node.id,
        visitedIds: nodes.map(function (item) { return item.id; }),
        solutionIds: nodes.filter(function (item) { return item.status === "solution"; }).map(function (item) { return item.id; }),
        message: status === "budget"
          ? "Ветка отсечена: число выбранных вершин превысило бюджет"
          : status === "uncovered"
            ? "Ветка отсечена: уже назначенное ребро осталось без выбранного конца"
            : status === "solution"
              ? "Полное назначение удовлетворяет всем формулировкам"
              : "Выбираем значение следующей булевой переменной",
      }));
      if (status === "open") {
        const vertex = vertices[node.index];
        stack.push({
          id: nextId++, parentId: node.id, index: node.index + 1,
          selected: node.selected.slice(), decision: "zero", path: node.path + "0",
        });
        stack.push({
          id: nextId++, parentId: node.id, index: node.index + 1,
          selected: node.selected.concat(vertex), decision: "one", path: node.path + "1",
        });
      }
    }
    return deepFreeze({ nodes: nodes, frames: frames });
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const clauses = satClauses(VERTICES, options.edges, options.budget);
    const sat = evaluateSAT(clauses, options.selected);
    const mip = mipEvaluation(VERTICES, options.edges, options.budget, options.selected);
    const graphFeasible = isVertexCover(options.edges, options.selected) && options.selected.length <= options.budget;
    if (sat.satisfied !== graphFeasible || mip.feasible !== graphFeasible) {
      throw new Error("Формулировки расходятся на текущем назначении");
    }
    const search = buildSearch(VERTICES, options.edges, options.budget);
    const optimum = exactMinimumCover(VERTICES, options.edges);
    const feasibleExists = optimum.length <= options.budget;
    const searchFinds = search.nodes.some(function (node) { return node.status === "solution"; });
    if (feasibleExists !== searchFinds) throw new Error("Дерево состояний расходится с точным решением");
    return deepFreeze({
      options: options, vertices: VERTICES, clauses: clauses, sat: sat, mip: mip,
      graphFeasible: graphFeasible, search: search, optimum: optimum,
    });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.search.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) throw new TypeError("Некорректное состояние лаборатории формулировок");
    if (state.cursor >= state.trace.search.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({ trace: state.trace, cursor: cursor, finished: cursor === state.trace.search.frames.length - 1 });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.search.frames[state.cursor]) throw new TypeError("Некорректное состояние визуализации");
    const frame = state.trace.search.frames[state.cursor];
    return deepFreeze({
      options: state.trace.options,
      vertices: state.trace.vertices,
      clauses: state.trace.clauses.map(function (clause) {
        const result = state.trace.sat.clauses.find(function (item) { return item.id === clause.id; });
        return Object.assign({}, clause, { satisfied: result.satisfied });
      }),
      mip: state.trace.mip,
      graphFeasible: state.trace.graphFeasible,
      optimum: state.trace.optimum,
      nodes: state.trace.search.nodes.map(function (node) {
        return Object.assign({}, node, {
          visited: frame.visitedIds.includes(node.id),
          current: frame.currentNodeId === node.id,
        });
      }),
      frame: frame,
    });
  }

  return deepFreeze({
    VERTICES: VERTICES,
    ALL_EDGES: ALL_EDGES,
    PRESETS: PRESETS,
    normalizeOptions: normalizeOptions,
    isVertexCover: isVertexCover,
    combinations: combinations,
    satClauses: satClauses,
    evaluateSAT: evaluateSAT,
    mipEvaluation: mipEvaluation,
    allAssignments: allAssignments,
    exactMinimumCover: exactMinimumCover,
    partialStatus: partialStatus,
    buildSearch: buildSearch,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
