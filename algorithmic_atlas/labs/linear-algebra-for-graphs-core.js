(function (root, factory) {
  "use strict";

  const graphCore = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(graphCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LinearAlgebraForGraphsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (graphCore) {
  "use strict";

  if (!graphCore) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 10;
  const MAX_EDGES = 30;
  const MAX_WEIGHT = 1000000000;
  const EIGEN_TOLERANCE = 1e-10;

  const PRESETS = Object.freeze({
    path: Object.freeze({
      label: "Путь из четырёх вершин",
      vertices: "a, b, c, d",
      edges: "a b 1; b c 1; c d 1",
      vector: "0, 1, 2, 3",
    }),
    disconnected: Object.freeze({
      label: "Две компоненты и изолированная вершина",
      vertices: "a, b, c, d, e",
      edges: "a b 2; b c 1; d e 3",
      vector: "1, 1, 1, -1, -1",
    }),
    multigraph: Object.freeze({
      label: "Параллельные рёбра и петля",
      vertices: "a, b, c",
      edges: "a b 2; a b 3; b c 1; c c 4",
      vector: "2, -1, 3",
    }),
    weighted: Object.freeze({
      label: "Взвешенный цикл с диагональю",
      vertices: "a, b, c, d",
      edges: "a b 2; b c 5; c d 1; d a 3; a c 2",
      vector: "2, 0, -1, 1",
    }),
    singleton: Object.freeze({
      label: "Одна вершина с петлёй",
      vertices: "a",
      edges: "a a 7",
      vector: "4",
    }),
    zero: Object.freeze({
      label: "Нулевые веса",
      vertices: "a, b, c",
      edges: "a b 0; b c 0",
      vector: "1, 2, 4",
    }),
  });

  function parseWeight(rawValue, label) {
    const value = rawValue === null || rawValue === undefined || rawValue === ""
      ? 1
      : typeof rawValue === "string" && /^\d+$/.test(rawValue.trim())
        ? Number(rawValue.trim())
        : Number(rawValue);
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WEIGHT) {
      throw new RangeError((label || "Вес") + ": требуется целое число от 0 до " + MAX_WEIGHT + ".");
    }
    return value;
  }

  function normalizeGraph(rawGraph) {
    const normalized = graphCore.normalizeGraph(rawGraph, {
      maxNodes: MAX_NODES,
      maxEdges: MAX_EDGES,
    });
    if (normalized.directed || normalized.edges.some(function (edge) { return edge.directed; })) {
      throw new RangeError("Лаборатория принимает только неориентированные графы.");
    }
    return graphCore.deepFreeze({
      directed: false,
      nodes: normalized.nodes.map(function (node) {
        return { id: node.id, label: node.label };
      }),
      edges: normalized.edges.map(function (edge, index) {
        return {
          id: edge.id || "e" + String(index + 1),
          source: edge.source,
          target: edge.target,
          directed: false,
          weight: parseWeight(edge.weight, "Вес ребра " + edge.id),
        };
      }),
    });
  }

  function zeroMatrix(rows, columns) {
    return Array.from({ length: rows }, function () {
      return Array(columns).fill(0);
    });
  }

  function identityMatrix(size) {
    const result = zeroMatrix(size, size);
    for (let index = 0; index < size; index += 1) result[index][index] = 1;
    return result;
  }

  function nodeIndex(graph) {
    return new Map(graph.nodes.map(function (node, index) { return [node.id, index]; }));
  }

  function adjacencyMatrix(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const index = nodeIndex(graph);
    const matrix = zeroMatrix(graph.nodes.length, graph.nodes.length);
    graph.edges.forEach(function (edge) {
      const left = index.get(edge.source);
      const right = index.get(edge.target);
      if (left === right) {
        matrix[left][left] += 2 * edge.weight;
      } else {
        matrix[left][right] += edge.weight;
        matrix[right][left] += edge.weight;
      }
    });
    return matrix;
  }

  function degreeValues(rawGraph) {
    return adjacencyMatrix(rawGraph).map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });
  }

  function degreeMatrix(rawGraph) {
    const degrees = degreeValues(rawGraph);
    const matrix = zeroMatrix(degrees.length, degrees.length);
    degrees.forEach(function (value, index) { matrix[index][index] = value; });
    return matrix;
  }

  function laplacianMatrix(rawGraph) {
    const adjacency = adjacencyMatrix(rawGraph);
    const degrees = adjacency.map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });
    return adjacency.map(function (row, i) {
      return row.map(function (value, j) {
        return (i === j ? degrees[i] : 0) - value;
      });
    });
  }

  function incidenceMatrix(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const index = nodeIndex(graph);
    const matrix = zeroMatrix(graph.nodes.length, graph.edges.length);
    graph.edges.forEach(function (edge, column) {
      const source = index.get(edge.source);
      const target = index.get(edge.target);
      if (source === target) return;
      matrix[source][column] = -1;
      matrix[target][column] = 1;
    });
    return matrix;
  }

  function incidenceProduct(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const incidence = incidenceMatrix(graph);
    const result = zeroMatrix(graph.nodes.length, graph.nodes.length);
    graph.edges.forEach(function (edge, column) {
      for (let row = 0; row < graph.nodes.length; row += 1) {
        if (incidence[row][column] === 0) continue;
        for (let other = 0; other < graph.nodes.length; other += 1) {
          if (incidence[other][column] !== 0) {
            result[row][other] += incidence[row][column] * edge.weight * incidence[other][column];
          }
        }
      }
    });
    return result;
  }

  function normalizedLaplacian(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const laplacian = laplacianMatrix(graph);
    const degrees = degreeValues(graph);
    return laplacian.map(function (row, i) {
      return row.map(function (value, j) {
        return degrees[i] === 0 || degrees[j] === 0
          ? 0
          : value / Math.sqrt(degrees[i] * degrees[j]);
      });
    });
  }

  function parseVector(rawValue, size) {
    const values = Array.isArray(rawValue)
      ? rawValue.slice()
      : String(rawValue === undefined ? "" : rawValue)
        .split(/[\s,;]+/).filter(Boolean);
    if (values.length !== size) {
      throw new RangeError("Вектор x должен содержать ровно " + size + " координат.");
    }
    return values.map(function (value, index) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || Math.abs(parsed) > 1e9) {
        throw new RangeError("Координата x[" + index + "] должна быть конечным числом по модулю не больше 10⁹.");
      }
      return parsed;
    });
  }

  function quadraticForm(matrix, rawVector) {
    const vector = parseVector(rawVector, matrix.length);
    return vector.reduce(function (sum, left, i) {
      return sum + matrix[i].reduce(function (rowSum, value, j) {
        return rowSum + left * value * vector[j];
      }, 0);
    }, 0);
  }

  function edgeEnergy(rawGraph, rawVector) {
    const graph = normalizeGraph(rawGraph);
    const vector = parseVector(rawVector, graph.nodes.length);
    const index = nodeIndex(graph);
    return graph.edges.reduce(function (sum, edge) {
      const difference = vector[index.get(edge.source)] - vector[index.get(edge.target)];
      return sum + edge.weight * difference * difference;
    }, 0);
  }

  function supportComponents(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const adjacency = new Map(graph.nodes.map(function (node) { return [node.id, []]; }));
    graph.edges.forEach(function (edge) {
      if (edge.weight === 0 || edge.source === edge.target) return;
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    });
    const seen = new Set();
    const components = [];
    graph.nodes.forEach(function (node) {
      if (seen.has(node.id)) return;
      const stack = [node.id];
      const component = [];
      seen.add(node.id);
      while (stack.length) {
        const current = stack.pop();
        component.push(current);
        adjacency.get(current).forEach(function (next) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        });
      }
      components.push(component.sort());
    });
    return components.sort(function (left, right) { return left[0].localeCompare(right[0]); });
  }

  function eigenSymmetric(rawMatrix) {
    const size = rawMatrix.length;
    if (!rawMatrix.every(function (row) { return Array.isArray(row) && row.length === size; })) {
      throw new TypeError("Для спектра требуется квадратная матрица.");
    }
    const source = rawMatrix.map(function (row, i) {
      return row.map(function (value, j) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new RangeError("Матрица содержит неконечное число.");
        if (Math.abs(number - Number(rawMatrix[j][i])) > 1e-9) {
          throw new RangeError("Метод Якоби требует симметричную матрицу.");
        }
        return number;
      });
    });
    if (size === 0) return { values: [], vectors: [] };
    const scale = Math.max(1, ...source.flat().map(Math.abs));
    const matrix = source.map(function (row) {
      return row.map(function (value) { return value / scale; });
    });
    const vectors = identityMatrix(size);
    const tolerance = Math.max(1e-15, Number.EPSILON * 32 * size);
    const maximumIterations = Math.max(32, 200 * size * size);
    for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
      let p = 0;
      let q = 0;
      let largest = 0;
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          if (Math.abs(matrix[i][j]) > largest) {
            largest = Math.abs(matrix[i][j]);
            p = i;
            q = j;
          }
        }
      }
      if (largest <= tolerance) break;
      const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const app = matrix[p][p];
      const aqq = matrix[q][q];
      const apq = matrix[p][q];
      for (let k = 0; k < size; k += 1) {
        if (k === p || k === q) continue;
        const akp = matrix[k][p];
        const akq = matrix[k][q];
        matrix[k][p] = matrix[p][k] = cosine * akp - sine * akq;
        matrix[k][q] = matrix[q][k] = sine * akp + cosine * akq;
      }
      matrix[p][p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
      matrix[q][q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
      matrix[p][q] = matrix[q][p] = 0;
      for (let row = 0; row < size; row += 1) {
        const vip = vectors[row][p];
        const viq = vectors[row][q];
        vectors[row][p] = cosine * vip - sine * viq;
        vectors[row][q] = sine * vip + cosine * viq;
      }
    }
    const pairs = Array.from({ length: size }, function (_, index) {
      const vector = vectors.map(function (row) { return row[index]; });
      const pivot = vector.find(function (value) { return Math.abs(value) > EIGEN_TOLERANCE; });
      if (pivot < 0) vector.forEach(function (value, i) { vector[i] = -value; });
      const normalizedValue = matrix[index][index];
      return {
        value: Math.abs(normalizedValue) <= tolerance * size ? 0 : normalizedValue * scale,
        vector: vector,
      };
    }).sort(function (left, right) { return left.value - right.value; });
    return {
      values: pairs.map(function (pair) { return pair.value; }),
      vectors: pairs.map(function (pair) { return pair.vector; }),
    };
  }

  function rayleighQuotient(matrix, rawVector) {
    const vector = parseVector(rawVector, matrix.length);
    const denominator = vector.reduce(function (sum, value) { return sum + value * value; }, 0);
    if (denominator === 0) return null;
    return quadraticForm(matrix, vector) / denominator;
  }

  function randomWalk(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const adjacency = adjacencyMatrix(graph);
    const degrees = adjacency.map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });
    const transition = adjacency.map(function (row, i) {
      if (degrees[i] === 0) {
        return row.map(function (_, j) { return i === j ? 1 : 0; });
      }
      return row.map(function (value) { return value / degrees[i]; });
    });
    const total = degrees.reduce(function (sum, value) { return sum + value; }, 0);
    const stationary = total === 0
      ? degrees.map(function () { return graph.nodes.length ? 1 / graph.nodes.length : 0; })
      : degrees.map(function (degree) { return degree / total; });
    return { transition: transition, stationary: stationary, degrees: degrees };
  }

  function determinantBareiss(rawMatrix) {
    const size = rawMatrix.length;
    if (size === 0) return 1n;
    const matrix = rawMatrix.map(function (row) {
      if (!Array.isArray(row) || row.length !== size) throw new TypeError("Определитель требует квадратную матрицу.");
      return row.map(function (value) { return BigInt(value); });
    });
    let previousPivot = 1n;
    let sign = 1n;
    for (let column = 0; column < size - 1; column += 1) {
      let pivotRow = column;
      while (pivotRow < size && matrix[pivotRow][column] === 0n) pivotRow += 1;
      if (pivotRow === size) return 0n;
      if (pivotRow !== column) {
        const temporary = matrix[column];
        matrix[column] = matrix[pivotRow];
        matrix[pivotRow] = temporary;
        sign = -sign;
      }
      const pivot = matrix[column][column];
      for (let row = column + 1; row < size; row += 1) {
        for (let other = column + 1; other < size; other += 1) {
          const numerator = matrix[row][other] * pivot - matrix[row][column] * matrix[column][other];
          matrix[row][other] = numerator / previousPivot;
        }
        matrix[row][column] = 0n;
      }
      previousPivot = pivot;
    }
    return sign * matrix[size - 1][size - 1];
  }

  function matrixTreeWeight(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    if (graph.nodes.length === 0) return 0n;
    if (graph.nodes.length === 1) return 1n;
    const laplacian = laplacianMatrix(graph);
    const cofactor = laplacian.slice(1).map(function (row) { return row.slice(1); });
    const value = determinantBareiss(cofactor);
    return value < 0n ? -value : value;
  }

  function parseGraphText(verticesText, edgesText) {
    const ids = String(verticesText || "").split(/[\s,;]+/).filter(Boolean);
    const nodes = ids.map(function (id) { return { id: id, label: id }; });
    const edges = String(edgesText || "").split(/[;\n]+/).map(function (line) {
      return line.trim();
    }).filter(Boolean).map(function (line, index) {
      const parts = line.split(/\s+/);
      if (parts.length < 2 || parts.length > 3) {
        throw new RangeError("Ребро №" + (index + 1) + ": ожидаются начало, конец и необязательный вес.");
      }
      return {
        id: "e" + String(index + 1),
        source: parts[0],
        target: parts[1],
        directed: false,
        weight: parts.length === 3 ? parts[2] : 1,
      };
    });
    return normalizeGraph({ directed: false, nodes: nodes, edges: edges });
  }

  function graphText(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    return {
      vertices: graph.nodes.map(function (node) { return node.id; }).join(", "),
      edges: graph.edges.map(function (edge) {
        return edge.source + " " + edge.target + " " + edge.weight;
      }).join("; "),
    };
  }

  function graphFromPreset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
      throw new RangeError("Неизвестный пример графа.");
    }
    return parseGraphText(PRESETS[name].vertices, PRESETS[name].edges);
  }

  function updateEdgeWeight(rawGraph, edgeId, rawWeight) {
    const graph = normalizeGraph(rawGraph);
    if (!graph.edges.some(function (edge) { return edge.id === edgeId; })) {
      throw new RangeError("Неизвестное ребро " + edgeId + ".");
    }
    const weight = parseWeight(rawWeight, "Новый вес");
    return normalizeGraph({
      directed: false,
      nodes: graph.nodes,
      edges: graph.edges.map(function (edge) {
        return Object.assign({}, edge, { weight: edge.id === edgeId ? weight : edge.weight });
      }),
    });
  }

  function graphPrefix(graph, count) {
    return normalizeGraph({
      directed: false,
      nodes: graph.nodes,
      edges: graph.edges.slice(0, count),
    });
  }

  function buildFrame(graph, vector, count) {
    const currentGraph = graphPrefix(graph, count);
    const adjacency = adjacencyMatrix(currentGraph);
    const degree = degreeMatrix(currentGraph);
    const laplacian = laplacianMatrix(currentGraph);
    const normalized = normalizedLaplacian(currentGraph);
    const incidence = incidenceMatrix(currentGraph);
    const spectrum = eigenSymmetric(laplacian);
    const components = supportComponents(currentGraph);
    const energy = edgeEnergy(currentGraph, vector);
    const walk = randomWalk(currentGraph);
    const active = count === 0 ? null : graph.edges[count - 1];
    const nullity = components.length;
    const eigenvalues = spectrum.values.map(function (value, index) {
      return index < nullity ? 0 : value;
    });
    const eigenvectors = spectrum.vectors.slice();
    components.forEach(function (component, index) {
      const normalization = 1 / Math.sqrt(component.length);
      eigenvectors[index] = currentGraph.nodes.map(function (node) {
        return component.includes(node.id) ? normalization : 0;
      });
    });
    return graphCore.deepFreeze({
      phase: count === 0 ? "empty-support" : count === graph.edges.length ? "complete" : "add-edge",
      includedEdgeIds: graph.edges.slice(0, count).map(function (edge) { return edge.id; }),
      activeEdgeId: active ? active.id : null,
      adjacency: adjacency,
      degree: degree,
      laplacian: laplacian,
      normalizedLaplacian: normalized,
      incidence: incidence,
      eigenvalues: eigenvalues,
      eigenvectors: eigenvectors,
      components: components,
      nullity: nullity,
      quadraticForm: quadraticForm(laplacian, vector),
      edgeEnergy: energy,
      rayleigh: rayleighQuotient(laplacian, vector),
      transition: walk.transition,
      stationary: walk.stationary,
      treeWeight: matrixTreeWeight(currentGraph).toString(),
      message: count === 0
        ? "Начинаем с тех же вершин без рёбер: L нулевая, каждая вершина образует компоненту."
        : "Добавлено ребро " + active.source + " — " + active.target +
          " веса " + active.weight + "; матрицы и спектр пересчитаны.",
    });
  }

  function createState(options) {
    const settings = options || {};
    const preset = settings.preset || "path";
    const graph = settings.graph ? normalizeGraph(settings.graph) : graphFromPreset(preset);
    const defaultVector = settings.vector === undefined
      ? (PRESETS[preset] ? PRESETS[preset].vector : graph.nodes.map(function (_, i) { return i; }))
      : settings.vector;
    const vector = parseVector(defaultVector, graph.nodes.length);
    const frames = Array.from({ length: graph.edges.length + 1 }, function (_, count) {
      return buildFrame(graph, vector, count);
    });
    return graphCore.deepFreeze({
      graph: graph,
      vector: vector,
      frames: frames,
      cursor: 0,
      current: frames[0],
      finished: frames.length === 1,
    });
  }

  function step(state) {
    if (state.finished) return state;
    const cursor = Math.min(state.cursor + 1, state.frames.length - 1);
    return graphCore.deepFreeze(Object.assign({}, state, {
      cursor: cursor,
      current: state.frames[cursor],
      finished: cursor === state.frames.length - 1,
    }));
  }

  function runToEnd(state) {
    let current = state;
    while (!current.finished) current = step(current);
    return current;
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_WEIGHT: MAX_WEIGHT,
    EIGEN_TOLERANCE: EIGEN_TOLERANCE,
    PRESETS: PRESETS,
    parseWeight: parseWeight,
    normalizeGraph: normalizeGraph,
    adjacencyMatrix: adjacencyMatrix,
    degreeValues: degreeValues,
    degreeMatrix: degreeMatrix,
    laplacianMatrix: laplacianMatrix,
    incidenceMatrix: incidenceMatrix,
    incidenceProduct: incidenceProduct,
    normalizedLaplacian: normalizedLaplacian,
    parseVector: parseVector,
    quadraticForm: quadraticForm,
    edgeEnergy: edgeEnergy,
    supportComponents: supportComponents,
    eigenSymmetric: eigenSymmetric,
    rayleighQuotient: rayleighQuotient,
    randomWalk: randomWalk,
    determinantBareiss: determinantBareiss,
    matrixTreeWeight: matrixTreeWeight,
    parseGraphText: parseGraphText,
    graphText: graphText,
    graphFromPreset: graphFromPreset,
    updateEdgeWeight: updateEdgeWeight,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
  });
});
