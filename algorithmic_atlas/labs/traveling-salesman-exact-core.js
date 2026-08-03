(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports ? require("./graph-lab-core.js") : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TravelingSalesmanExactCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MODES = Object.freeze(["brute-force", "held-karp", "branch-bound"]);
  const MAX_CITIES = 9;
  const MAX_DIGITS = 30;
  const MAX_FRAMES = 4096;
  const MAX_BRUTE_CITIES = 8;
  const MAX_BRANCH_CITIES = 8;

  const PRESETS = shared.deepFreeze({
    metric: {
      label: "Метрические городские кварталы",
      symmetric: true,
      points: [["A", 0, 0], ["B", 4, 0], ["C", 5, 3], ["D", 2, 5], ["E", -1, 3]],
      metric: "manhattan",
    },
    branching: {
      label: "Дерево с полезными отсечениями",
      symmetric: true,
      points: [["A", 0, 0], ["B", 4, 0], ["C", 8, 0], ["D", 8, 5], ["E", 4, 5], ["F", 0, 5]],
      matrix: [
        [0, 26, 25, 28, 11, 10],
        [26, 0, 19, 18, 3, 16],
        [25, 19, 0, 29, 4, 19],
        [28, 18, 29, 0, 8, 29],
        [11, 3, 4, 8, 0, 14],
        [10, 16, 19, 29, 14, 0],
      ],
    },
    multiple: {
      label: "Много оптимальных туров",
      symmetric: true,
      points: [["A", 0, 0], ["B", 2, 0], ["C", 2, 2], ["D", 0, 2]],
      matrix: [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]],
    },
    asymmetric: {
      label: "Асимметричные тарифы",
      symmetric: false,
      points: [["A", 0, 0], ["B", 3, 0], ["C", 4, 3], ["D", 0, 4]],
      matrix: [[0, 3, 9, 5], [7, 0, 2, 8], [6, 4, 0, 3], [2, 6, 5, 0]],
    },
    violation: {
      label: "Нарушение неравенства треугольника",
      symmetric: true,
      points: [["A", 0, 0], ["B", 2, 0], ["C", 4, 0], ["D", 2, 3]],
      matrix: [[0, 1, 10, 4], [1, 0, 1, 3], [10, 1, 0, 4], [4, 3, 4, 0]],
    },
    noTour: {
      label: "Гамильтонов цикл отсутствует",
      symmetric: false,
      points: [["A", 0, 0], ["B", 3, 0], ["C", 3, 3], ["D", 0, 3]],
      matrix: [[0, 1, null, null], [null, 0, 1, null], [null, null, 0, 1], [null, null, null, 0]],
    },
    huge: {
      label: "Большие точные расстояния",
      symmetric: true,
      points: [["A", 0, 0], ["B", 3, 0], ["C", 1, 3]],
      matrix: [
        [0, "900719925474099312345678", "800000000000000000000000"],
        ["900719925474099312345678", 0, "700000000000000000000000"],
        ["800000000000000000000000", "700000000000000000000000", 0],
      ],
    },
  });

  function parseDistance(raw, label) {
    if (raw === null || raw === undefined || raw === "∞") return null;
    if (typeof raw === "bigint") raw = raw.toString();
    if (typeof raw === "number") {
      if (!Number.isSafeInteger(raw)) throw new RangeError((label || "Расстояние") + ": большие целые вводите строкой");
      raw = String(raw);
    }
    if (typeof raw !== "string" || !/^\+?\d+$/.test(raw.trim())) throw new RangeError((label || "Расстояние") + ": требуется неотрицательное целое");
    const text = raw.trim().replace(/^\+/, "");
    if (text.replace(/^0+(?=\d)/, "").length > MAX_DIGITS) throw new RangeError((label || "Расстояние") + ": не больше " + MAX_DIGITS + " цифр");
    return BigInt(text);
  }

  function normalizeInstance(rawInstance) {
    if (!rawInstance || typeof rawInstance !== "object" || Array.isArray(rawInstance)) throw new TypeError("Экземпляр TSP должен быть объектом");
    if (!Array.isArray(rawInstance.cities) || !Array.isArray(rawInstance.matrix)) throw new TypeError("Нужны массивы cities и matrix");
    const size = rawInstance.cities.length;
    if (size > MAX_CITIES) throw new RangeError("Лаборатория допускает не больше " + MAX_CITIES + " городов");
    if (rawInstance.matrix.length !== size || !rawInstance.matrix.every(function (row) { return Array.isArray(row) && row.length === size; })) throw new RangeError("Матрица расстояний должна иметь размер n × n");
    const ids = new Set();
    const cities = rawInstance.cities.map(function (rawCity, index) {
      const source = rawCity && typeof rawCity === "object" && !Array.isArray(rawCity) ? rawCity : { id: rawCity };
      const id = shared.normalizeId(source.id, "Город " + index);
      if (ids.has(id)) throw new RangeError("Повтор города " + id);
      ids.add(id);
      const x = source.x === undefined ? index : shared.boundedNumber(source.x, "Координата x", -1000000, 1000000);
      const y = source.y === undefined ? 0 : shared.boundedNumber(source.y, "Координата y", -1000000, 1000000);
      return { id: id, label: source.label === undefined ? id : shared.boundedString(source.label, "Название города", 80, false), x: x, y: y };
    });
    const matrix = rawInstance.matrix.map(function (row, i) {
      return row.map(function (value, j) {
        const parsed = parseDistance(value, "Расстояние " + cities[i].id + " → " + cities[j].id);
        if (i === j && parsed !== 0n) throw new RangeError("На диагонали матрицы должен быть ноль");
        return parsed === null ? null : parsed.toString();
      });
    });
    const symmetric = Boolean(rawInstance.symmetric);
    if (symmetric) {
      for (let i = 0; i < size; i += 1) for (let j = i + 1; j < size; j += 1) {
        if (matrix[i][j] !== matrix[j][i]) throw new RangeError("Симметричный экземпляр имеет разные встречные расстояния");
      }
    }
    return shared.deepFreeze({
      id: rawInstance.id ? String(rawInstance.id) : "tsp-instance",
      label: rawInstance.label ? String(rawInstance.label) : "Экземпляр TSP",
      symmetric: symmetric, cities: cities, matrix: matrix,
    });
  }

  function preset(rawName) {
    const name = String(rawName || "metric");
    const value = PRESETS[name];
    if (!value) throw new RangeError("Неизвестный сценарий TSP");
    const cities = value.points.map(function (item) { return { id: item[0], x: item[1], y: item[2] }; });
    let matrix = value.matrix;
    if (!matrix && value.metric === "manhattan") {
      matrix = value.points.map(function (left) {
        return value.points.map(function (right) { return Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]); });
      });
    }
    return normalizeInstance({ id: name, label: value.label, symmetric: value.symmetric, cities: cities, matrix: matrix });
  }

  function distance(instance, from, to) {
    const value = instance.matrix[from][to];
    return value === null ? null : BigInt(value);
  }

  function add(left, right) {
    return left === null || right === null ? null : left + right;
  }

  function tourCost(rawInstance, tour) {
    const instance = normalizeInstance(rawInstance);
    if (!Array.isArray(tour)) throw new TypeError("Тур должен быть массивом индексов");
    let cost = 0n;
    for (let index = 1; index < tour.length; index += 1) {
      const edge = distance(instance, tour[index - 1], tour[index]);
      if (edge === null) return null;
      cost += edge;
    }
    return cost;
  }

  function serializeCost(value) { return value === null ? null : value.toString(); }
  function idsFor(instance, indices) { return indices.map(function (index) { return instance.cities[index].id; }); }

  function trivialTrace(instance, mode) {
    if (instance.cities.length === 0) return shared.deepFreeze({ mode: mode, instance: instance, cost: "0", tour: [], frames: [{ stage: "optimal", message: "Пустой экземпляр имеет пустой тур стоимости 0", path: [], cost: "0", incumbent: "0", lowerBound: "0", reason: "empty", finished: true }] });
    if (instance.cities.length === 1) {
      const id = instance.cities[0].id;
      return shared.deepFreeze({ mode: mode, instance: instance, cost: "0", tour: [id, id], frames: [{ stage: "optimal", message: "Единственный город образует нулевой замкнутый тур", path: [id, id], cost: "0", incumbent: "0", lowerBound: "0", reason: "singleton", finished: true }] });
    }
    return null;
  }

  function permutations(items, visit) {
    const values = items.slice();
    function generate(index) {
      if (index === values.length) { visit(values.slice()); return; }
      for (let next = index; next < values.length; next += 1) {
        const temporary = values[index]; values[index] = values[next]; values[next] = temporary;
        generate(index + 1);
        values[next] = values[index]; values[index] = temporary;
      }
    }
    generate(0);
  }

  function bruteForceTrace(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const trivial = trivialTrace(instance, "brute-force");
    if (trivial) return trivial;
    if (instance.cities.length > MAX_BRUTE_CITIES) throw new RangeError("Полный перебор ограничен " + MAX_BRUTE_CITIES + " городами");
    const start = 0;
    const others = Array.from({ length: instance.cities.length - 1 }, function (_, index) { return index + 1; });
    const frames = [];
    let bestCost = null;
    let bestTour = null;
    let count = 0;
    permutations(others, function (order) {
      const tour = [start].concat(order, [start]);
      const cost = tourCost(instance, tour);
      count += 1;
      const improved = cost !== null && (bestCost === null || cost < bestCost);
      if (improved) { bestCost = cost; bestTour = tour.slice(); }
      if (frames.length < MAX_FRAMES - 1) frames.push({
        stage: improved ? "improve" : "candidate", message: cost === null ? "Кандидат использует отсутствующую дугу" : improved ? "Найден новый лучший тур стоимости " + cost : "Тур стоимости " + cost + " не улучшает рекорд",
        path: idsFor(instance, tour), cost: serializeCost(cost), incumbent: serializeCost(bestCost),
        lowerBound: null, reason: cost === null ? "missing-edge" : improved ? "new-incumbent" : "not-better", permutation: count, finished: false,
      });
    });
    frames.push({ stage: bestTour ? "optimal" : "no-tour", message: bestTour ? "Перебраны все " + count + " перестановок после фиксированного старта" : "Ни одна перестановка не образует гамильтонов цикл", path: bestTour ? idsFor(instance, bestTour) : [], cost: serializeCost(bestCost), incumbent: serializeCost(bestCost), lowerBound: serializeCost(bestCost), reason: bestTour ? "exhausted" : "no-tour", permutation: count, finished: true });
    return shared.deepFreeze({ mode: "brute-force", instance: instance, cost: serializeCost(bestCost), tour: bestTour ? idsFor(instance, bestTour) : null, frames: frames, permutations: count });
  }

  function heldKarpTrace(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const trivial = trivialTrace(instance, "held-karp");
    if (trivial) return trivial;
    const n = instance.cities.length;
    const start = 0;
    const bit = function (vertex) { return 1 << (vertex - 1); };
    const allMask = (1 << (n - 1)) - 1;
    const dp = new Map();
    const parent = new Map();
    const frames = [];
    for (let vertex = 1; vertex < n; vertex += 1) {
      const value = distance(instance, start, vertex);
      const key = bit(vertex) + ":" + vertex;
      dp.set(key, value); parent.set(key, start);
      frames.push({ stage: "dp-state", message: "База: путь из старта прямо в " + instance.cities[vertex].id, subset: [instance.cities[vertex].id], endpoint: instance.cities[vertex].id, path: [instance.cities[start].id, instance.cities[vertex].id], cost: serializeCost(value), incumbent: null, lowerBound: null, reason: value === null ? "missing-edge" : "base", finished: false });
    }
    for (let mask = 1; mask <= allMask; mask += 1) {
      for (let endpoint = 1; endpoint < n; endpoint += 1) {
        if (!(mask & bit(endpoint)) || mask === bit(endpoint)) continue;
        const previousMask = mask ^ bit(endpoint);
        let best = null; let bestParent = null;
        for (let predecessor = 1; predecessor < n; predecessor += 1) {
          if (!(previousMask & bit(predecessor))) continue;
          const prefix = dp.get(previousMask + ":" + predecessor);
          const candidate = add(prefix === undefined ? null : prefix, distance(instance, predecessor, endpoint));
          if (candidate !== null && (best === null || candidate < best || (candidate === best && predecessor < bestParent))) { best = candidate; bestParent = predecessor; }
        }
        const key = mask + ":" + endpoint;
        dp.set(key, best); parent.set(key, bestParent);
        const subset = [];
        for (let vertex = 1; vertex < n; vertex += 1) if (mask & bit(vertex)) subset.push(instance.cities[vertex].id);
        frames.push({ stage: "dp-state", message: best === null ? "Состояние недостижимо" : "Лучший путь по подмножеству заканчивается в " + instance.cities[endpoint].id + " и стоит " + best, subset: subset, endpoint: instance.cities[endpoint].id, predecessor: bestParent === null ? null : instance.cities[bestParent].id, path: [], cost: serializeCost(best), incumbent: null, lowerBound: null, reason: best === null ? "unreachable-state" : "recurrence", finished: false });
      }
    }
    let bestCost = null; let last = null;
    for (let endpoint = 1; endpoint < n; endpoint += 1) {
      const prefix = dp.get(allMask + ":" + endpoint);
      const candidate = add(prefix === undefined ? null : prefix, distance(instance, endpoint, start));
      if (candidate !== null && (bestCost === null || candidate < bestCost || (candidate === bestCost && endpoint < last))) { bestCost = candidate; last = endpoint; }
    }
    let tour = null;
    if (last !== null) {
      const reverse = [last]; let mask = allMask; let current = last;
      while (mask !== bit(current)) { const previous = parent.get(mask + ":" + current); mask ^= bit(current); current = previous; reverse.push(current); }
      reverse.reverse(); tour = [start].concat(reverse, [start]);
    }
    frames.push({ stage: tour ? "optimal" : "no-tour", message: tour ? "Все подмножества обработаны; замыкающая дуга возвращает оптимальный тур" : "Ни одно полное состояние нельзя замкнуть в старт", subset: instance.cities.slice(1).map(function (city) { return city.id; }), endpoint: last === null ? null : instance.cities[last].id, path: tour ? idsFor(instance, tour) : [], cost: serializeCost(bestCost), incumbent: serializeCost(bestCost), lowerBound: serializeCost(bestCost), reason: tour ? "dp-complete" : "no-tour", finished: true });
    return shared.deepFreeze({ mode: "held-karp", instance: instance, cost: serializeCost(bestCost), tour: tour ? idsFor(instance, tour) : null, frames: frames, states: dp.size });
  }

  function mstWeightIndices(instance, vertices) {
    if (vertices.length <= 1) return 0n;
    const reached = new Set([vertices[0]]); let total = 0n;
    while (reached.size < vertices.length) {
      let best = null; let bestVertex = null;
      reached.forEach(function (source) {
        vertices.forEach(function (target) {
          if (reached.has(target)) return;
          const value = distance(instance, source, target);
          if (value !== null && (best === null || value < best || (value === best && target < bestVertex))) { best = value; bestVertex = target; }
        });
      });
      if (best === null) return null;
      reached.add(bestVertex); total += best;
    }
    return total;
  }

  function mstWeight(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    if (!instance.symmetric) return null;
    return mstWeightIndices(instance, instance.cities.map(function (_, index) { return index; }));
  }

  function oneTreeBound(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const n = instance.cities.length;
    if (!instance.symmetric) return null;
    if (n === 0) return 0n;
    if (n === 1) return 0n;
    const rest = Array.from({ length: n - 1 }, function (_, index) { return index + 1; });
    const tree = mstWeightIndices(instance, rest);
    if (tree === null) return null;
    const incident = rest.map(function (vertex) { return distance(instance, 0, vertex); }).filter(function (value) { return value !== null; }).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    if (n === 2) return incident.length ? incident[0] * 2n : null;
    return incident.length >= 2 ? tree + incident[0] + incident[1] : null;
  }

  function completionBound(instance, path, unvisited, currentCost) {
    const start = path[0]; const last = path[path.length - 1];
    if (!unvisited.length) return add(currentCost, distance(instance, last, start));
    if (instance.symmetric) {
      const tree = mstWeightIndices(instance, unvisited);
      if (tree === null) return null;
      let fromLast = null; let toStart = null;
      unvisited.forEach(function (vertex) {
        const left = distance(instance, last, vertex);
        const right = distance(instance, vertex, start);
        if (left !== null && (fromLast === null || left < fromLast)) fromLast = left;
        if (right !== null && (toStart === null || right < toStart)) toStart = right;
      });
      return fromLast === null || toStart === null ? null : currentCost + tree + fromLast + toStart;
    }
    let bound = currentCost;
    const sources = [last].concat(unvisited);
    sources.forEach(function (source) {
      const targets = unvisited.filter(function (target) { return target !== source; }).concat([start]);
      let best = null;
      targets.forEach(function (target) { const value = distance(instance, source, target); if (value !== null && (best === null || value < best)) best = value; });
      if (best === null) bound = null;
      else if (bound !== null) bound += best;
    });
    return bound;
  }

  function greedyTour(instance) {
    if (instance.cities.length < 2) return null;
    const unvisited = new Set(Array.from({ length: instance.cities.length - 1 }, function (_, index) { return index + 1; }));
    const tour = [0]; let cost = 0n; let current = 0;
    while (unvisited.size) {
      let chosen = null; let chosenCost = null;
      unvisited.forEach(function (vertex) { const value = distance(instance, current, vertex); if (value !== null && (chosenCost === null || value < chosenCost || (value === chosenCost && vertex < chosen))) { chosen = vertex; chosenCost = value; } });
      if (chosen === null) return null;
      tour.push(chosen); unvisited.delete(chosen); cost += chosenCost; current = chosen;
    }
    const back = distance(instance, current, 0);
    return back === null ? null : { tour: tour.concat([0]), cost: cost + back };
  }

  function branchBoundTrace(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const trivial = trivialTrace(instance, "branch-bound");
    if (trivial) return trivial;
    if (instance.cities.length > MAX_BRANCH_CITIES) throw new RangeError("Ветвление с визуальным деревом ограничено " + MAX_BRANCH_CITIES + " городами");
    const initial = greedyTour(instance);
    let bestCost = initial ? initial.cost : null;
    let bestTour = initial ? initial.tour : null;
    const frames = [];
    let nodeCounter = 0;

    function search(path, unvisited, cost, parentId) {
      if (nodeCounter >= MAX_FRAMES - 1) throw new RangeError("Дерево поиска превысило безопасный предел кадров");
      const nodeId = "search-" + String(++nodeCounter);
      const bound = completionBound(instance, path, unvisited, cost);
      let reason = "expand";
      if (bound === null) reason = "missing-completion";
      else if (bestCost !== null && bound >= bestCost) reason = "bound-not-better";
      const frame = { stage: reason === "expand" ? "branch" : "prune", message: reason === "expand" ? "Узел раскрывается: нижняя граница ещё лучше рекорда" : reason === "missing-completion" ? "Ветка отсечена: завершение невозможно" : "Ветка отсечена: нижняя граница не лучше рекорда", nodeId: nodeId, parentId: parentId, path: idsFor(instance, path), unvisited: idsFor(instance, unvisited), cost: cost.toString(), incumbent: serializeCost(bestCost), lowerBound: serializeCost(bound), reason: reason, finished: false };
      frames.push(frame);
      if (reason !== "expand") return;
      if (!unvisited.length) {
        const back = distance(instance, path[path.length - 1], path[0]);
        if (back === null) { frame.stage = "prune"; frame.reason = "missing-return"; frame.message = "Ветка не замыкается в старт"; return; }
        const total = cost + back;
        if (bestCost === null || total < bestCost) { bestCost = total; bestTour = path.concat([path[0]]); frame.stage = "improve"; frame.reason = "new-incumbent"; frame.message = "Полный тур улучшает рекорд до " + total; frame.incumbent = total.toString(); frame.path = idsFor(instance, bestTour); }
        else { frame.stage = "tour"; frame.reason = "complete-not-better"; frame.message = "Полный тур стоимости " + total + " не улучшает рекорд"; }
        frame.cost = total.toString(); return;
      }
      const last = path[path.length - 1];
      const candidates = unvisited.slice().sort(function (left, right) {
        const a = distance(instance, last, left); const b = distance(instance, last, right);
        if (a === null) return b === null ? left - right : 1;
        if (b === null) return -1;
        return a < b ? -1 : a > b ? 1 : left - right;
      });
      candidates.forEach(function (next) {
        const edge = distance(instance, last, next);
        if (edge === null) {
          const missingId = "search-" + String(++nodeCounter);
          frames.push({ stage: "prune", message: "Ветка отсечена: выбранной дуги нет", nodeId: missingId, parentId: nodeId, path: idsFor(instance, path.concat([next])), unvisited: idsFor(instance, unvisited.filter(function (v) { return v !== next; })), cost: null, incumbent: serializeCost(bestCost), lowerBound: null, reason: "missing-edge", finished: false });
        } else search(path.concat([next]), unvisited.filter(function (v) { return v !== next; }), cost + edge, nodeId);
      });
    }

    search([0], Array.from({ length: instance.cities.length - 1 }, function (_, index) { return index + 1; }), 0n, null);
    frames.push({ stage: bestTour ? "optimal" : "no-tour", message: bestTour ? "Дерево исчерпано; каждая отброшенная ветка имеет точное основание" : "Дерево исчерпано; гамильтонов цикл отсутствует", nodeId: "final", parentId: null, path: bestTour ? idsFor(instance, bestTour) : [], unvisited: [], cost: serializeCost(bestCost), incumbent: serializeCost(bestCost), lowerBound: serializeCost(bestCost), reason: bestTour ? "tree-exhausted" : "no-tour", finished: true });
    return shared.deepFreeze({ mode: "branch-bound", instance: instance, cost: serializeCost(bestCost), tour: bestTour ? idsFor(instance, bestTour) : null, frames: frames, nodes: nodeCounter, initialIncumbent: initial ? initial.cost.toString() : null });
  }

  function metricAnalysis(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const violations = [];
    for (let i = 0; i < instance.cities.length; i += 1) for (let j = 0; j < instance.cities.length; j += 1) for (let k = 0; k < instance.cities.length; k += 1) {
      const direct = distance(instance, i, k); const left = distance(instance, i, j); const right = distance(instance, j, k);
      if (direct !== null && left !== null && right !== null && direct > left + right) violations.push({ from: instance.cities[i].id, via: instance.cities[j].id, to: instance.cities[k].id, direct: direct.toString(), detour: (left + right).toString() });
    }
    return shared.deepFreeze({ symmetric: instance.symmetric, complete: instance.matrix.every(function (row, i) { return row.every(function (value, j) { return i === j || value !== null; }); }), metric: instance.symmetric && violations.length === 0 && instance.matrix.every(function (row, i) { return row.every(function (value, j) { return i === j || value !== null; }); }), violations: violations });
  }

  function metricClosure(rawInstance) {
    const instance = normalizeInstance(rawInstance);
    const matrix = instance.matrix.map(function (row) { return row.map(function (value) { return value === null ? null : BigInt(value); }); });
    for (let k = 0; k < matrix.length; k += 1) for (let i = 0; i < matrix.length; i += 1) for (let j = 0; j < matrix.length; j += 1) {
      const candidate = add(matrix[i][k], matrix[k][j]);
      if (candidate !== null && (matrix[i][j] === null || candidate < matrix[i][j])) matrix[i][j] = candidate;
    }
    return shared.deepFreeze(matrix.map(function (row) { return row.map(serializeCost); }));
  }

  function buildTrace(rawInstance, rawOptions) {
    const mode = String(rawOptions && rawOptions.mode || "held-karp");
    if (!MODES.includes(mode)) throw new RangeError("Неизвестный точный метод TSP");
    if (mode === "brute-force") return bruteForceTrace(rawInstance);
    if (mode === "held-karp") return heldKarpTrace(rawInstance);
    return branchBoundTrace(rawInstance);
  }

  function createState(rawInstance, rawOptions) {
    const trace = buildTrace(rawInstance, rawOptions);
    return shared.deepFreeze({ trace: trace, playback: shared.createPlayback(trace.frames) });
  }
  function step(state) { if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние TSP"); if (state.playback.finished) return state; return shared.deepFreeze({ trace: state.trace, playback: shared.playbackStep(state.playback) }); }
  function seek(state, cursor) { if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние TSP"); return shared.deepFreeze({ trace: state.trace, playback: shared.playbackSeek(state.playback, cursor) }); }
  function visualModel(state) { if (!state || !state.playback || !state.playback.current) throw new TypeError("Некорректная визуальная модель TSP"); return shared.deepFreeze({ mode: state.trace.mode, instance: state.trace.instance, frame: state.playback.current, cursor: state.playback.cursor, frameCount: state.playback.frames.length, finished: state.playback.finished }); }

  return Object.freeze({
    MODES: MODES, PRESETS: PRESETS, MAX_CITIES: MAX_CITIES,
    parseDistance: parseDistance, normalizeInstance: normalizeInstance, preset: preset,
    tourCost: tourCost, bruteForceTrace: bruteForceTrace, heldKarpTrace: heldKarpTrace,
    branchBoundTrace: branchBoundTrace, mstWeight: mstWeight, oneTreeBound: oneTreeBound,
    metricAnalysis: metricAnalysis, metricClosure: metricClosure,
    buildTrace: buildTrace, createState: createState, step: step, seek: seek, visualModel: visualModel,
  });
});
