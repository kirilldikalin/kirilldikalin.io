(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CirculationsMinCostFlowCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MODES = Object.freeze(["feasible", "min-cost"]);
  const MAX_NODES = 9;
  const MAX_EDGES = 28;
  const MAX_DIGITS = 30;
  const MAX_AUGMENTATIONS = 128;
  const AUX_SOURCE = "__super_source__";
  const AUX_SINK = "__super_sink__";

  const PRESETS = shared.deepFreeze({
    lowerBounds: {
      label: "Нижние границы и два баланса",
      nodes: [["S", -5], ["A", 0], ["B", 0], ["T", 5]],
      edges: [
        ["S", "A", 1, 5, 2], ["S", "B", 0, 4, 4],
        ["A", "B", 0, 2, -1], ["A", "T", 0, 4, 3],
        ["B", "T", 1, 5, 1],
      ],
    },
    infeasible: {
      label: "Недостаточная пропускная способность",
      nodes: [["S", -5], ["A", 0], ["T", 5]],
      edges: [["S", "A", 0, 3, 1], ["A", "T", 0, 3, 1]],
    },
    parallelZero: {
      label: "Параллельные и нулевые дуги",
      nodes: [["S", -3], ["A", 0], ["T", 3]],
      edges: [
        ["S", "A", 0, 0, -8], ["S", "A", 1, 3, 2],
        ["S", "A", 0, 2, 1], ["A", "T", 1, 4, 0],
      ],
    },
    negativeCosts: {
      label: "Отрицательные стоимости без отрицательного цикла",
      nodes: [["S", -4], ["A", 0], ["B", 0], ["T", 4]],
      edges: [
        ["S", "A", 0, 4, 2], ["A", "T", 0, 4, -3],
        ["S", "B", 0, 4, 0], ["B", "T", 0, 4, 2],
        ["A", "B", 0, 2, -2],
      ],
    },
    finiteNegativeCycle: {
      label: "Конечный отрицательный цикл",
      nodes: [["S", -2], ["A", 0], ["B", 0], ["T", 2]],
      edges: [
        ["S", "A", 0, 2, 0], ["A", "T", 0, 2, 2],
        ["A", "B", 0, 3, -4], ["B", "A", 0, 3, 1],
      ],
    },
    unbounded: {
      label: "Неограниченная отрицательная циркуляция",
      nodes: [["A", 0], ["B", 0]],
      edges: [["A", "B", 0, null, -2], ["B", "A", 0, null, 0]],
    },
    huge: {
      label: "Большие точные целые",
      nodes: [["S", "-900719925474099312345678"], ["T", "900719925474099312345678"]],
      edges: [["S", "T", 0, "900719925474099312345678", "12345678901234567890"]],
    },
  });

  function parseInteger(raw, label, allowNegative) {
    if (typeof raw === "bigint") raw = raw.toString();
    if (typeof raw === "number") {
      if (!Number.isSafeInteger(raw)) throw new RangeError((label || "Число") + ": большие целые вводите строкой");
      raw = String(raw);
    }
    if (typeof raw !== "string" || !/^[+-]?\d+$/.test(raw.trim())) {
      throw new RangeError((label || "Число") + ": требуется целое число");
    }
    const text = raw.trim();
    if (!allowNegative && text.startsWith("-")) {
      throw new RangeError((label || "Число") + ": требуется неотрицательное целое число");
    }
    const digits = text.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
    if (digits.length > MAX_DIGITS) throw new RangeError((label || "Число") + ": не больше " + MAX_DIGITS + " цифр");
    return BigInt(text);
  }

  function parseUpper(raw, label) {
    if (raw === null || raw === undefined || raw === "∞" || String(raw).trim().toLowerCase() === "inf") return null;
    return parseInteger(raw, label, false);
  }

  function normalizeNetwork(rawNetwork) {
    if (!rawNetwork || typeof rawNetwork !== "object" || Array.isArray(rawNetwork)) {
      throw new TypeError("Сеть должна быть объектом");
    }
    if (!Array.isArray(rawNetwork.nodes) || !Array.isArray(rawNetwork.edges)) {
      throw new TypeError("Сеть должна содержать массивы nodes и edges");
    }
    if (rawNetwork.nodes.length > MAX_NODES || rawNetwork.edges.length > MAX_EDGES) {
      throw new RangeError("Для лаборатории разрешено не больше " + MAX_NODES + " вершин и " + MAX_EDGES + " дуг");
    }
    const nodeIds = new Set();
    const nodes = rawNetwork.nodes.map(function (rawNode, index) {
      const source = rawNode && typeof rawNode === "object" && !Array.isArray(rawNode) ? rawNode : { id: rawNode };
      const id = shared.normalizeId(source.id, "nodes[" + index + "].id");
      if (id === AUX_SOURCE || id === AUX_SINK) throw new RangeError("Идентификатор вершины зарезервирован лабораторией");
      if (nodeIds.has(id)) throw new RangeError("Повтор вершины " + id);
      nodeIds.add(id);
      return {
        id: id,
        label: source.label === undefined ? id : shared.boundedString(source.label, "Метка вершины", 80, false),
        balance: parseInteger(source.balance === undefined ? 0 : source.balance, "Баланс " + id, true).toString(),
      };
    });
    const edgeIds = new Set();
    const edges = rawNetwork.edges.map(function (rawEdge, index) {
      if (!rawEdge || typeof rawEdge !== "object" || Array.isArray(rawEdge)) throw new TypeError("edges[" + index + "] должна быть объектом");
      const id = rawEdge.id === undefined ? "e" + String(index + 1) : shared.normalizeId(rawEdge.id, "ID дуги");
      if (edgeIds.has(id)) throw new RangeError("Повтор дуги " + id);
      edgeIds.add(id);
      const source = shared.normalizeId(rawEdge.source, "Начало дуги " + id);
      const target = shared.normalizeId(rawEdge.target, "Конец дуги " + id);
      if (!nodeIds.has(source) || !nodeIds.has(target)) throw new RangeError("Дуга " + id + " ссылается на неизвестную вершину");
      const lower = parseInteger(rawEdge.lower === undefined ? 0 : rawEdge.lower, "Нижняя граница " + id, false);
      const upper = parseUpper(rawEdge.upper, "Верхняя граница " + id);
      if (upper !== null && lower > upper) throw new RangeError("У дуги " + id + " нижняя граница больше верхней");
      const cost = parseInteger(rawEdge.cost === undefined ? 0 : rawEdge.cost, "Стоимость " + id, true);
      return { id: id, source: source, target: target, lower: lower.toString(), upper: upper === null ? null : upper.toString(), cost: cost.toString() };
    });
    return shared.deepFreeze({
      id: rawNetwork.id ? String(rawNetwork.id) : "circulation-network",
      label: rawNetwork.label ? String(rawNetwork.label) : "Сеть циркуляции",
      directed: true, nodes: nodes, edges: edges,
    });
  }

  function preset(rawName) {
    const name = String(rawName || "lowerBounds");
    const value = PRESETS[name];
    if (!value) throw new RangeError("Неизвестный сценарий циркуляции");
    return normalizeNetwork({
      id: name, label: value.label,
      nodes: value.nodes.map(function (item) { return { id: item[0], balance: item[1] }; }),
      edges: value.edges.map(function (item, index) {
        return { id: "e" + String(index + 1), source: item[0], target: item[1], lower: item[2], upper: item[3], cost: item[4] };
      }),
    });
  }

  function modeName(rawMode) {
    const mode = String(rawMode || "feasible");
    if (!MODES.includes(mode)) throw new RangeError("Неизвестный режим циркуляции");
    return mode;
  }

  function zeroMap(ids) {
    const map = Object.create(null);
    ids.forEach(function (id) { map[id] = 0n; });
    return map;
  }

  function lowerShift(rawNetwork) {
    const network = normalizeNetwork(rawNetwork);
    const adjusted = Object.create(null);
    network.nodes.forEach(function (node) { adjusted[node.id] = BigInt(node.balance); });
    const variableEdges = network.edges.map(function (edge) {
      const lower = BigInt(edge.lower);
      adjusted[edge.source] += lower;
      adjusted[edge.target] -= lower;
      return {
        id: edge.id, source: edge.source, target: edge.target,
        capacity: edge.upper === null ? null : BigInt(edge.upper) - lower,
        cost: BigInt(edge.cost), lower: lower,
      };
    });
    let totalDemand = 0n;
    let totalSupply = 0n;
    Object.keys(adjusted).forEach(function (id) {
      if (adjusted[id] > 0n) totalDemand += adjusted[id];
      if (adjusted[id] < 0n) totalSupply += -adjusted[id];
    });
    return {
      network: network,
      adjusted: adjusted,
      variableEdges: variableEdges,
      totalDemand: totalDemand,
      totalSupply: totalSupply,
      balanced: totalDemand === totalSupply,
    };
  }

  function auxiliaryEdges(shifted) {
    const edges = shifted.variableEdges.map(function (edge) {
      return { id: "orig:" + edge.id, originId: edge.id, source: edge.source, target: edge.target, capacity: edge.capacity, cost: edge.cost, kind: "original" };
    });
    Object.keys(shifted.adjusted).sort().forEach(function (id) {
      const value = shifted.adjusted[id];
      if (value < 0n) edges.push({ id: "supply:" + id, source: AUX_SOURCE, target: id, capacity: -value, cost: 0n, kind: "supply" });
      if (value > 0n) edges.push({ id: "demand:" + id, source: id, target: AUX_SINK, capacity: value, cost: 0n, kind: "demand" });
    });
    return edges;
  }

  function residualArcs(edges, flow) {
    const arcs = [];
    edges.forEach(function (edge, index) {
      const value = flow[edge.id] || 0n;
      if (value < 0n || (edge.capacity !== null && value > edge.capacity)) throw new Error("Поток вышел за границы дуги " + edge.id);
      const forward = edge.capacity === null ? null : edge.capacity - value;
      if (forward === null || forward > 0n) arcs.push({
        id: edge.id + ":forward", edgeId: edge.id, originId: edge.originId || null,
        source: edge.source, target: edge.target, direction: 1, capacity: forward,
        cost: edge.cost, kind: edge.kind, order: index * 2,
      });
      if (value > 0n) arcs.push({
        id: edge.id + ":reverse", edgeId: edge.id, originId: edge.originId || null,
        source: edge.target, target: edge.source, direction: -1, capacity: value,
        cost: -edge.cost, kind: edge.kind, order: index * 2 + 1,
      });
    });
    return arcs;
  }

  function applyResidualPath(flow, path, amount) {
    path.forEach(function (arc) { flow[arc.edgeId] = (flow[arc.edgeId] || 0n) + BigInt(arc.direction) * amount; });
  }

  function bfsPath(vertices, edges, flow, source, target) {
    const arcs = residualArcs(edges, flow);
    const outgoing = Object.create(null);
    vertices.forEach(function (id) { outgoing[id] = []; });
    arcs.forEach(function (arc) { outgoing[arc.source].push(arc); });
    const queue = [source];
    const seen = new Set([source]);
    const parent = Object.create(null);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor];
      if (id === target) break;
      outgoing[id].forEach(function (arc) {
        if (seen.has(arc.target)) return;
        seen.add(arc.target); parent[arc.target] = arc; queue.push(arc.target);
      });
    }
    if (!seen.has(target)) return null;
    const path = [];
    let current = target;
    while (current !== source) { const arc = parent[current]; path.push(arc); current = arc.source; }
    path.reverse();
    return path;
  }

  function bottleneck(path, limit) {
    let value = limit === undefined ? null : limit;
    path.forEach(function (arc) {
      if (arc.capacity !== null && (value === null || arc.capacity < value)) value = arc.capacity;
    });
    return value;
  }

  function fullFlow(network, variableFlow) {
    const result = Object.create(null);
    network.edges.forEach(function (edge) { result[edge.id] = BigInt(edge.lower) + (variableFlow["orig:" + edge.id] || variableFlow[edge.id] || 0n); });
    return result;
  }

  function netBalances(network, flow) {
    const result = zeroMap(network.nodes.map(function (node) { return node.id; }));
    network.edges.forEach(function (edge) {
      const value = flow[edge.id] || 0n;
      result[edge.source] -= value;
      result[edge.target] += value;
    });
    return result;
  }

  function totalCost(network, rawFlow) {
    let value = 0n;
    network.edges.forEach(function (edge) { value += BigInt(rawFlow[edge.id] || 0) * BigInt(edge.cost); });
    return value;
  }

  function serializeMap(map) {
    const result = Object.create(null);
    Object.keys(map).forEach(function (id) { result[id] = map[id].toString(); });
    return result;
  }

  function serializeArcs(arcs, potentials) {
    return arcs.map(function (arc) {
      const reduced = potentials ? arc.cost + potentials[arc.source] - potentials[arc.target] : null;
      return {
        id: arc.id, edgeId: arc.edgeId, originId: arc.originId,
        source: arc.source, target: arc.target, direction: arc.direction,
        capacity: arc.capacity === null ? null : arc.capacity.toString(),
        cost: arc.cost.toString(), reducedCost: reduced === null ? null : reduced.toString(), kind: arc.kind,
      };
    });
  }

  function makeFrame(stage, message, shifted, edges, flow, extra) {
    const original = fullFlow(shifted.network, flow);
    const data = extra || {};
    return Object.assign({
      stage: stage, message: message,
      flow: serializeMap(original),
      balances: serializeMap(netBalances(shifted.network, original)),
      adjustedBalances: serializeMap(shifted.adjusted),
      auxiliaryEdges: edges.filter(function (edge) { return edge.kind !== "original"; }).map(function (edge) {
        return { id: edge.id, source: edge.source, target: edge.target, capacity: edge.capacity.toString(), flow: (flow[edge.id] || 0n).toString(), kind: edge.kind };
      }),
      residual: serializeArcs(residualArcs(edges, flow), data.rawPotentials || null),
      totalCost: totalCost(shifted.network, original).toString(),
      pathArcIds: [], potentials: null, reducedCostsValid: null,
      feasible: null, unbounded: false, finished: false,
    }, data.public || {});
  }

  function validateFlow(rawNetwork, rawFlow) {
    const network = normalizeNetwork(rawNetwork);
    const flow = Object.create(null);
    network.edges.forEach(function (edge) {
      const value = parseInteger(rawFlow && rawFlow[edge.id] !== undefined ? rawFlow[edge.id] : 0, "Поток " + edge.id, false);
      if (value < BigInt(edge.lower) || (edge.upper !== null && value > BigInt(edge.upper))) throw new RangeError("Поток нарушает границы " + edge.id);
      flow[edge.id] = value;
    });
    const actual = netBalances(network, flow);
    const violations = network.nodes.filter(function (node) { return actual[node.id] !== BigInt(node.balance); }).map(function (node) { return node.id; });
    return shared.deepFreeze({ valid: violations.length === 0, violations: violations, balances: serializeMap(actual), cost: totalCost(network, flow).toString() });
  }

  function buildFeasibleTrace(rawNetwork) {
    const shifted = lowerShift(rawNetwork);
    const edges = auxiliaryEdges(shifted);
    const vertices = shifted.network.nodes.map(function (node) { return node.id; }).concat([AUX_SOURCE, AUX_SINK]);
    const flow = zeroMap(edges.map(function (edge) { return edge.id; }));
    const frames = [makeFrame("lower-shift", "Нижние границы вычтены; вычислены скорректированные балансы", shifted, edges, flow)];
    if (!shifted.balanced) {
      frames.push(makeFrame("infeasible", "Суммарный спрос не равен суммарному предложению", shifted, edges, flow, { public: { feasible: false, finished: true } }));
      return shared.deepFreeze({ mode: "feasible", network: shifted.network, shifted: serializeMap(shifted.adjusted), frames: frames, feasible: false, unbounded: false, flow: null, cost: null });
    }
    let sent = 0n;
    for (let count = 0; count < MAX_AUGMENTATIONS && sent < shifted.totalDemand; count += 1) {
      const path = bfsPath(vertices, edges, flow, AUX_SOURCE, AUX_SINK);
      if (!path) break;
      const amount = bottleneck(path, shifted.totalDemand - sent);
      if (amount === null || amount <= 0n) throw new Error("Некорректная пропускная способность дополняющего пути");
      applyResidualPath(flow, path, amount); sent += amount;
      frames.push(makeFrame("augment", "Дополняющий путь переносит " + amount + " единиц; всего " + sent + " из " + shifted.totalDemand, shifted, edges, flow, {
        public: { pathArcIds: path.map(function (arc) { return arc.id; }), sent: sent.toString(), required: shifted.totalDemand.toString() },
      }));
    }
    const feasible = sent === shifted.totalDemand;
    const finalFlow = feasible ? fullFlow(shifted.network, flow) : null;
    frames.push(makeFrame(feasible ? "feasible" : "infeasible", feasible ? "Все вспомогательные дуги насыщены; исходная циркуляция восстановлена" : "Вспомогательная сеть не может доставить весь требуемый поток", shifted, edges, flow, {
      public: { feasible: feasible, finished: true, sent: sent.toString(), required: shifted.totalDemand.toString() },
    }));
    if (feasible) {
      const check = validateFlow(shifted.network, serializeMap(finalFlow));
      if (!check.valid) throw new Error("Восстановленная циркуляция нарушает баланс");
    }
    return shared.deepFreeze({
      mode: "feasible", network: shifted.network, shifted: serializeMap(shifted.adjusted), frames: frames,
      feasible: feasible, unbounded: false, flow: finalFlow ? serializeMap(finalFlow) : null,
      cost: finalFlow ? totalCost(shifted.network, finalFlow).toString() : null,
    });
  }

  function negativeCycle(vertices, edges, flow) {
    const arcs = residualArcs(edges, flow).filter(function (arc) { return arc.kind === "original"; });
    if (!vertices.length || !arcs.length) return null;
    const distance = zeroMap(vertices);
    const parent = Object.create(null);
    let changed = null;
    for (let pass = 0; pass < vertices.length; pass += 1) {
      changed = null;
      arcs.forEach(function (arc) {
        const candidate = distance[arc.source] + arc.cost;
        if (candidate < distance[arc.target]) { distance[arc.target] = candidate; parent[arc.target] = arc; changed = arc.target; }
      });
      if (changed === null) return null;
    }
    let inside = changed;
    for (let count = 0; count < vertices.length; count += 1) inside = parent[inside].source;
    const cycle = [];
    let current = inside;
    do {
      const arc = parent[current];
      if (!arc || cycle.length > edges.length * 2 + 2) throw new Error("Не удалось восстановить отрицательный цикл");
      cycle.push(arc); current = arc.source;
    } while (current !== inside);
    const cost = cycle.reduce(function (sum, arc) { return sum + arc.cost; }, 0n);
    if (cost >= 0n) throw new Error("Восстановленный цикл не является отрицательным");
    return { arcs: cycle, cost: cost, capacity: bottleneck(cycle) };
  }

  function globalPotentials(vertices, edges, flow) {
    const arcs = residualArcs(edges, flow);
    const potential = zeroMap(vertices);
    for (let pass = 1; pass < vertices.length; pass += 1) {
      let changed = false;
      arcs.forEach(function (arc) {
        const candidate = potential[arc.source] + arc.cost;
        if (candidate < potential[arc.target]) { potential[arc.target] = candidate; changed = true; }
      });
      if (!changed) break;
    }
    arcs.forEach(function (arc) {
      if (potential[arc.source] + arc.cost < potential[arc.target]) throw new Error("Остаточная сеть всё ещё содержит отрицательный цикл");
    });
    return potential;
  }

  function dijkstraReduced(vertices, edges, flow, source, target, potential) {
    const arcs = residualArcs(edges, flow);
    const outgoing = Object.create(null);
    const distance = Object.create(null);
    const parent = Object.create(null);
    vertices.forEach(function (id) { outgoing[id] = []; distance[id] = null; });
    arcs.forEach(function (arc) {
      const reduced = arc.cost + potential[arc.source] - potential[arc.target];
      if (reduced < 0n) throw new Error("Отрицательная приведённая стоимость запрещает Дейкстру");
      outgoing[arc.source].push(Object.assign({}, arc, { reducedCost: reduced }));
    });
    const settled = new Set(); distance[source] = 0n;
    while (settled.size < vertices.length) {
      let current = null;
      vertices.forEach(function (id) {
        if (settled.has(id) || distance[id] === null) return;
        if (current === null || distance[id] < distance[current] || (distance[id] === distance[current] && id < current)) current = id;
      });
      if (current === null) break;
      settled.add(current);
      if (current === target) break;
      outgoing[current].forEach(function (arc) {
        const candidate = distance[current] + arc.reducedCost;
        if (distance[arc.target] === null || candidate < distance[arc.target]) { distance[arc.target] = candidate; parent[arc.target] = arc; }
      });
    }
    if (distance[target] === null) return { path: null, distance: distance, settled: Array.from(settled) };
    const path = []; let current = target;
    while (current !== source) { const arc = parent[current]; path.push(arc); current = arc.source; }
    path.reverse();
    return { path: path, distance: distance, settled: Array.from(settled) };
  }

  function buildMinCostTrace(rawNetwork) {
    const shifted = lowerShift(rawNetwork);
    const originalEdges = auxiliaryEdges(shifted).filter(function (edge) { return edge.kind === "original"; });
    const originalVertices = shifted.network.nodes.map(function (node) { return node.id; });
    const flow = zeroMap(originalEdges.map(function (edge) { return edge.id; }));
    const frames = [makeFrame("lower-shift", "Нижние границы зафиксированы; начинается оптимизация остаточной сети", shifted, originalEdges, flow)];
    if (!shifted.balanced) {
      frames.push(makeFrame("infeasible", "Суммарный спрос не равен суммарному предложению", shifted, originalEdges, flow, { public: { feasible: false, finished: true } }));
      return shared.deepFreeze({ mode: "min-cost", network: shifted.network, frames: frames, feasible: false, unbounded: false, flow: null, cost: null });
    }
    const feasibilityWitness = buildFeasibleTrace(shifted.network);
    if (!feasibilityWitness.feasible) {
      const witnessFrame = feasibilityWitness.frames[feasibilityWitness.frames.length - 1];
      frames.push(makeFrame("infeasible", "Даже без учёта стоимости вспомогательная сеть не удовлетворяет все балансы", shifted, originalEdges, flow, {
        public: { feasible: false, finished: true, sent: witnessFrame.sent, required: witnessFrame.required },
      }));
      return shared.deepFreeze({ mode: "min-cost", network: shifted.network, frames: frames, feasible: false, unbounded: false, flow: null, cost: null });
    }
    for (let count = 0; count < MAX_AUGMENTATIONS; count += 1) {
      const cycle = negativeCycle(originalVertices, originalEdges, flow);
      if (!cycle) break;
      if (cycle.capacity === null) {
        frames.push(makeFrame("unbounded", "Отрицательный цикл имеет неограниченную остаточную ёмкость; стоимость не ограничена снизу", shifted, originalEdges, flow, {
          public: { pathArcIds: cycle.arcs.map(function (arc) { return arc.id; }), cycleCost: cycle.cost.toString(), unbounded: true, finished: true },
        }));
        return shared.deepFreeze({ mode: "min-cost", network: shifted.network, frames: frames, feasible: true, unbounded: true, flow: null, cost: null });
      }
      applyResidualPath(flow, cycle.arcs, cycle.capacity);
      frames.push(makeFrame("cycle-cancel", "Отрицательный цикл стоимости " + cycle.cost + " насыщен на " + cycle.capacity, shifted, originalEdges, flow, {
        public: { pathArcIds: cycle.arcs.map(function (arc) { return arc.id; }), cycleCost: cycle.cost.toString(), amount: cycle.capacity.toString() },
      }));
      if (count === MAX_AUGMENTATIONS - 1) throw new RangeError("Превышен безопасный предел сокращений циклов");
    }

    const edges = auxiliaryEdges(shifted);
    edges.forEach(function (edge) { if (flow[edge.id] === undefined) flow[edge.id] = 0n; });
    const vertices = originalVertices.concat([AUX_SOURCE, AUX_SINK]);
    let potential = globalPotentials(vertices, edges, flow);
    frames.push(makeFrame("potentials", "Потенциалы делают все остаточные приведённые стоимости неотрицательными", shifted, edges, flow, {
      rawPotentials: potential,
      public: { potentials: serializeMap(potential), reducedCostsValid: true },
    }));
    let sent = 0n;
    for (let count = 0; count < MAX_AUGMENTATIONS && sent < shifted.totalDemand; count += 1) {
      const result = dijkstraReduced(vertices, edges, flow, AUX_SOURCE, AUX_SINK, potential);
      if (!result.path) break;
      const amount = bottleneck(result.path, shifted.totalDemand - sent);
      if (amount === null || amount <= 0n) throw new Error("Некорректное дополнение минимальной стоимости");
      applyResidualPath(flow, result.path, amount); sent += amount;
      Object.keys(result.distance).forEach(function (id) { if (result.distance[id] !== null) potential[id] += result.distance[id]; });
      frames.push(makeFrame("shortest-augment", "Кратчайший остаточный путь переносит " + amount + " единиц; доставлено " + sent + " из " + shifted.totalDemand, shifted, edges, flow, {
        rawPotentials: potential,
        public: {
          pathArcIds: result.path.map(function (arc) { return arc.id; }), amount: amount.toString(),
          sent: sent.toString(), required: shifted.totalDemand.toString(),
          potentials: serializeMap(potential), reducedCostsValid: true, settledVertexIds: result.settled,
        },
      }));
    }
    const feasible = sent === shifted.totalDemand;
    const finalFlow = feasible ? fullFlow(shifted.network, flow) : null;
    frames.push(makeFrame(feasible ? "optimal" : "infeasible", feasible ? "Требуемый поток доставлен; неотрицательные приведённые стоимости подтверждают оптимальность" : "В остаточной сети нет пути, способного удовлетворить все балансы", shifted, edges, flow, {
      rawPotentials: potential,
      public: { feasible: feasible, finished: true, sent: sent.toString(), required: shifted.totalDemand.toString(), potentials: serializeMap(potential), reducedCostsValid: true },
    }));
    if (feasible && !validateFlow(shifted.network, serializeMap(finalFlow)).valid) throw new Error("Поток минимальной стоимости нарушает баланс");
    return shared.deepFreeze({
      mode: "min-cost", network: shifted.network, shifted: serializeMap(shifted.adjusted), frames: frames,
      feasible: feasible, unbounded: false, flow: finalFlow ? serializeMap(finalFlow) : null,
      cost: finalFlow ? totalCost(shifted.network, finalFlow).toString() : null,
      potentials: serializeMap(potential),
    });
  }

  function buildTrace(rawNetwork, rawOptions) {
    const mode = modeName(rawOptions && rawOptions.mode);
    return mode === "feasible" ? buildFeasibleTrace(rawNetwork) : buildMinCostTrace(rawNetwork);
  }

  function createState(rawNetwork, rawOptions) {
    const trace = buildTrace(rawNetwork, rawOptions);
    return shared.deepFreeze({ trace: trace, playback: shared.createPlayback(trace.frames) });
  }

  function step(state) {
    if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние циркуляции");
    if (state.playback.finished) return state;
    return shared.deepFreeze({ trace: state.trace, playback: shared.playbackStep(state.playback) });
  }

  function seek(state, cursor) {
    if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние циркуляции");
    return shared.deepFreeze({ trace: state.trace, playback: shared.playbackSeek(state.playback, cursor) });
  }

  function visualModel(state) {
    if (!state || !state.playback || !state.playback.current) throw new TypeError("Некорректная визуальная модель циркуляции");
    return shared.deepFreeze({
      mode: state.trace.mode, network: state.trace.network, frame: state.playback.current,
      cursor: state.playback.cursor, frameCount: state.playback.frames.length,
      finished: state.playback.finished,
    });
  }

  return Object.freeze({
    MODES: MODES, PRESETS: PRESETS, MAX_NODES: MAX_NODES, MAX_EDGES: MAX_EDGES,
    parseInteger: parseInteger, normalizeNetwork: normalizeNetwork, preset: preset,
    lowerShift: lowerShift, auxiliaryEdges: auxiliaryEdges, residualArcs: residualArcs,
    validateFlow: validateFlow, totalCost: totalCost,
    buildFeasibleTrace: buildFeasibleTrace, buildMinCostTrace: buildMinCostTrace,
    buildTrace: buildTrace, createState: createState, step: step, seek: seek, visualModel: visualModel,
  });
});
