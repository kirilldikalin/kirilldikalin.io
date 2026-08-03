(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AllPairsShortestPathsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 9;
  const MAX_EDGES = 48;
  const MAX_ABS_WEIGHT = 1000000000000;
  const ALGORITHMS = Object.freeze(["floyd-warshall", "johnson"]);
  const PRESETS = shared.deepFreeze({
    classic: {
      id: "classic",
      label: "Отрицательные рёбра без отрицательного цикла",
      directed: true,
      nodes: ["A", "B", "C", "D", "E"].map(function (id) { return { id: id, label: id }; }),
      edges: [
        ["A", "B", 3], ["A", "C", 8], ["A", "E", -4],
        ["B", "D", 1], ["B", "E", 7], ["C", "B", 4],
        ["D", "A", 2], ["D", "C", -5], ["E", "D", 6],
      ].map(function (entry, index) {
        return { id: "e" + (index + 1), source: entry[0], target: entry[1], weight: entry[2], directed: true };
      }),
    },
    unreachable: {
      id: "unreachable",
      label: "Недостижимые пары",
      directed: true,
      nodes: ["A", "B", "C", "D", "E"].map(function (id) { return { id: id, label: id }; }),
      edges: [
        ["A", "B", 2], ["B", "C", 3], ["A", "C", 9], ["D", "E", 1],
      ].map(function (entry, index) {
        return { id: "e" + (index + 1), source: entry[0], target: entry[1], weight: entry[2], directed: true };
      }),
    },
    negativeCycle: {
      id: "negative-cycle",
      label: "Достижимый отрицательный цикл",
      directed: true,
      nodes: ["A", "B", "C", "D"].map(function (id) { return { id: id, label: id }; }),
      edges: [
        ["A", "B", 1], ["B", "C", -3], ["C", "A", 1], ["C", "D", 2],
      ].map(function (entry, index) {
        return { id: "e" + (index + 1), source: entry[0], target: entry[1], weight: entry[2], directed: true };
      }),
    },
    large: {
      id: "large",
      label: "Большие безопасные целые веса",
      directed: true,
      nodes: ["A", "B", "C", "D"].map(function (id) { return { id: id, label: id }; }),
      edges: [
        ["A", "B", 900000000000], ["B", "C", -300000000000],
        ["A", "C", 800000000000], ["C", "D", 700000000000],
        ["B", "D", 1000000000000],
      ].map(function (entry, index) {
        return { id: "e" + (index + 1), source: entry[0], target: entry[1], weight: entry[2], directed: true };
      }),
    },
  });

  function emptyGraph(rawGraph) {
    return shared.deepFreeze({
      id: rawGraph && rawGraph.id ? String(rawGraph.id) : "empty",
      label: rawGraph && rawGraph.label ? String(rawGraph.label) : "Пустой граф",
      directed: Boolean(rawGraph && rawGraph.directed),
      nodes: [],
      edges: [],
    });
  }

  function normalizeGraph(rawGraph) {
    if (!rawGraph || typeof rawGraph !== "object" || Array.isArray(rawGraph)) {
      throw new TypeError("Граф должен быть объектом с массивами nodes и edges");
    }
    if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
      throw new TypeError("Граф должен содержать массивы nodes и edges");
    }
    if (rawGraph.nodes.length === 0) {
      if (rawGraph.edges.length) throw new RangeError("Пустой граф не может содержать рёбра");
      return emptyGraph(rawGraph);
    }
    const prepared = Object.assign({}, rawGraph, {
      edges: rawGraph.edges.map(function (edge) {
        return Object.assign({}, edge, { weight: edge.weight === undefined ? 1 : edge.weight });
      }),
    });
    const graph = shared.normalizeGraph(prepared, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
    graph.edges.forEach(function (edge, index) {
      if (!Number.isSafeInteger(edge.weight) || Math.abs(edge.weight) > MAX_ABS_WEIGHT) {
        throw new RangeError("edges[" + index + "].weight должен быть безопасным целым по модулю не больше " + MAX_ABS_WEIGHT);
      }
    });
    return graph;
  }

  function preset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new RangeError("Неизвестный пример APSP");
    const value = PRESETS[name];
    return normalizeGraph({
      id: value.id,
      label: value.label,
      directed: value.directed,
      nodes: value.nodes.map(function (node) { return Object.assign({}, node); }),
      edges: value.edges.map(function (edge) { return Object.assign({}, edge); }),
    });
  }

  function safeAdd(left, right) {
    if (left === null || right === null) return null;
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
      throw new RangeError("Расстояние должно быть безопасным целым числом");
    }
    const value = left + right;
    if (!Number.isSafeInteger(value)) throw new RangeError("Сумма весов выходит за пределы точной целочисленной арифметики");
    return value;
  }

  function arcs(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const result = [];
    graph.edges.forEach(function (edge) {
      result.push({ id: edge.id, source: edge.source, target: edge.target, weight: edge.weight, originalEdgeId: edge.id });
      if (!edge.directed && edge.source !== edge.target) {
        result.push({ id: edge.id + "-reverse", source: edge.target, target: edge.source, weight: edge.weight, originalEdgeId: edge.id });
      }
    });
    result.sort(function (left, right) {
      return left.source.localeCompare(right.source) || left.target.localeCompare(right.target) || left.id.localeCompare(right.id);
    });
    return shared.deepFreeze(result);
  }

  function emptyMatrix(size, diagonal) {
    return Array.from({ length: size }, function (_, row) {
      return Array.from({ length: size }, function (_, column) {
        return diagonal && row === column ? 0 : null;
      });
    });
  }

  function cloneMatrix(matrix) {
    return matrix.map(function (row) { return row.slice(); });
  }

  function initialMatrices(graph) {
    const ids = graph.nodes.map(function (node) { return node.id; });
    const index = new Map(ids.map(function (id, position) { return [id, position]; }));
    const distance = emptyMatrix(ids.length, true);
    const next = emptyMatrix(ids.length, false);
    ids.forEach(function (_, position) { next[position][position] = position; });
    arcs(graph).forEach(function (edge) {
      const source = index.get(edge.source);
      const target = index.get(edge.target);
      if (distance[source][target] === null || edge.weight < distance[source][target]) {
        distance[source][target] = edge.weight;
        next[source][target] = target;
      }
    });
    return { ids: ids, index: index, distance: distance, next: next };
  }

  function negativeCycleIndices(distance) {
    const result = [];
    for (let index = 0; index < distance.length; index += 1) {
      if (distance[index][index] !== null && distance[index][index] < 0) result.push(index);
    }
    return result;
  }

  function buildFloydWarshall(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const initial = initialMatrices(graph);
    let distance = initial.distance;
    let next = initial.next;
    const frames = [{
      stage: "initial", algorithm: "floyd-warshall", k: null,
      activeVertexId: null, distance: cloneMatrix(distance), changedCells: [],
      negativeCycleVertexIds: [], message: graph.nodes.length
        ? "Матрица содержит нули на диагонали, веса рёбер и недостижимость"
        : "Матрица пустого графа имеет размер 0 × 0", finished: graph.nodes.length === 0,
    }];
    for (let k = 0; k < initial.ids.length; k += 1) {
      const previous = distance;
      const previousNext = next;
      distance = cloneMatrix(previous);
      next = cloneMatrix(previousNext);
      const changedCells = [];
      for (let i = 0; i < initial.ids.length; i += 1) {
        for (let j = 0; j < initial.ids.length; j += 1) {
          const candidate = safeAdd(previous[i][k], previous[k][j]);
          if (candidate !== null && (previous[i][j] === null || candidate < previous[i][j])) {
            changedCells.push({
              row: i, column: j, from: previous[i][j], to: candidate,
              left: previous[i][k], right: previous[k][j],
            });
            distance[i][j] = candidate;
            next[i][j] = previousNext[i][k];
          }
        }
      }
      const negative = negativeCycleIndices(distance).map(function (index) { return initial.ids[index]; });
      frames.push({
        stage: "floyd-layer", algorithm: "floyd-warshall", k: k,
        activeVertexId: initial.ids[k], distance: cloneMatrix(distance),
        changedCells: changedCells, negativeCycleVertexIds: negative,
        message: "Разрешена промежуточная вершина " + initial.ids[k] +
          "; изменено ячеек: " + changedCells.length,
        finished: k === initial.ids.length - 1,
      });
    }
    return shared.deepFreeze({
      graph: graph,
      algorithm: "floyd-warshall",
      ids: initial.ids,
      frames: frames,
      distance: distance,
      next: next,
      negativeCycleVertexIds: negativeCycleIndices(distance).map(function (index) { return initial.ids[index]; }),
    });
  }

  function minPlusProduct(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      throw new TypeError("Для min-plus нужны квадратные матрицы одного размера");
    }
    const size = left.length;
    [left, right].forEach(function (matrix) {
      if (!matrix.every(function (row) { return Array.isArray(row) && row.length === size; })) {
        throw new TypeError("Для min-plus нужны квадратные матрицы одного размера");
      }
    });
    const product = emptyMatrix(size, false);
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        for (let k = 0; k < size; k += 1) {
          const candidate = safeAdd(left[i][k], right[k][j]);
          if (candidate !== null && (product[i][j] === null || candidate < product[i][j])) {
            product[i][j] = candidate;
          }
        }
      }
    }
    return shared.deepFreeze(product);
  }

  function bellmanFordFromArcs(ids, graphArcs, source) {
    const distance = Object.create(null);
    const parent = Object.create(null);
    ids.forEach(function (id) { distance[id] = null; parent[id] = null; });
    distance[source] = 0;
    for (let pass = 1; pass < ids.length; pass += 1) {
      let changed = false;
      graphArcs.forEach(function (edge) {
        const candidate = safeAdd(distance[edge.source], edge.weight);
        if (candidate !== null && (distance[edge.target] === null || candidate < distance[edge.target])) {
          distance[edge.target] = candidate;
          parent[edge.target] = edge.source;
          changed = true;
        }
      });
      if (!changed) break;
    }
    let negativeCycle = false;
    graphArcs.forEach(function (edge) {
      const candidate = safeAdd(distance[edge.source], edge.weight);
      if (candidate !== null && (distance[edge.target] === null || candidate < distance[edge.target])) {
        negativeCycle = true;
      }
    });
    return { distance: distance, parent: parent, negativeCycle: negativeCycle };
  }

  function repeatedBellmanFord(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const ids = graph.nodes.map(function (node) { return node.id; });
    const graphArcs = arcs(graph);
    const distance = [];
    const negativeCycleSources = [];
    ids.forEach(function (source) {
      const result = bellmanFordFromArcs(ids, graphArcs, source);
      distance.push(ids.map(function (target) { return result.distance[target]; }));
      if (result.negativeCycle) negativeCycleSources.push(source);
    });
    return shared.deepFreeze({ ids: ids, distance: distance, negativeCycleSources: negativeCycleSources });
  }

  function computePotentials(graph) {
    const ids = graph.nodes.map(function (node) { return node.id; });
    const graphArcs = arcs(graph);
    const potentials = Object.create(null);
    ids.forEach(function (id) { potentials[id] = 0; });
    const passes = [];
    let negativeCycle = false;
    for (let pass = 1; pass <= ids.length; pass += 1) {
      const changedEdges = [];
      graphArcs.forEach(function (edge) {
        const candidate = safeAdd(potentials[edge.source], edge.weight);
        if (candidate < potentials[edge.target]) {
          potentials[edge.target] = candidate;
          changedEdges.push(edge.id);
        }
      });
      passes.push({ pass: pass, potentials: Object.assign({}, potentials), changedEdges: changedEdges });
      if (!changedEdges.length) break;
      if (pass === ids.length) negativeCycle = true;
    }
    return { potentials: potentials, passes: passes, negativeCycle: negativeCycle, graphArcs: graphArcs };
  }

  function reweightedArcs(graphArcs, potentials) {
    return graphArcs.map(function (edge) {
      const shifted = safeAdd(safeAdd(edge.weight, potentials[edge.source]), -potentials[edge.target]);
      if (shifted < 0) throw new Error("Потенциал не сделал вес неотрицательным");
      return Object.assign({}, edge, { originalWeight: edge.weight, weight: shifted });
    });
  }

  function dijkstra(ids, graphArcs, source) {
    const outgoing = Object.create(null);
    const distance = Object.create(null);
    const parent = Object.create(null);
    ids.forEach(function (id) { outgoing[id] = []; distance[id] = null; parent[id] = null; });
    graphArcs.forEach(function (edge) { outgoing[edge.source].push(edge); });
    const settled = new Set();
    distance[source] = 0;
    while (settled.size < ids.length) {
      let current = null;
      ids.forEach(function (id) {
        if (settled.has(id) || distance[id] === null) return;
        if (current === null || distance[id] < distance[current] ||
            (distance[id] === distance[current] && id.localeCompare(current) < 0)) current = id;
      });
      if (current === null) break;
      settled.add(current);
      outgoing[current].forEach(function (edge) {
        const candidate = safeAdd(distance[current], edge.weight);
        if (distance[edge.target] === null || candidate < distance[edge.target]) {
          distance[edge.target] = candidate;
          parent[edge.target] = current;
        }
      });
    }
    return { distance: distance, parent: parent, settled: Array.from(settled) };
  }

  function firstHop(ids, source, target, parent) {
    if (source === target) return ids.indexOf(source);
    if (parent[target] === null) return null;
    let current = target;
    let guard = 0;
    while (parent[current] !== source) {
      current = parent[current];
      guard += 1;
      if (current === null || guard > ids.length) throw new Error("Цепочка родителей повреждена");
    }
    return ids.indexOf(current);
  }

  function buildJohnson(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const ids = graph.nodes.map(function (node) { return node.id; });
    const frames = [{
      stage: "augment", algorithm: "johnson", activeVertexId: null,
      activeSourceId: null, distance: emptyMatrix(ids.length, true),
      potentials: Object.fromEntries(ids.map(function (id) { return [id, 0]; })),
      reweightedEdges: [], changedEdges: [],
      message: ids.length ? "Добавлена вспомогательная вершина q с нулевыми дугами ко всем вершинам" : "Пустой граф не требует перевзвешивания",
      negativeCycle: false, finished: ids.length === 0,
    }];
    if (!ids.length) {
      return shared.deepFreeze({ graph: graph, algorithm: "johnson", ids: ids, frames: frames,
        distance: [], next: [], potentials: {}, reweightedEdges: [], negativeCycle: false });
    }
    const potentialResult = computePotentials(graph);
    potentialResult.passes.forEach(function (pass) {
      frames.push({
        stage: "bellman-ford", algorithm: "johnson", activeVertexId: null,
        activeSourceId: null, distance: emptyMatrix(ids.length, true),
        potentials: pass.potentials, reweightedEdges: [], changedEdges: pass.changedEdges,
        message: "Bellman–Ford: проход " + pass.pass + ", успешных релаксаций " + pass.changedEdges.length,
        negativeCycle: potentialResult.negativeCycle && pass.pass === ids.length,
        finished: potentialResult.negativeCycle && pass.pass === ids.length,
      });
    });
    if (potentialResult.negativeCycle) {
      return shared.deepFreeze({
        graph: graph, algorithm: "johnson", ids: ids, frames: frames,
        distance: null, next: null, potentials: Object.assign({}, potentialResult.potentials),
        reweightedEdges: [], negativeCycle: true,
      });
    }
    const shifted = reweightedArcs(potentialResult.graphArcs, potentialResult.potentials);
    const distance = emptyMatrix(ids.length, false);
    const next = emptyMatrix(ids.length, false);
    frames.push({
      stage: "reweight", algorithm: "johnson", activeVertexId: null,
      activeSourceId: null, distance: cloneMatrix(distance),
      potentials: Object.assign({}, potentialResult.potentials),
      reweightedEdges: shifted.map(function (edge) { return Object.assign({}, edge); }),
      changedEdges: shifted.map(function (edge) { return edge.id; }),
      message: "Все новые веса неотрицательны; можно запускать Дейкстру",
      negativeCycle: false, finished: false,
    });
    ids.forEach(function (source, sourceIndex) {
      const result = dijkstra(ids, shifted, source);
      ids.forEach(function (target, targetIndex) {
        if (result.distance[target] === null) return;
        distance[sourceIndex][targetIndex] = safeAdd(
          safeAdd(result.distance[target], -potentialResult.potentials[source]),
          potentialResult.potentials[target]
        );
        next[sourceIndex][targetIndex] = firstHop(ids, source, target, result.parent);
      });
      frames.push({
        stage: "dijkstra", algorithm: "johnson", activeVertexId: source,
        activeSourceId: source, distance: cloneMatrix(distance),
        potentials: Object.assign({}, potentialResult.potentials),
        reweightedEdges: shifted.map(function (edge) { return Object.assign({}, edge); }),
        changedEdges: [], settledVertexIds: result.settled,
        message: "Дейкстра из " + source + " заполнила строку матрицы расстояний",
        negativeCycle: false, finished: sourceIndex === ids.length - 1,
      });
    });
    return shared.deepFreeze({
      graph: graph, algorithm: "johnson", ids: ids, frames: frames,
      distance: distance, next: next,
      potentials: Object.assign({}, potentialResult.potentials),
      reweightedEdges: shifted.map(function (edge) { return Object.assign({}, edge); }),
      negativeCycle: false,
    });
  }

  function buildTrace(rawGraph, rawOptions) {
    const options = rawOptions || {};
    const algorithm = options.algorithm || "floyd-warshall";
    if (!ALGORITHMS.includes(algorithm)) throw new RangeError("Неизвестный алгоритм APSP");
    return algorithm === "floyd-warshall"
      ? buildFloydWarshall(rawGraph)
      : buildJohnson(rawGraph);
  }

  function createState(rawGraph, rawOptions) {
    const trace = buildTrace(rawGraph, rawOptions);
    return shared.deepFreeze({ trace: trace, playback: shared.createPlayback(trace.frames) });
  }

  function step(state) {
    if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние APSP");
    if (state.playback.finished) return state;
    return shared.deepFreeze({ trace: state.trace, playback: shared.playbackStep(state.playback) });
  }

  function seek(state, cursor) {
    if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние APSP");
    return shared.deepFreeze({ trace: state.trace, playback: shared.playbackSeek(state.playback, cursor) });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.playback || !state.playback.current) {
      throw new TypeError("Некорректное состояние визуализации APSP");
    }
    const frame = state.playback.current;
    return shared.deepFreeze({
      graph: state.trace.graph, ids: state.trace.ids, algorithm: state.trace.algorithm,
      frame: frame, cursor: state.playback.cursor,
      frameCount: state.playback.frames.length, finished: state.playback.finished,
      distance: state.trace.distance, next: state.trace.next,
      negativeCycle: Boolean(
        frame.negativeCycle ||
        (frame.negativeCycleVertexIds && frame.negativeCycleVertexIds.length)
      ),
    });
  }

  function affectedByNegativeCycle(trace, sourceIndex, targetIndex) {
    if (!trace.negativeCycleVertexIds || !trace.negativeCycleVertexIds.length) return false;
    const index = new Map(trace.ids.map(function (id, position) { return [id, position]; }));
    return trace.negativeCycleVertexIds.some(function (id) {
      const pivot = index.get(id);
      return trace.distance[sourceIndex][pivot] !== null && trace.distance[pivot][targetIndex] !== null;
    });
  }

  function reconstructPath(trace, rawSource, rawTarget) {
    if (!trace || !Array.isArray(trace.ids)) throw new TypeError("Нужен результат алгоритма APSP");
    const source = String(rawSource);
    const target = String(rawTarget);
    const sourceIndex = trace.ids.indexOf(source);
    const targetIndex = trace.ids.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) throw new RangeError("Неизвестная вершина пути");
    if (trace.negativeCycle) return shared.deepFreeze({ status: "negative-cycle", path: [], distance: null });
    if (affectedByNegativeCycle(trace, sourceIndex, targetIndex)) {
      return shared.deepFreeze({ status: "negative-cycle", path: [], distance: null });
    }
    if (!trace.next || trace.next[sourceIndex][targetIndex] === null) {
      return shared.deepFreeze({ status: "unreachable", path: [], distance: null });
    }
    const path = [source];
    let current = sourceIndex;
    let guard = 0;
    while (current !== targetIndex) {
      current = trace.next[current][targetIndex];
      if (current === null || current === undefined) {
        return shared.deepFreeze({ status: "unreachable", path: [], distance: null });
      }
      path.push(trace.ids[current]);
      guard += 1;
      if (guard > trace.ids.length) throw new Error("Матрица next содержит цикл");
    }
    return shared.deepFreeze({ status: "ok", path: path, distance: trace.distance[sourceIndex][targetIndex] });
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_ABS_WEIGHT: MAX_ABS_WEIGHT,
    ALGORITHMS: ALGORITHMS,
    PRESETS: PRESETS,
    normalizeGraph: normalizeGraph,
    preset: preset,
    safeAdd: safeAdd,
    arcs: arcs,
    initialMatrices: initialMatrices,
    buildFloydWarshall: buildFloydWarshall,
    minPlusProduct: minPlusProduct,
    repeatedBellmanFord: repeatedBellmanFord,
    buildJohnson: buildJohnson,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    seek: seek,
    visualModel: visualModel,
    reconstructPath: reconstructPath,
  });
});
