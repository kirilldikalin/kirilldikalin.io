(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./numeric-lab-core.js")
    : root.AtlasNumericLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MatricesLinearSystemsStabilityCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasNumericLabCore is unavailable");
  const EPSILON = 64 * Number.EPSILON;
  const MAX_DIMENSION = 8;

  function checkedNumber(value, context) {
    if (!Number.isFinite(value)) {
      throw new RangeError((context || "Промежуточный результат") + " вышел за конечный диапазон Number.");
    }
    return value;
  }

  function maximumMagnitude(matrix) {
    let scale = 0;
    matrix.forEach(function (row) {
      row.forEach(function (value) { scale = Math.max(scale, Math.abs(value)); });
    });
    return scale;
  }

  function cloneMatrix(matrix) { return matrix.map(function (row) { return row.slice(); }); }
  function validateMatrix(matrix, square) {
    if (!Array.isArray(matrix) || !matrix.length || matrix.length > MAX_DIMENSION) throw new RangeError("Матрица должна иметь от 1 до " + MAX_DIMENSION + " строк.");
    const width = matrix[0].length;
    if (!width || width > MAX_DIMENSION || matrix.some(function (row) { return !Array.isArray(row) || row.length !== width; })) throw new RangeError("Строки матрицы должны иметь одинаковую допустимую длину.");
    if (square && width !== matrix.length) throw new RangeError("Матрица должна быть квадратной.");
    return matrix.map(function (row, i) { return row.map(function (value, j) { return shared.finiteNumber(value, "A[" + i + "," + j + "]"); }); });
  }
  function parseMatrix(text) {
    const rows = String(text).trim().split(/[\n;]+/).filter(Boolean).map(function (row) { return row.trim().split(/[\s,]+/).filter(Boolean).map(Number); });
    return validateMatrix(rows, true);
  }
  function parseVector(text, size) {
    const values = String(text).trim().split(/[\s,;]+/).filter(Boolean).map(Number);
    if (values.length !== size || values.some(function (value) { return !Number.isFinite(value); })) throw new RangeError("Вектор должен содержать ровно " + size + " конечных чисел.");
    return values;
  }
  function zeroMatrix(rows, columns) { return Array.from({ length: rows }, function () { return new Array(columns).fill(0); }); }
  function multiplyMatrices(left, right) {
    const a = validateMatrix(left, false);
    const b = validateMatrix(right, false);
    if (a[0].length !== b.length) throw new RangeError("Внутренние размеры матриц не совпадают.");
    const result = zeroMatrix(a.length, b[0].length);
    for (let i = 0; i < a.length; i += 1) {
      for (let k = 0; k < b.length; k += 1) {
        for (let j = 0; j < b[0].length; j += 1) {
          const product = checkedNumber(a[i][k] * b[k][j], "Произведение элементов матрицы");
          result[i][j] = checkedNumber(result[i][j] + product, "Сумма элементов матричного произведения");
        }
      }
    }
    return result;
  }
  function addMatrices(a, b, sign) {
    return a.map(function (row, i) {
      return row.map(function (value, j) {
        return checkedNumber(value + (sign || 1) * b[i][j], "Сумма элементов матрицы");
      });
    });
  }
  function nextPowerOfTwo(value) { let n = 1; while (n < value) n <<= 1; return n; }
  function padMatrix(matrix, size) { return Array.from({ length: size }, function (_, i) { return Array.from({ length: size }, function (_, j) { return i < matrix.length && j < matrix[0].length ? matrix[i][j] : 0; }); }); }
  function split(matrix) { const half = matrix.length / 2; const block = function (r, c) { return matrix.slice(r, r + half).map(function (row) { return row.slice(c, c + half); }); }; return [block(0, 0), block(0, half), block(half, 0), block(half, half)]; }
  function join(a, b, c, d) { return a.map(function (row, i) { return row.concat(b[i]); }).concat(c.map(function (row, i) { return row.concat(d[i]); })); }
  function strassenMultiply(left, right) {
    const a0 = validateMatrix(left, true), b0 = validateMatrix(right, true);
    if (a0.length !== b0.length) throw new RangeError("Матрицы должны иметь одинаковый порядок.");
    const size = nextPowerOfTwo(a0.length), trace = [];
    function recurse(a, b, depth) {
      if (a.length <= 2) { const result = multiplyMatrices(a, b); trace.push({ phase: "base", depth: depth, size: a.length, result: result }); return result; }
      const [a11, a12, a21, a22] = split(a), [b11, b12, b21, b22] = split(b);
      trace.push({ phase: "split", depth: depth, size: a.length });
      const m1 = recurse(addMatrices(a11, a22), addMatrices(b11, b22), depth + 1);
      const m2 = recurse(addMatrices(a21, a22), b11, depth + 1);
      const m3 = recurse(a11, addMatrices(b12, b22, -1), depth + 1);
      const m4 = recurse(a22, addMatrices(b21, b11, -1), depth + 1);
      const m5 = recurse(addMatrices(a11, a12), b22, depth + 1);
      const m6 = recurse(addMatrices(a21, a11, -1), addMatrices(b11, b12), depth + 1);
      const m7 = recurse(addMatrices(a12, a22, -1), addMatrices(b21, b22), depth + 1);
      const c11 = addMatrices(addMatrices(addMatrices(m1, m4), m5, -1), m7);
      const c12 = addMatrices(m3, m5), c21 = addMatrices(m2, m4);
      const c22 = addMatrices(addMatrices(addMatrices(m1, m2, -1), m3), m6);
      const result = join(c11, c12, c21, c22); trace.push({ phase: "combine", depth: depth, size: a.length, result: result }); return result;
    }
    const padded = recurse(padMatrix(a0, size), padMatrix(b0, size), 0);
    return shared.deepFreeze({ result: padded.slice(0, a0.length).map(function (row) { return row.slice(0, a0.length); }), trace: trace });
  }

  function gaussianFrames(rawMatrix, rawVector, pivoting) {
    const matrix = validateMatrix(rawMatrix, true), n = matrix.length;
    if (!Array.isArray(rawVector) || rawVector.length !== n) throw new RangeError("Размер правой части не совпадает с матрицей.");
    const inputScale = maximumMagnitude(matrix);
    const augmented = matrix.map(function (row, i) { return row.concat(shared.finiteNumber(rawVector[i], "b[" + i + "]")); });
    const frames = [{ mode: "gaussian", phase: "start", pivot: null, target: null, matrix: cloneMatrix(augmented), solution: null, message: "Начальная расширенная матрица." }];
    for (let column = 0; column < n; column += 1) {
      let pivot = column;
      if (pivoting !== false) for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      const pivotMagnitude = Math.abs(augmented[pivot][column]);
      if (inputScale === 0 || pivotMagnitude === 0 || pivotMagnitude / inputScale <= EPSILON) {
        throw new RangeError("Матрица вырождена или численно неотличима от вырожденной в масштабе входа.");
      }
      if (pivot !== column) { [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]]; frames.push({ mode: "gaussian", phase: "swap", pivot: column, target: pivot, matrix: cloneMatrix(augmented), solution: null, message: "Строки переставлены: выбран наибольший по модулю доступный pivot." }); }
      for (let row = column + 1; row < n; row += 1) {
        const factor = checkedNumber(augmented[row][column] / augmented[column][column], "Множитель исключения");
        for (let index = column; index <= n; index += 1) {
          const product = checkedNumber(factor * augmented[column][index], "Произведение при исключении");
          augmented[row][index] = checkedNumber(augmented[row][index] - product, "Разность при исключении");
        }
        frames.push({ mode: "gaussian", phase: "eliminate", pivot: column, target: row, factor: factor, matrix: cloneMatrix(augmented), solution: null, message: "Из строки " + (row + 1) + " вычтено " + factor.toPrecision(5) + " pivot-строки." });
      }
    }
    const solution = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row -= 1) {
      let rhs = augmented[row][n];
      for (let column = row + 1; column < n; column += 1) {
        const product = checkedNumber(augmented[row][column] * solution[column], "Произведение обратной подстановки");
        rhs = checkedNumber(rhs - product, "Разность обратной подстановки");
      }
      solution[row] = checkedNumber(rhs / augmented[row][row], "Компонента решения");
      frames.push({ mode: "gaussian", phase: "back-substitute", pivot: row, target: null, matrix: cloneMatrix(augmented), solution: solution.slice(), message: "Обратная подстановка определила x_" + (row + 1) + "." });
    }
    frames.push({ mode: "gaussian", phase: "done", pivot: null, target: null, matrix: cloneMatrix(augmented), solution: solution.slice(), message: "Система решена; остаток следует проверять в исходных данных." });
    return shared.deepFreeze(frames);
  }
  function solve(matrix, vector, pivoting) { return gaussianFrames(matrix, vector, pivoting).at(-1).solution; }
  function multiplyVector(matrix, vector) {
    return matrix.map(function (row) {
      return row.reduce(function (sum, value, index) {
        const product = checkedNumber(value * vector[index], "Произведение матрицы на вектор");
        return checkedNumber(sum + product, "Сумма матрицы на вектор");
      }, 0);
    });
  }
  function residual(matrix, solution, vector) {
    return multiplyVector(matrix, solution).map(function (value, index) {
      return checkedNumber(vector[index] - value, "Компонента residual");
    });
  }
  function infinityNormVector(vector) {
    return Math.max.apply(null, vector.map(function (value) {
      return Math.abs(checkedNumber(value, "Компонента вектора"));
    }));
  }
  function infinityNormMatrix(matrix) {
    return Math.max.apply(null, matrix.map(function (row) {
      return row.reduce(function (sum, value) {
        return checkedNumber(sum + Math.abs(value), "Строковая сумма нормы матрицы");
      }, 0);
    }));
  }
  function inverse(matrix) { const a = validateMatrix(matrix, true), n = a.length, columns = []; for (let i = 0; i < n; i += 1) { const unit = new Array(n).fill(0); unit[i] = 1; columns.push(solve(a, unit, true)); } return Array.from({ length: n }, function (_, i) { return columns.map(function (column) { return column[i]; }); }); }
  function conditionInfinity(matrix) {
    const a = validateMatrix(matrix, true);
    return checkedNumber(infinityNormMatrix(a) * infinityNormMatrix(inverse(a)), "Число обусловленности");
  }
  function iterativeRefinementFrames(matrix, vector, iterations) {
    const a = validateMatrix(matrix, true), b = vector.map(Number), count = shared.boundedInteger(iterations === undefined ? 6 : iterations, "Итерации", 1, 20);
    let solution = solve(a, b, true); const frames = [];
    for (let index = 0; index <= count; index += 1) { const r = residual(a, solution, b), norm = infinityNormVector(r); frames.push({ mode: "refinement", phase: index === count || norm === 0 ? "done" : "correct", iteration: index, matrix: a, solution: solution.slice(), residual: r.slice(), residualNorm: norm, message: "Итерация " + index + ": ||b−Ax||∞ = " + norm.toExponential(4) + "." }); if (index === count || norm === 0) break; const correction = solve(a, r, true); solution = solution.map(function (value, i) { return checkedNumber(value + correction[i], "Итерационное уточнение"); }); }
    return shared.deepFreeze(frames);
  }
  function hilbert(size) { const n = shared.boundedInteger(size, "Порядок", 1, MAX_DIMENSION); return Array.from({ length: n }, function (_, i) { return Array.from({ length: n }, function (_, j) { return 1 / (i + j + 1); }); }); }
  function createState(options) {
    const settings = options || {}, mode = settings.mode || "gaussian";
    const matrix = settings.matrix ? (typeof settings.matrix === "string" ? parseMatrix(settings.matrix) : validateMatrix(settings.matrix, true)) : [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const vector = settings.vector ? (typeof settings.vector === "string" ? parseVector(settings.vector, matrix.length) : settings.vector.map(Number)) : [8, -11, -3];
    let frames;
    if (mode === "gaussian") frames = gaussianFrames(matrix, vector, settings.pivoting !== false);
    else if (mode === "refinement") frames = iterativeRefinementFrames(matrix, vector, settings.iterations);
    else if (mode === "conditioning") { const condition = conditionInfinity(matrix), solution = solve(matrix, vector, true), r = residual(matrix, solution, vector); frames = [{ mode: "conditioning", phase: "done", matrix: matrix, solution: solution, residual: r, residualNorm: infinityNormVector(r), condition: condition, message: "Число обусловленности κ∞ ≈ " + condition.toPrecision(6) + "; малый residual сам по себе не гарантирует малую ошибку решения." }]; }
    else if (mode === "strassen") { const result = strassenMultiply(matrix, matrix); frames = result.trace.map(function (frame) { return Object.assign({ mode: "strassen", matrix: frame.result || matrix, message: frame.phase === "split" ? "Блок разбит на четыре квадранта." : frame.phase === "base" ? "Базовый блок перемножен напрямую." : "Семь произведений собраны в четыре квадранта." }, frame); }); frames.push({ mode: "strassen", phase: "done", depth: 0, size: matrix.length, matrix: result.result, result: result.result, message: "Произведение A² вычислено в Number-арифметике; округление возможно." }); }
    else throw new RangeError("Неизвестный режим матричной лаборатории.");
    return shared.makePlayback(frames, { mode: mode, inputs: { matrix: matrix, vector: vector } });
  }
  return Object.freeze({ EPSILON: EPSILON, MAX_DIMENSION: MAX_DIMENSION, parseMatrix: parseMatrix, parseVector: parseVector, multiplyMatrices: multiplyMatrices, strassenMultiply: strassenMultiply, gaussianFrames: gaussianFrames, solve: solve, residual: residual, conditionInfinity: conditionInfinity, iterativeRefinementFrames: iterativeRefinementFrames, hilbert: hilbert, createState: createState, step: shared.step, seek: shared.seek, reset: shared.reset, isFinished: function (state) { return Boolean(state && state.finished); } });
});
