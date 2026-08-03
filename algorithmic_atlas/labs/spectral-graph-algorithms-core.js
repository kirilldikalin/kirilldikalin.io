(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports ? require("./graph-lab-core.js") : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpectralGraphAlgorithmsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 10;
  const MAX_EDGES = 45;
  const MAX_WEIGHT = 1000000;
  const EPSILON = 1e-10;

  const PRESETS = shared.deepFreeze({
    bottleneck: {
      label: "Два плотных квартала и узкий мост",
      nodes: [["a", -4, -2], ["b", -4, 2], ["c", -1, 0], ["d", 1, 0], ["e", 4, -2], ["f", 4, 2]],
      edges: [["a", "b", 3], ["a", "c", 3], ["b", "c", 3], ["c", "d", 0.3], ["d", "e", 3], ["d", "f", 3], ["e", "f", 3]],
    },
    path4: {
      label: "Путь P₄",
      nodes: [["a", -4, 0], ["b", -1.5, 0], ["c", 1.5, 0], ["d", 4, 0]],
      edges: [["a", "b", 1], ["b", "c", 1], ["c", "d", 1]],
    },
    cycle4: {
      label: "Цикл C₄ с кратным собственным значением",
      nodes: [["a", -3, -3], ["b", 3, -3], ["c", 3, 3], ["d", -3, 3]],
      edges: [["a", "b", 1], ["b", "c", 1], ["c", "d", 1], ["d", "a", 1]],
    },
    complete4: {
      label: "Полный граф K₄",
      nodes: [["a", -3, -3], ["b", 3, -3], ["c", 3, 3], ["d", -3, 3]],
      edges: [["a", "b", 1], ["a", "c", 1], ["a", "d", 1], ["b", "c", 1], ["b", "d", 1], ["c", "d", 1]],
    },
    disconnected: {
      label: "Две компоненты",
      nodes: [["a", -4, -1], ["b", -2, 1], ["c", 2, -1], ["d", 4, 1]],
      edges: [["a", "b", 2], ["c", "d", 1]],
    },
    isolate: {
      label: "Треугольник и изолированная вершина",
      nodes: [["a", -3, -2], ["b", 0, 3], ["c", 3, -2], ["z", 5, 3]],
      edges: [["a", "b", 1], ["b", "c", 1], ["c", "a", 1]],
    },
    weighted: {
      label: "Взвешенная цепь с тяжёлым центром",
      nodes: [["a", -4, 0], ["b", -2, 1], ["c", 0, -1], ["d", 2, 1], ["e", 4, 0]],
      edges: [["a", "b", 1], ["b", "c", 8], ["c", "d", 8], ["d", "e", 1], ["b", "d", 0.5]],
    },
    zeroEdge: {
      label: "Нулевое ребро не соединяет поддержку",
      nodes: [["a", -3, 0], ["b", 0, 0], ["c", 3, 0]],
      edges: [["a", "b", 1], ["b", "c", 0]],
    },
  });

  function finiteWeight(rawValue, label) {
    const value = rawValue === undefined || rawValue === null || rawValue === "" ? 1 : Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > MAX_WEIGHT) throw new RangeError((label || "Вес") + ": требуется число от 0 до " + MAX_WEIGHT);
    return value;
  }

  function normalizeGraph(rawGraph) {
    const graph = shared.normalizeGraph(rawGraph, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
    if (graph.directed || graph.edges.some(function (edge) { return edge.directed; })) throw new RangeError("Спектральная лаборатория принимает неориентированный граф");
    const positions = rawGraph && rawGraph.positions && typeof rawGraph.positions === "object" ? rawGraph.positions : {};
    return shared.deepFreeze({
      id: graph.id || "spectral-graph",
      label: graph.label || "Спектральный граф",
      directed: false,
      nodes: graph.nodes.map(function (node, index) {
        const point = positions[node.id] || {};
        return { id: node.id, label: node.label, x: Number.isFinite(Number(point.x)) ? Number(point.x) : index, y: Number.isFinite(Number(point.y)) ? Number(point.y) : 0 };
      }),
      edges: graph.edges.map(function (edge, index) {
        if (edge.source === edge.target) throw new RangeError("Петли не входят в учебную модель спектрального разреза");
        return { id: edge.id || "e" + (index + 1), source: edge.source, target: edge.target, directed: false, weight: finiteWeight(edge.weight, "Вес ребра " + edge.id) };
      }),
    });
  }

  function preset(rawName) {
    const name = String(rawName || "bottleneck");
    const source = PRESETS[name];
    if (!source) throw new RangeError("Неизвестный спектральный пример");
    const positions = {};
    const nodes = source.nodes.map(function (item) { positions[item[0]] = { x: item[1], y: item[2] }; return { id: item[0], label: item[0] }; });
    const edges = source.edges.map(function (item, index) { return { id: "e" + (index + 1), source: item[0], target: item[1], weight: item[2], directed: false }; });
    return normalizeGraph({ id: name, label: source.label, directed: false, nodes: nodes, edges: edges, positions: positions });
  }

  function zeroMatrix(size) { return Array.from({ length: size }, function () { return Array(size).fill(0); }); }
  function identityMatrix(size) { const result = zeroMatrix(size); for (let i = 0; i < size; i += 1) result[i][i] = 1; return result; }
  function indexById(graph) { return new Map(graph.nodes.map(function (node, index) { return [node.id, index]; })); }

  function matrices(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const n = graph.nodes.length;
    const adjacency = zeroMatrix(n);
    const index = indexById(graph);
    graph.edges.forEach(function (edge) {
      const left = index.get(edge.source); const right = index.get(edge.target);
      adjacency[left][right] += edge.weight; adjacency[right][left] += edge.weight;
    });
    const degrees = adjacency.map(function (row) { return row.reduce(function (sum, value) { return sum + value; }, 0); });
    const laplacian = adjacency.map(function (row, i) { return row.map(function (value, j) { return i === j ? degrees[i] : -value; }); });
    const normalized = laplacian.map(function (row, i) {
      return row.map(function (value, j) {
        if (degrees[i] === 0 || degrees[j] === 0) return 0;
        return value / Math.sqrt(degrees[i] * degrees[j]);
      });
    });
    return shared.deepFreeze({ graph: graph, adjacency: adjacency, degrees: degrees, laplacian: laplacian, normalized: normalized });
  }

  function dot(left, right) { return left.reduce(function (sum, value, index) { return sum + value * right[index]; }, 0); }
  function norm(vector) { return Math.sqrt(Math.max(0, dot(vector, vector))); }
  function multiply(matrix, vector) { return matrix.map(function (row) { return dot(row, vector); }); }
  function residual(matrix, value, vector) {
    const image = multiply(matrix, vector);
    return norm(image.map(function (item, index) { return item - value * vector[index]; }));
  }

  function symmetricEigen(rawMatrix) {
    const n = rawMatrix.length;
    if (!rawMatrix.every(function (row) { return Array.isArray(row) && row.length === n; })) throw new TypeError("Спектр определён только для квадратной матрицы");
    const matrix = rawMatrix.map(function (row, i) {
      return row.map(function (raw, j) {
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new RangeError("Матрица содержит неконечное значение");
        if (Math.abs(value - Number(rawMatrix[j][i])) > 1e-9) throw new RangeError("Спектральное ядро требует симметричную матрицу");
        return value;
      });
    });
    if (!n) return shared.deepFreeze({ values: [], vectors: [], residuals: [], converged: true, iterations: 0 });
    const vectors = identityMatrix(n);
    const scale = Math.max(1, ...matrix.flat().map(Math.abs));
    const tolerance = Math.max(1e-14, scale * 1e-13);
    const maxIterations = Math.max(64, 160 * n * n);
    let iterations = 0;
    let converged = false;
    for (; iterations < maxIterations; iterations += 1) {
      let p = 0; let q = 0; let largest = 0;
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
        const candidate = Math.abs(matrix[i][j]);
        if (candidate > largest) { largest = candidate; p = i; q = j; }
      }
      if (largest <= tolerance) { converged = true; break; }
      const tau = (matrix[q][q] - matrix[p][p]) / (2 * matrix[p][q]);
      const tangent = tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const cosine = 1 / Math.sqrt(1 + tangent * tangent);
      const sine = tangent * cosine;
      const app = matrix[p][p]; const aqq = matrix[q][q]; const apq = matrix[p][q];
      for (let k = 0; k < n; k += 1) {
        if (k === p || k === q) continue;
        const mkp = matrix[k][p]; const mkq = matrix[k][q];
        matrix[k][p] = matrix[p][k] = cosine * mkp - sine * mkq;
        matrix[k][q] = matrix[q][k] = sine * mkp + cosine * mkq;
      }
      matrix[p][p] = app - tangent * apq;
      matrix[q][q] = aqq + tangent * apq;
      matrix[p][q] = matrix[q][p] = 0;
      for (let row = 0; row < n; row += 1) {
        const vip = vectors[row][p]; const viq = vectors[row][q];
        vectors[row][p] = cosine * vip - sine * viq;
        vectors[row][q] = sine * vip + cosine * viq;
      }
    }
    if (!converged) throw new RangeError("Метод Якоби не сошёлся за безопасное число итераций");
    const pairs = Array.from({ length: n }, function (_, column) {
      const vector = vectors.map(function (row) { return row[column]; });
      const vectorNorm = norm(vector);
      vector.forEach(function (value, index) { vector[index] = value / vectorNorm; });
      const pivot = vector.find(function (value) { return Math.abs(value) > EPSILON; });
      if (pivot < 0) vector.forEach(function (value, index) { vector[index] = -value; });
      const value = Math.abs(matrix[column][column]) < EPSILON ? 0 : matrix[column][column];
      return { value: value, vector: vector, originalIndex: column };
    }).sort(function (left, right) { return left.value - right.value || left.originalIndex - right.originalIndex; });
    return shared.deepFreeze({
      values: pairs.map(function (pair) { return pair.value; }),
      vectors: pairs.map(function (pair) { return pair.vector; }),
      residuals: pairs.map(function (pair) { return residual(rawMatrix, pair.value, pair.vector); }),
      converged: true,
      iterations: iterations,
    });
  }

  function supportComponents(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const adjacency = new Map(graph.nodes.map(function (node) { return [node.id, []]; }));
    graph.edges.forEach(function (edge) {
      if (edge.weight <= EPSILON) return;
      adjacency.get(edge.source).push(edge.target); adjacency.get(edge.target).push(edge.source);
    });
    const seen = new Set(); const components = [];
    graph.nodes.forEach(function (node) {
      if (seen.has(node.id)) return;
      const stack = [node.id]; const component = []; seen.add(node.id);
      while (stack.length) {
        const current = stack.pop(); component.push(current);
        adjacency.get(current).forEach(function (next) { if (!seen.has(next)) { seen.add(next); stack.push(next); } });
      }
      components.push(component.sort());
    });
    return shared.deepFreeze(components.sort(function (left, right) { return left[0].localeCompare(right[0]); }));
  }

  function spectrum(rawGraph) {
    const data = matrices(rawGraph);
    const ordinary = symmetricEigen(data.laplacian);
    const normalized = symmetricEigen(data.normalized);
    const zeroMultiplicity = ordinary.values.filter(function (value) { return Math.abs(value) <= 1e-8; }).length;
    const normalizedZeroMultiplicity = normalized.values.filter(function (value) { return Math.abs(value) <= 1e-8; }).length;
    const fiedlerIndex = data.graph.nodes.length > 1 ? 1 : 0;
    const normalizedFiedlerVector = normalized.vectors[fiedlerIndex] || normalized.vectors[0] || [];
    const sweepVector = normalizedFiedlerVector.map(function (value, index) {
      return data.degrees[index] > EPSILON ? value / Math.sqrt(data.degrees[index]) : 0;
    });
    return shared.deepFreeze({
      graph: data.graph,
      degrees: data.degrees,
      laplacian: ordinary,
      normalized: normalized,
      algebraicConnectivity: ordinary.values[fiedlerIndex] || 0,
      fiedlerVector: ordinary.vectors[fiedlerIndex] || ordinary.vectors[0] || [],
      normalizedGap: normalized.values[fiedlerIndex] || 0,
      normalizedFiedlerVector: normalizedFiedlerVector,
      sweepVector: sweepVector,
      zeroMultiplicity: zeroMultiplicity,
      normalizedZeroMultiplicity: normalizedZeroMultiplicity,
      components: supportComponents(data.graph),
      repeatedFiedler: ordinary.values.length > 2 && Math.abs(ordinary.values[fiedlerIndex] - ordinary.values[fiedlerIndex + 1]) <= 1e-8,
      hasIsolates: data.degrees.some(function (degree) { return degree <= EPSILON; }),
    });
  }

  function normalizeSet(rawGraph, rawIds) {
    const graph = normalizeGraph(rawGraph);
    const ids = new Set(Array.isArray(rawIds) ? rawIds.map(String) : []);
    const known = new Set(graph.nodes.map(function (node) { return node.id; }));
    ids.forEach(function (id) { if (!known.has(id)) throw new RangeError("Разрез содержит неизвестную вершину " + id); });
    return { graph: graph, ids: ids };
  }

  function cutMetrics(rawGraph, rawIds) {
    const normalized = normalizeSet(rawGraph, rawIds);
    const graph = normalized.graph; const side = normalized.ids;
    const data = matrices(graph); const index = indexById(graph);
    let boundary = 0;
    graph.edges.forEach(function (edge) { if (side.has(edge.source) !== side.has(edge.target)) boundary += edge.weight; });
    let volume = 0;
    side.forEach(function (id) { volume += data.degrees[index.get(id)]; });
    const totalVolume = data.degrees.reduce(function (sum, degree) { return sum + degree; }, 0);
    const complementVolume = totalVolume - volume;
    const size = side.size; const complementSize = graph.nodes.length - size;
    const conductance = size && complementSize && volume > EPSILON && complementVolume > EPSILON ? boundary / Math.min(volume, complementVolume) : null;
    const normalizedCut = size && complementSize && volume > EPSILON && complementVolume > EPSILON ? boundary / volume + boundary / complementVolume : null;
    const ratioCut = size && complementSize ? boundary / size + boundary / complementSize : null;
    return shared.deepFreeze({
      sideIds: graph.nodes.filter(function (node) { return side.has(node.id); }).map(function (node) { return node.id; }),
      complementIds: graph.nodes.filter(function (node) { return !side.has(node.id); }).map(function (node) { return node.id; }),
      boundaryWeight: boundary, volume: volume, complementVolume: complementVolume,
      conductance: conductance, normalizedCut: normalizedCut, ratioCut: ratioCut,
    });
  }

  function bruteForceBestConductance(rawGraph) {
    const graph = normalizeGraph(rawGraph); const n = graph.nodes.length;
    if (n < 2) return shared.deepFreeze({ value: null, cuts: [], examined: 0 });
    let best = null; const cuts = []; let examined = 0;
    const limit = 1 << n;
    for (let mask = 1; mask < limit - 1; mask += 1) {
      if (!(mask & 1)) continue;
      const ids = graph.nodes.filter(function (_, index) { return mask & (1 << index); }).map(function (node) { return node.id; });
      const metrics = cutMetrics(graph, ids);
      if (metrics.conductance === null) continue;
      examined += 1;
      if (best === null || metrics.conductance < best - 1e-12) { best = metrics.conductance; cuts.length = 0; cuts.push(metrics.sideIds); }
      else if (Math.abs(metrics.conductance - best) <= 1e-12) cuts.push(metrics.sideIds);
    }
    return shared.deepFreeze({ value: best, cuts: cuts, examined: examined });
  }

  function inducedGraph(rawGraph, rawIds) {
    const normalized = normalizeSet(rawGraph, rawIds); const graph = normalized.graph; const ids = normalized.ids;
    return normalizeGraph({
      id: graph.id + "-induced", label: "Индуцированный подграф", directed: false,
      nodes: graph.nodes.filter(function (node) { return ids.has(node.id); }),
      edges: graph.edges.filter(function (edge) { return ids.has(edge.source) && ids.has(edge.target); }),
      positions: Object.fromEntries(graph.nodes.filter(function (node) { return ids.has(node.id); }).map(function (node) { return [node.id, { x: node.x, y: node.y }]; })),
    });
  }

  function sweepFrames(rawGraph) {
    const graph = normalizeGraph(rawGraph); const spectral = spectrum(graph); const n = graph.nodes.length;
    if (n < 2) return shared.deepFreeze([{ index: 0, threshold: null, sideIds: [], complementIds: graph.nodes.map(function (node) { return node.id; }), order: graph.nodes.map(function (node) { return { id: node.id, value: 0 }; }), metrics: cutMetrics(graph, []), leftSpectrum: [], rightSpectrum: spectral.laplacian.values, message: "Для разреза нужны хотя бы две вершины" }]);
    const vector = spectral.sweepVector;
    const order = graph.nodes.map(function (node, index) { return { id: node.id, value: vector[index] || 0 }; }).sort(function (left, right) { return left.value - right.value || left.id.localeCompare(right.id); });
    const frames = [];
    for (let count = 1; count < n; count += 1) {
      const sideIds = order.slice(0, count).map(function (item) { return item.id; });
      const complementIds = order.slice(count).map(function (item) { return item.id; });
      const threshold = (order[count - 1].value + order[count].value) / 2;
      const metrics = cutMetrics(graph, sideIds);
      const left = spectrum(inducedGraph(graph, sideIds));
      const right = spectrum(inducedGraph(graph, complementIds));
      frames.push({
        index: count - 1, threshold: threshold, sideIds: sideIds, complementIds: complementIds,
        metrics: metrics, leftSpectrum: left.laplacian.values, rightSpectrum: right.laplacian.values,
        order: order, message: "Порог после " + count + "-й координаты: |∂S|=" + metrics.boundaryWeight.toFixed(3) + (metrics.conductance === null ? "; проводимость не определена" : "; φ=" + metrics.conductance.toFixed(4)),
      });
    }
    return shared.deepFreeze(frames);
  }

  function cheegerReport(rawGraph) {
    const spectral = spectrum(rawGraph); const optimum = bruteForceBestConductance(rawGraph);
    const applicable = spectral.graph.nodes.length > 1 && !spectral.hasIsolates && spectral.components.length === 1 && optimum.value !== null;
    const lambda = spectral.normalizedGap; const phi = optimum.value;
    return shared.deepFreeze({
      applicable: applicable, lambda2: lambda, phi: phi,
      lower: applicable ? lambda / 2 : null,
      upper: applicable ? Math.sqrt(Math.max(0, 2 * lambda)) : null,
      lowerHolds: applicable ? lambda / 2 <= phi + 1e-8 : null,
      upperHolds: applicable ? phi <= Math.sqrt(Math.max(0, 2 * lambda)) + 1e-8 : null,
      reason: applicable ? "Нормализованная теорема Чигера применима" : spectral.hasIsolates ? "Есть вершина нулевой степени" : spectral.components.length !== 1 ? "Граф несвязен" : "Недостаточно ненулевого объёма",
    });
  }

  function lazyWalk(rawGraph) {
    const data = matrices(rawGraph); const n = data.graph.nodes.length;
    const transition = zeroMatrix(n);
    for (let i = 0; i < n; i += 1) {
      if (data.degrees[i] <= EPSILON) transition[i][i] = 1;
      else {
        transition[i][i] = 0.5;
        for (let j = 0; j < n; j += 1) transition[i][j] += 0.5 * data.adjacency[i][j] / data.degrees[i];
      }
    }
    const total = data.degrees.reduce(function (sum, value) { return sum + value; }, 0);
    const stationary = total <= EPSILON ? Array(n).fill(n ? 1 / n : 0) : data.degrees.map(function (degree) { return degree / total; });
    const spectral = spectrum(data.graph);
    return shared.deepFreeze({ transition: transition, stationary: stationary, spectralGap: spectral.normalizedGap / 2, uniqueStationary: spectral.components.length === 1 && !spectral.hasIsolates });
  }

  function walkDistribution(rawGraph, rawStartId, rawSteps) {
    const graph = normalizeGraph(rawGraph); const walk = lazyWalk(graph); const index = indexById(graph);
    const startId = String(rawStartId || (graph.nodes[0] && graph.nodes[0].id));
    if (!index.has(startId)) throw new RangeError("Неизвестная стартовая вершина блуждания");
    const steps = shared.boundedInteger(rawSteps, "Число шагов", 0, 10000);
    let distribution = Array(graph.nodes.length).fill(0); distribution[index.get(startId)] = 1;
    for (let step = 0; step < steps; step += 1) {
      const next = Array(graph.nodes.length).fill(0);
      for (let i = 0; i < distribution.length; i += 1) for (let j = 0; j < distribution.length; j += 1) next[j] += distribution[i] * walk.transition[i][j];
      distribution = next;
    }
    const totalVariation = 0.5 * distribution.reduce(function (sum, value, i) { return sum + Math.abs(value - walk.stationary[i]); }, 0);
    return shared.deepFreeze({ steps: steps, distribution: distribution, stationary: walk.stationary, totalVariation: totalVariation, uniqueStationary: walk.uniqueStationary });
  }

  function solveLaplacian(rawGraph, rawDemand) {
    const data = matrices(rawGraph); const graph = data.graph;
    if (!Array.isArray(rawDemand) || rawDemand.length !== graph.nodes.length) throw new RangeError("Вектор правой части должен иметь по координате на вершину");
    const demand = rawDemand.map(function (value) { const number = Number(value); if (!Number.isFinite(number)) throw new RangeError("Правая часть содержит неконечное число"); return number; });
    const components = supportComponents(graph); const index = indexById(graph);
    components.forEach(function (component) {
      const sum = component.reduce(function (total, id) { return total + demand[index.get(id)]; }, 0);
      if (Math.abs(sum) > 1e-9) throw new RangeError("Сумма правой части в каждой компоненте должна быть нулевой");
    });
    const eig = symmetricEigen(data.laplacian); const solution = Array(graph.nodes.length).fill(0);
    eig.values.forEach(function (value, eigenIndex) {
      if (value <= 1e-9) return;
      const coefficient = dot(eig.vectors[eigenIndex], demand) / value;
      eig.vectors[eigenIndex].forEach(function (coordinate, i) { solution[i] += coefficient * coordinate; });
    });
    const residualVector = multiply(data.laplacian, solution).map(function (value, i) { return value - demand[i]; });
    return shared.deepFreeze({ solution: solution, residualNorm: norm(residualVector) });
  }

  function createState(rawGraph) {
    const graph = normalizeGraph(rawGraph || preset("bottleneck"));
    const frames = sweepFrames(graph);
    return shared.deepFreeze({ graph: graph, spectral: spectrum(graph), optimum: bruteForceBestConductance(graph), cheeger: cheegerReport(graph), playback: shared.createPlayback(frames) });
  }
  function step(state) { if (!state || !state.playback) throw new TypeError("Некорректное спектральное состояние"); if (state.playback.finished) return state; return shared.deepFreeze({ graph: state.graph, spectral: state.spectral, optimum: state.optimum, cheeger: state.cheeger, playback: shared.playbackStep(state.playback) }); }
  function seek(state, cursor) { if (!state || !state.playback) throw new TypeError("Некорректное спектральное состояние"); return shared.deepFreeze({ graph: state.graph, spectral: state.spectral, optimum: state.optimum, cheeger: state.cheeger, playback: shared.playbackSeek(state.playback, cursor) }); }
  function visualModel(state) { if (!state || !state.playback || !state.playback.current) throw new TypeError("Некорректная визуальная модель"); return shared.deepFreeze({ graph: state.graph, spectral: state.spectral, optimum: state.optimum, cheeger: state.cheeger, frame: state.playback.current, cursor: state.playback.cursor, frameCount: state.playback.frames.length, finished: state.playback.finished }); }

  return Object.freeze({
    MAX_NODES: MAX_NODES, MAX_EDGES: MAX_EDGES, PRESETS: PRESETS,
    finiteWeight: finiteWeight, normalizeGraph: normalizeGraph, preset: preset,
    matrices: matrices, symmetricEigen: symmetricEigen, supportComponents: supportComponents,
    spectrum: spectrum, cutMetrics: cutMetrics, bruteForceBestConductance: bruteForceBestConductance,
    inducedGraph: inducedGraph, sweepFrames: sweepFrames, cheegerReport: cheegerReport,
    lazyWalk: lazyWalk, walkDistribution: walkDistribution, solveLaplacian: solveLaplacian,
    createState: createState, step: step, seek: seek, visualModel: visualModel,
  });
});
