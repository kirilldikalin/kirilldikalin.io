(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AtlasGraphMatrixCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SYMMETRY_TOLERANCE = 1e-9;
  const EIGENVECTOR_SIGN_TOLERANCE = 1e-10;

  function matrixDimension(rawValue, label) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new RangeError((label || "Размер матрицы") + ": требуется целое число от 0 до 10000.");
    }
    return value;
  }

  function zeroMatrix(rawRows, rawColumns) {
    const rows = matrixDimension(rawRows, "Число строк");
    const columns = matrixDimension(rawColumns === undefined ? rows : rawColumns, "Число столбцов");
    return Array.from({ length: rows }, function () {
      return Array(columns).fill(0);
    });
  }

  function identityMatrix(rawSize) {
    const size = matrixDimension(rawSize, "Размер единичной матрицы");
    const result = zeroMatrix(size, size);
    for (let index = 0; index < size; index += 1) result[index][index] = 1;
    return result;
  }

  function indexById(graph) {
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new TypeError("Для индекса требуется граф с массивом вершин.");
    }
    const index = new Map();
    graph.nodes.forEach(function (node, position) {
      if (!node || typeof node.id !== "string") {
        throw new TypeError("Вершина графа должна иметь строковый id.");
      }
      if (index.has(node.id)) throw new RangeError("Идентификатор вершины повторяется: " + node.id + ".");
      index.set(node.id, position);
    });
    return index;
  }

  function undirectedMatrices(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("Для матриц требуется граф с массивами nodes и edges.");
    }
    if (graph.directed || graph.edges.some(function (edge) { return edge && edge.directed; })) {
      throw new RangeError("Матричное ядро принимает только неориентированный граф.");
    }
    const size = matrixDimension(graph.nodes.length, "Число вершин");
    const index = indexById(graph);
    const adjacency = zeroMatrix(size, size);
    graph.edges.forEach(function (edge) {
      if (!edge || !index.has(edge.source) || !index.has(edge.target)) {
        throw new RangeError("Ребро ссылается на неизвестную вершину.");
      }
      const weight = Number(edge.weight);
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError("Вес ребра должен быть конечным неотрицательным числом.");
      }
      const left = index.get(edge.source);
      const right = index.get(edge.target);
      if (left === right) {
        adjacency[left][left] += 2 * weight;
      } else {
        adjacency[left][right] += weight;
        adjacency[right][left] += weight;
      }
    });
    const degrees = adjacency.map(function (row) {
      return row.reduce(function (sum, value) { return sum + value; }, 0);
    });
    const degreeMatrix = zeroMatrix(size, size);
    degrees.forEach(function (degree, index) { degreeMatrix[index][index] = degree; });
    const laplacian = adjacency.map(function (row, i) {
      return row.map(function (value, j) {
        return (i === j ? degrees[i] : 0) - value;
      });
    });
    const normalizedLaplacian = laplacian.map(function (row, i) {
      return row.map(function (value, j) {
        if (degrees[i] === 0 || degrees[j] === 0) return 0;
        return value / Math.sqrt(degrees[i] * degrees[j]);
      });
    });
    return {
      adjacency: adjacency,
      degrees: degrees,
      degreeMatrix: degreeMatrix,
      laplacian: laplacian,
      normalizedLaplacian: normalizedLaplacian,
    };
  }

  function finiteVector(rawVector, label) {
    if (!Array.isArray(rawVector)) throw new TypeError((label || "Вектор") + " должен быть массивом.");
    return rawVector.map(function (rawValue) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) throw new RangeError((label || "Вектор") + " содержит неконечное число.");
      return value;
    });
  }

  function dot(rawLeft, rawRight) {
    const left = finiteVector(rawLeft, "Левый вектор");
    const right = finiteVector(rawRight, "Правый вектор");
    if (left.length !== right.length) throw new RangeError("Скалярное произведение требует векторы одной длины.");
    return left.reduce(function (sum, value, index) { return sum + value * right[index]; }, 0);
  }

  function norm(rawVector) {
    const vector = finiteVector(rawVector, "Вектор");
    return Math.sqrt(Math.max(0, dot(vector, vector)));
  }

  function multiply(rawMatrix, rawVector) {
    if (!Array.isArray(rawMatrix)) throw new TypeError("Матрица должна быть массивом строк.");
    const vector = finiteVector(rawVector, "Вектор");
    return rawMatrix.map(function (rawRow) {
      const row = finiteVector(rawRow, "Строка матрицы");
      if (row.length !== vector.length) throw new RangeError("Размеры матрицы и вектора не согласованы.");
      return dot(row, vector);
    });
  }

  function residualNorm(matrix, rawValue, vector) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new RangeError("Собственное значение должно быть конечным числом.");
    const normalizedVector = finiteVector(vector, "Собственный вектор");
    const image = multiply(matrix, normalizedVector);
    if (image.length !== normalizedVector.length) {
      throw new RangeError("Невязка собственного вектора определена только для квадратной матрицы.");
    }
    return norm(image.map(function (item, index) {
      return item - value * normalizedVector[index];
    }));
  }

  function symmetricEigen(rawMatrix) {
    if (!Array.isArray(rawMatrix)) throw new TypeError("Матрица должна быть массивом строк.");
    const size = rawMatrix.length;
    if (!rawMatrix.every(function (row) { return Array.isArray(row) && row.length === size; })) {
      throw new TypeError("Спектр определён только для квадратной матрицы.");
    }
    const source = rawMatrix.map(function (row, i) {
      return row.map(function (rawValue, j) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw new RangeError("Матрица содержит неконечное число.");
        const reflected = Number(rawMatrix[j][i]);
        if (!Number.isFinite(reflected) || Math.abs(value - reflected) > SYMMETRY_TOLERANCE) {
          throw new RangeError("Метод Якоби требует симметричную матрицу.");
        }
        return value;
      });
    });
    if (size === 0) {
      return { values: [], vectors: [], converged: true, iterations: 0 };
    }

    const scale = Math.max(1, ...source.flat().map(Math.abs));
    const matrix = source.map(function (row) {
      return row.map(function (value) { return value / scale; });
    });
    const vectors = identityMatrix(size);
    const tolerance = Math.max(1e-15, Number.EPSILON * 32 * size);
    const maximumIterations = Math.max(64, 200 * size * size);
    let iterations = 0;
    let converged = false;

    while (iterations < maximumIterations) {
      let p = 0;
      let q = 0;
      let largest = 0;
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          const candidate = Math.abs(matrix[i][j]);
          if (candidate > largest) {
            largest = candidate;
            p = i;
            q = j;
          }
        }
      }
      if (largest <= tolerance) {
        converged = true;
        break;
      }

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
      iterations += 1;
    }
    if (!converged) throw new RangeError("Метод Якоби не сошёлся за безопасное число итераций.");

    const pairs = Array.from({ length: size }, function (_, column) {
      const vector = vectors.map(function (row) { return row[column]; });
      const vectorNorm = norm(vector);
      if (vectorNorm === 0) throw new RangeError("Метод Якоби получил нулевой собственный вектор.");
      vector.forEach(function (value, index) { vector[index] = value / vectorNorm; });
      const pivot = vector.find(function (value) { return Math.abs(value) > EIGENVECTOR_SIGN_TOLERANCE; });
      if (pivot < 0) vector.forEach(function (value, index) { vector[index] = -value; });
      const normalizedValue = matrix[column][column];
      return {
        value: Math.abs(normalizedValue) <= tolerance * size ? 0 : normalizedValue * scale,
        vector: vector,
        originalIndex: column,
      };
    }).sort(function (left, right) {
      return left.value - right.value || left.originalIndex - right.originalIndex;
    });

    return {
      values: pairs.map(function (pair) { return pair.value; }),
      vectors: pairs.map(function (pair) { return pair.vector; }),
      converged: true,
      iterations: iterations,
    };
  }

  return Object.freeze({
    SYMMETRY_TOLERANCE: SYMMETRY_TOLERANCE,
    EIGENVECTOR_SIGN_TOLERANCE: EIGENVECTOR_SIGN_TOLERANCE,
    zeroMatrix: zeroMatrix,
    identityMatrix: identityMatrix,
    indexById: indexById,
    undirectedMatrices: undirectedMatrices,
    dot: dot,
    norm: norm,
    multiply: multiply,
    residualNorm: residualNorm,
    symmetricEigen: symmetricEigen,
  });
});
