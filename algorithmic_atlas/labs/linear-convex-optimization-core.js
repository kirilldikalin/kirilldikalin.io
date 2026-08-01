(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LinearConvexOptimizationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRESETS = Object.freeze({
    balanced: Object.freeze({
      title: "Сбалансированные ресурсы",
      matrix: Object.freeze([Object.freeze([2, 1]), Object.freeze([1, 2])]),
      bounds: Object.freeze([10, 8]),
      objective: Object.freeze([4, 3]),
    }),
    scarceFirst: Object.freeze({
      title: "Первый ресурс дефицитен",
      matrix: Object.freeze([Object.freeze([3, 1]), Object.freeze([1, 1])]),
      bounds: Object.freeze([12, 6]),
      objective: Object.freeze([5, 2]),
    }),
    crossed: Object.freeze({
      title: "Перекрёстные ограничения",
      matrix: Object.freeze([Object.freeze([1, 3]), Object.freeze([2, 1])]),
      bounds: Object.freeze([12, 10]),
      objective: Object.freeze([3, 5]),
    }),
  });
  const PHASES = Object.freeze([
    "formulate", "primal-region", "primal-levels", "primal-optimum",
    "dual-region", "dual-optimum", "certificate", "finish",
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function gcd(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
      const next = x % y;
      x = y;
      y = next;
    }
    return x || 1n;
  }

  function fraction(numerator, denominator) {
    let n = typeof numerator === "bigint" ? numerator : BigInt(numerator);
    let d = denominator === undefined ? 1n :
      (typeof denominator === "bigint" ? denominator : BigInt(denominator));
    if (d === 0n) throw new RangeError("Нулевой знаменатель");
    if (d < 0n) { n = -n; d = -d; }
    const divisor = gcd(n, d);
    return deepFreeze({ n: n / divisor, d: d / divisor });
  }

  function add(a, b) { return fraction(a.n * b.d + b.n * a.d, a.d * b.d); }
  function subtract(a, b) { return fraction(a.n * b.d - b.n * a.d, a.d * b.d); }
  function multiply(a, b) { return fraction(a.n * b.n, a.d * b.d); }
  function compare(a, b) {
    const delta = a.n * b.d - b.n * a.d;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  }
  function toNumber(value) { return Number(value.n) / Number(value.d); }
  function formatFraction(value) {
    return value.d === 1n ? String(value.n) : String(value.n) + "/" + String(value.d);
  }

  function integer(value, minimum, maximum, label) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return parsed;
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const presetId = options.preset || "balanced";
    const preset = PRESETS[presetId];
    if (!preset) throw new RangeError("Неизвестный сценарий линейной программы");
    return deepFreeze({
      preset: presetId,
      matrix: preset.matrix,
      b: Object.freeze([
        integer(options.b1 === undefined ? preset.bounds[0] : options.b1, 3, 18, "b₁"),
        integer(options.b2 === undefined ? preset.bounds[1] : options.b2, 3, 18, "b₂"),
      ]),
      c: Object.freeze([
        integer(options.c1 === undefined ? preset.objective[0] : options.c1, 1, 9, "c₁"),
        integer(options.c2 === undefined ? preset.objective[1] : options.c2, 1, 9, "c₂"),
      ]),
    });
  }

  function constraint(p, q, r, id, label) {
    return deepFreeze({ p: BigInt(p), q: BigInt(q), r: BigInt(r), id: id, label: label });
  }

  function intersection(first, second) {
    const determinant = first.p * second.q - second.p * first.q;
    if (determinant === 0n) return null;
    return deepFreeze({
      x: fraction(first.r * second.q - first.q * second.r, determinant),
      y: fraction(first.p * second.r - first.r * second.p, determinant),
      boundaries: Object.freeze([first.id, second.id]),
    });
  }

  function left(constraintValue, point) {
    return add(
      multiply(fraction(constraintValue.p), point.x),
      multiply(fraction(constraintValue.q), point.y)
    );
  }

  function feasible(point, constraints) {
    return constraints.every(function (item) {
      return compare(left(item, point), fraction(item.r)) <= 0;
    });
  }

  function vertexKey(point) {
    return point.x.n + "/" + point.x.d + ":" + point.y.n + "/" + point.y.d;
  }

  function enumerateVertices(constraints) {
    const found = new Map();
    for (let first = 0; first < constraints.length; first += 1) {
      for (let second = first + 1; second < constraints.length; second += 1) {
        const point = intersection(constraints[first], constraints[second]);
        if (point && feasible(point, constraints)) found.set(vertexKey(point), point);
      }
    }
    return deepFreeze(Array.from(found.values()));
  }

  function dot(coefficients, point) {
    return add(
      multiply(fraction(coefficients[0]), point.x),
      multiply(fraction(coefficients[1]), point.y)
    );
  }

  function optimize(vertices, coefficients, direction) {
    if (!vertices.length) throw new Error("Допустимая область не имеет вершины");
    return vertices.reduce(function (best, point) {
      const pointValue = dot(coefficients, point);
      const bestValue = dot(coefficients, best);
      const order = compare(pointValue, bestValue);
      return direction === "max" ? (order > 0 ? point : best) : (order < 0 ? point : best);
    }, vertices[0]);
  }

  function primalConstraints(options) {
    const A = options.matrix;
    return deepFreeze([
      constraint(A[0][0], A[0][1], options.b[0], "resource-1", "ресурс 1"),
      constraint(A[1][0], A[1][1], options.b[1], "resource-2", "ресурс 2"),
      constraint(-1, 0, 0, "x-nonnegative", "x ≥ 0"),
      constraint(0, -1, 0, "y-nonnegative", "y ≥ 0"),
    ]);
  }

  function dualConstraints(options) {
    const A = options.matrix;
    return deepFreeze([
      constraint(-A[0][0], -A[1][0], -options.c[0], "product-1", "покрыть ценность x"),
      constraint(-A[0][1], -A[1][1], -options.c[1], "product-2", "покрыть ценность y"),
      constraint(-1, 0, 0, "u-nonnegative", "u ≥ 0"),
      constraint(0, -1, 0, "v-nonnegative", "v ≥ 0"),
    ]);
  }

  function slack(constraintValue, point) {
    return subtract(fraction(constraintValue.r), left(constraintValue, point));
  }

  function solve(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const primal = primalConstraints(options);
    const dual = dualConstraints(options);
    const primalVertices = enumerateVertices(primal);
    const dualVertices = enumerateVertices(dual);
    const primalOptimum = optimize(primalVertices, options.c, "max");
    const dualOptimum = optimize(dualVertices, options.b, "min");
    const primalValue = dot(options.c, primalOptimum);
    const dualValue = dot(options.b, dualOptimum);
    if (compare(primalValue, dualValue) !== 0) {
      throw new Error("Прямая и двойственная оптимальные стоимости разошлись");
    }
    const primalResourceSlacks = primal.slice(0, 2).map(function (item) {
      return slack(item, primalOptimum);
    });
    const dualProductSlacks = dual.slice(0, 2).map(function (item) {
      return slack(item, dualOptimum);
    });
    const complementaryProducts = deepFreeze([
      multiply(primalResourceSlacks[0], dualOptimum.x),
      multiply(primalResourceSlacks[1], dualOptimum.y),
      multiply(dualProductSlacks[0], primalOptimum.x),
      multiply(dualProductSlacks[1], primalOptimum.y),
    ]);
    if (complementaryProducts.some(function (value) { return value.n !== 0n; })) {
      throw new Error("Нарушена дополняющая нежёсткость");
    }
    return deepFreeze({
      options: options,
      primal: deepFreeze({
        constraints: primal,
        vertices: primalVertices,
        optimum: primalOptimum,
        value: primalValue,
        slacks: primalResourceSlacks,
      }),
      dual: deepFreeze({
        constraints: dual,
        vertices: dualVertices,
        optimum: dualOptimum,
        value: dualValue,
        slacks: dualProductSlacks,
      }),
      complementaryProducts: complementaryProducts,
    });
  }

  function buildTrace(rawOptions) {
    const solution = solve(rawOptions);
    const messages = [
      "Одна матрица коэффициентов задаёт прямую и двойственную задачи",
      "Пересечение полуплоскостей образует допустимый многоугольник прямой задачи",
      "Параллельные линии уровня двигаются в направлении вектора цели",
      "Последняя касающаяся вершина максимизирует прямую целевую функцию",
      "Те же коэффициенты, транспонированные, задают двойственные требования",
      "Первая линия двойственной стоимости, касающаяся области, даёт минимум",
      "Равенство стоимостей и нулевые дополняющие произведения образуют сертификат",
      "Синхронное вычисление завершено: обе стороны подтверждают одну стоимость",
    ];
    return deepFreeze({
      solution: solution,
      frames: PHASES.map(function (phase, index) {
        return deepFreeze({ phase: phase, index: index, message: messages[index] });
      }),
    });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: false });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) {
      throw new TypeError("Некорректное состояние лаборатории оптимизации");
    }
    if (state.finished) return state;
    const cursor = Math.min(state.cursor + 1, state.trace.frames.length - 1);
    return deepFreeze({
      trace: state.trace,
      cursor: cursor,
      finished: cursor === state.trace.frames.length - 1,
    });
  }

  function numericConstraint(item) {
    return deepFreeze({
      p: Number(item.p), q: Number(item.q), r: Number(item.r), id: item.id, label: item.label,
    });
  }

  function clipPolygon(maximum, constraints) {
    let polygon = [
      { x: 0, y: 0 }, { x: maximum, y: 0 },
      { x: maximum, y: maximum }, { x: 0, y: maximum },
    ];
    constraints.forEach(function (constraintValue) {
      const next = [];
      function value(point) {
        return constraintValue.p * point.x + constraintValue.q * point.y - constraintValue.r;
      }
      for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const previous = polygon[(index + polygon.length - 1) % polygon.length];
        const currentValue = value(current);
        const previousValue = value(previous);
        const currentInside = currentValue <= 1e-9;
        const previousInside = previousValue <= 1e-9;
        if (currentInside !== previousInside) {
          const ratio = previousValue / (previousValue - currentValue);
          next.push({
            x: previous.x + ratio * (current.x - previous.x),
            y: previous.y + ratio * (current.y - previous.y),
          });
        }
        if (currentInside) next.push(current);
      }
      polygon = next;
    });
    return deepFreeze(polygon.map(function (point) {
      return deepFreeze({ x: point.x, y: point.y });
    }));
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) {
      throw new TypeError("Некорректное состояние визуализации оптимизации");
    }
    const solution = state.trace.solution;
    const primalLimit = Math.max(
      5,
      solution.options.b[0] / Math.min.apply(null, solution.options.matrix[0]),
      solution.options.b[1] / Math.min.apply(null, solution.options.matrix[1])
    ) * 1.2;
    const dualLimit = Math.max(
      4,
      solution.options.c[0] / Math.min(solution.options.matrix[0][0], solution.options.matrix[1][0]),
      solution.options.c[1] / Math.min(solution.options.matrix[0][1], solution.options.matrix[1][1]),
      toNumber(solution.dual.optimum.x), toNumber(solution.dual.optimum.y)
    ) * 1.8;
    const primalNumeric = solution.primal.constraints.map(numericConstraint);
    const dualNumeric = solution.dual.constraints.map(numericConstraint);
    return deepFreeze({
      options: solution.options,
      frame: state.trace.frames[state.cursor],
      primal: Object.assign({}, solution.primal, {
        limit: primalLimit,
        polygon: clipPolygon(primalLimit, primalNumeric),
        numericConstraints: primalNumeric,
      }),
      dual: Object.assign({}, solution.dual, {
        limit: dualLimit,
        polygon: clipPolygon(dualLimit, dualNumeric),
        numericConstraints: dualNumeric,
      }),
      complementaryProducts: solution.complementaryProducts,
    });
  }

  return deepFreeze({
    PRESETS: PRESETS,
    PHASES: PHASES,
    fraction: fraction,
    add: add,
    subtract: subtract,
    multiply: multiply,
    compare: compare,
    toNumber: toNumber,
    formatFraction: formatFraction,
    normalizeOptions: normalizeOptions,
    enumerateVertices: enumerateVertices,
    solve: solve,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    clipPolygon: clipPolygon,
    visualModel: visualModel,
  });
});
