(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SingleSourceShortestPathsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) {
    throw new Error("AtlasGraphLabCore is unavailable");
  }

  const MODES = Object.freeze(["bfs", "dag", "dijkstra", "bellman-ford"]);
  const MAX_NODES = 18;
  const MAX_EDGES = 72;
  const MAX_WEIGHT_DIGITS = 40;
  const MAX_FRAMES = 4096;

  const PRESETS = shared.deepFreeze({
    nonnegative: {
      label: "Неотрицательные веса",
      source: "s",
      directed: true,
      vertices: ["s", "a", "b", "c", "t"],
      edges: [
        ["s", "a", "10"], ["s", "b", "3"], ["b", "a", "2"],
        ["a", "c", "2"], ["b", "c", "8"], ["b", "t", "12"],
        ["c", "t", "1"],
      ],
    },
    dag: {
      label: "DAG с отрицательным ребром",
      source: "s",
      directed: true,
      vertices: ["s", "a", "b", "c", "t", "z"],
      edges: [
        ["s", "a", "2"], ["s", "b", "7"], ["a", "b", "-4"],
        ["a", "c", "5"], ["b", "c", "2"], ["b", "t", "6"],
        ["c", "t", "1"], ["z", "t", "-20"],
      ],
    },
    unit: {
      label: "Единичные веса",
      source: "s",
      directed: true,
      vertices: ["s", "a", "b", "c", "d", "t"],
      edges: [
        ["s", "a", "1"], ["s", "b", "1"], ["a", "c", "1"],
        ["b", "c", "1"], ["b", "d", "1"], ["c", "t", "1"],
        ["d", "t", "1"],
      ],
    },
    negativeEdge: {
      label: "Контрпример для Дейкстры",
      source: "s",
      directed: true,
      vertices: ["s", "a", "b", "t"],
      edges: [
        ["s", "a", "2"], ["s", "b", "5"], ["b", "a", "-6"],
        ["a", "t", "2"], ["b", "t", "4"],
      ],
    },
    negativeCycle: {
      label: "Достижимый отрицательный цикл",
      source: "s",
      directed: true,
      vertices: ["s", "a", "b", "c", "t"],
      edges: [
        ["s", "a", "1"], ["a", "b", "2"], ["b", "c", "-5"],
        ["c", "a", "1"], ["c", "t", "3"],
      ],
    },
    unreachable: {
      label: "Недостижимая компонента",
      source: "s",
      directed: true,
      vertices: ["s", "a", "t", "x", "y"],
      edges: [
        ["s", "a", "4"], ["a", "t", "3"], ["x", "y", "-2"],
        ["y", "x", "-2"],
      ],
    },
  });

  function modeName(rawMode) {
    const mode = String(rawMode || "").trim().toLowerCase();
    if (!MODES.includes(mode)) {
      throw new RangeError("Режим должен быть bfs, dag, dijkstra или bellman-ford.");
    }
    return mode;
  }

  function parseWeight(rawWeight, label) {
    if (typeof rawWeight === "number") {
      if (!Number.isSafeInteger(rawWeight)) {
        throw new RangeError((label || "Вес") + ": число должно быть безопасным целым; большие веса вводите строкой.");
      }
      return BigInt(rawWeight);
    }
    if (typeof rawWeight !== "string") {
      throw new TypeError((label || "Вес") + ": требуется целое число.");
    }
    const text = rawWeight.trim();
    if (!/^[+-]?\d+$/.test(text)) {
      throw new RangeError((label || "Вес") + ": требуется целое число без десятичной точки.");
    }
    const digits = text.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
    if (digits.length > MAX_WEIGHT_DIGITS) {
      throw new RangeError((label || "Вес") + ": не больше " + MAX_WEIGHT_DIGITS + " цифр.");
    }
    return BigInt(text);
  }

  function normalizeGraph(rawGraph) {
    const base = shared.normalizeGraph(rawGraph, {
      maxNodes: MAX_NODES,
      maxEdges: MAX_EDGES,
    });
    const edges = base.edges.map(function (edge, index) {
      const weight = parseWeight(
        edge.weight === null || edge.weight === "" ? "1" : edge.weight,
        "Вес ребра " + edge.id
      );
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        directed: edge.directed,
        label: weight.toString(),
        weight: weight.toString(),
        key: edge.key,
      };
    });
    return shared.deepFreeze({
      id: base.id || "sssp-graph",
      label: base.label || "Граф кратчайших путей",
      directed: base.directed,
      nodes: base.nodes.map(function (node) {
        return { id: node.id, label: node.label, layer: node.layer, partition: node.partition };
      }),
      edges: edges,
    });
  }

  function graphFromPreset(rawPreset) {
    const id = String(rawPreset || "nonnegative");
    const preset = PRESETS[id];
    if (!preset) throw new RangeError("Неизвестный сценарий: " + id + ".");
    return normalizeGraph({
      id: id,
      label: preset.label,
      directed: preset.directed,
      nodes: preset.vertices.map(function (vertex) { return { id: vertex, label: vertex }; }),
      edges: preset.edges.map(function (edge, index) {
        return {
          id: "e" + String(index + 1),
          source: edge[0],
          target: edge[1],
          weight: edge[2],
          directed: preset.directed,
        };
      }),
    });
  }

  function parseGraphText(rawVertices, rawEdges, directed) {
    const vertexTokens = String(rawVertices || "")
      .split(/[\s,;]+/)
      .map(function (token) { return token.trim(); })
      .filter(Boolean);
    if (vertexTokens.length > MAX_NODES) {
      throw new RangeError("Допустимо не больше " + MAX_NODES + " вершин.");
    }
    const nodes = vertexTokens.map(function (id) { return { id: id, label: id }; });
    const lines = String(rawEdges || "")
      .split(/[;\n]+/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
    if (lines.length > MAX_EDGES) {
      throw new RangeError("Допустимо не больше " + MAX_EDGES + " рёбер.");
    }
    const edges = lines.map(function (line, index) {
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length !== 3) {
        throw new RangeError("Ребро " + String(index + 1) + ": формат «начало конец вес».");
      }
      return {
        id: "e" + String(index + 1),
        source: parts[0],
        target: parts[1],
        weight: parseWeight(parts[2], "Вес ребра " + String(index + 1)).toString(),
        directed: Boolean(directed),
      };
    });
    return normalizeGraph({ directed: Boolean(directed), nodes: nodes, edges: edges });
  }

  function graphText(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    return shared.deepFreeze({
      vertices: graph.nodes.map(function (node) { return node.id; }).join(", "),
      edges: graph.edges.map(function (edge) {
        return edge.source + " " + edge.target + " " + edge.weight;
      }).join("; "),
    });
  }

  function arcsFor(graph) {
    const arcs = [];
    graph.edges.forEach(function (edge, index) {
      arcs.push({
        id: edge.id + ":f",
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        weight: BigInt(edge.weight),
        order: index * 2,
      });
      if (!edge.directed && edge.source !== edge.target) {
        arcs.push({
          id: edge.id + ":r",
          edgeId: edge.id,
          source: edge.target,
          target: edge.source,
          weight: BigInt(edge.weight),
          order: index * 2 + 1,
        });
      }
    });
    return arcs;
  }

  function adjacencyFor(graph) {
    const adjacency = Object.create(null);
    graph.nodes.forEach(function (node) { adjacency[node.id] = []; });
    arcsFor(graph).forEach(function (arc) { adjacency[arc.source].push(arc); });
    Object.keys(adjacency).forEach(function (id) {
      adjacency[id].sort(function (left, right) {
        return left.target.localeCompare(right.target) ||
          left.edgeId.localeCompare(right.edgeId) || left.order - right.order;
      });
    });
    return adjacency;
  }

  function topologicalOrder(graph) {
    if (graph.edges.some(function (edge) { return !edge.directed; })) return null;
    const indegree = Object.create(null);
    const outgoing = adjacencyFor(graph);
    graph.nodes.forEach(function (node) { indegree[node.id] = 0; });
    graph.edges.forEach(function (edge) { indegree[edge.target] += 1; });
    const ready = graph.nodes.map(function (node) { return node.id; })
      .filter(function (id) { return indegree[id] === 0; })
      .sort();
    const order = [];
    while (ready.length) {
      const id = ready.shift();
      order.push(id);
      outgoing[id].forEach(function (arc) {
        indegree[arc.target] -= 1;
        if (indegree[arc.target] === 0) {
          ready.push(arc.target);
          ready.sort();
        }
      });
    }
    return order.length === graph.nodes.length ? order : null;
  }

  function validateMode(rawGraph, rawSource, rawMode) {
    const graph = normalizeGraph(rawGraph);
    const mode = modeName(rawMode);
    const source = String(rawSource || "").trim();
    if (graph.nodes.length === 0) {
      return shared.deepFreeze({ accepted: false, reason: "Граф пуст: источник выбрать невозможно.", order: null });
    }
    if (!graph.nodes.some(function (node) { return node.id === source; })) {
      return shared.deepFreeze({ accepted: false, reason: "Источник «" + source + "» отсутствует в графе.", order: null });
    }
    if (mode === "bfs" && graph.edges.some(function (edge) { return edge.weight !== "1"; })) {
      return shared.deepFreeze({
        accepted: false,
        reason: "BFS принимает этот запуск только при весе 1 у каждого ребра.",
        order: null,
      });
    }
    if (mode === "dag") {
      if (graph.edges.some(function (edge) { return !edge.directed; })) {
        return shared.deepFreeze({ accepted: false, reason: "Режим DAG требует ориентированный граф.", order: null });
      }
      const order = topologicalOrder(graph);
      if (!order) {
        return shared.deepFreeze({ accepted: false, reason: "Режим DAG отклонён: найден ориентированный цикл.", order: null });
      }
      return shared.deepFreeze({ accepted: true, reason: "Граф ацикличен; топологический порядок найден.", order: order });
    }
    if (mode === "dijkstra" && graph.edges.some(function (edge) { return BigInt(edge.weight) < 0n; })) {
      return shared.deepFreeze({
        accepted: false,
        reason: "Дейкстра отклонён: хотя бы одно ребро имеет отрицательный вес.",
        order: null,
      });
    }
    return shared.deepFreeze({
      accepted: true,
      reason: mode === "bellman-ford"
        ? "Bellman–Ford допускает отрицательные рёбра и отдельно проверит достижимый отрицательный цикл."
        : mode === "bfs"
          ? "Все рёбра имеют единичный вес; BFS применим."
          : "Все веса неотрицательны; условие Дейкстры выполнено.",
      order: null,
    });
  }

  function initialMaps(graph, source) {
    const distances = Object.create(null);
    const predecessors = Object.create(null);
    graph.nodes.forEach(function (node) {
      distances[node.id] = null;
      predecessors[node.id] = null;
    });
    distances[source] = 0n;
    return { distances: distances, predecessors: predecessors };
  }

  function distanceSnapshot(graph, distances) {
    const result = Object.create(null);
    graph.nodes.forEach(function (node) {
      const value = distances[node.id];
      result[node.id] = value === null ? null : value.toString();
    });
    return result;
  }

  function predecessorSnapshot(graph, predecessors) {
    const result = Object.create(null);
    graph.nodes.forEach(function (node) {
      const value = predecessors[node.id];
      result[node.id] = value === null ? null : {
        vertex: value.vertex,
        edgeId: value.edgeId,
      };
    });
    return result;
  }

  function frame(graph, maps, details) {
    return Object.assign({
      phase: "inspect",
      message: "",
      activeVertexId: null,
      activeEdgeId: null,
      activeArcId: null,
      frontier: [],
      settled: [],
      iteration: 0,
      relaxation: null,
      negativeCycle: null,
      negativeCycleEdgeIds: [],
      distances: distanceSnapshot(graph, maps.distances),
      predecessors: predecessorSnapshot(graph, maps.predecessors),
    }, details || {});
  }

  function relaxationDetail(arc, previous, candidate, changed, note) {
    return {
      source: arc.source,
      target: arc.target,
      edgeId: arc.edgeId,
      weight: arc.weight.toString(),
      previous: previous === null ? null : previous.toString(),
      candidate: candidate === null ? null : candidate.toString(),
      changed: Boolean(changed),
      note: note,
    };
  }

  function startFrame(graph, maps, validation, frontier) {
    return frame(graph, maps, {
      phase: "start",
      frontier: frontier || [],
      message: validation.reason,
    });
  }

  function buildBfs(graph, source, validation) {
    const maps = initialMaps(graph, source);
    const adjacency = adjacencyFor(graph);
    const queue = [source];
    const processed = [];
    const frames = [startFrame(graph, maps, validation, queue.slice())];
    while (queue.length) {
      const current = queue.shift();
      frames.push(frame(graph, maps, {
        phase: "extract",
        activeVertexId: current,
        frontier: queue.slice(),
        settled: processed.slice(),
        message: "Из очереди извлечена вершина " + current + ".",
      }));
      adjacency[current].forEach(function (arc) {
        const previous = maps.distances[arc.target];
        const candidate = maps.distances[current] + 1n;
        const changed = previous === null;
        if (changed) {
          maps.distances[arc.target] = candidate;
          maps.predecessors[arc.target] = { vertex: current, edgeId: arc.edgeId };
          queue.push(arc.target);
        }
        frames.push(frame(graph, maps, {
          phase: "relax",
          activeVertexId: current,
          activeEdgeId: arc.edgeId,
          activeArcId: arc.id,
          frontier: queue.slice(),
          settled: processed.slice(),
          relaxation: relaxationDetail(
            arc, previous, candidate, changed,
            changed ? "Вершина открыта впервые и добавлена в очередь." : "Вершина уже открыта; BFS не меняет её уровень."
          ),
          message: changed
            ? "Расстояние до " + arc.target + " стало " + candidate.toString() + "."
            : "Ребро не улучшает уже найденный уровень вершины " + arc.target + ".",
        }));
      });
      processed.push(current);
    }
    frames.push(frame(graph, maps, {
      phase: "finish",
      settled: processed.slice(),
      message: "Очередь пуста: расстояния в числе единичных рёбер окончательны.",
    }));
    return frames;
  }

  function buildDag(graph, source, validation) {
    const maps = initialMaps(graph, source);
    const adjacency = adjacencyFor(graph);
    const order = validation.order.slice();
    const processed = [];
    const frames = [startFrame(graph, maps, validation, order.slice())];
    order.forEach(function (current, orderIndex) {
      frames.push(frame(graph, maps, {
        phase: "extract",
        activeVertexId: current,
        frontier: order.slice(orderIndex + 1),
        settled: processed.slice(),
        iteration: orderIndex + 1,
        message: "Обрабатывается следующая вершина топологического порядка: " + current + ".",
      }));
      adjacency[current].forEach(function (arc) {
        const previous = maps.distances[arc.target];
        const candidate = maps.distances[current] === null
          ? null
          : maps.distances[current] + arc.weight;
        const changed = candidate !== null && (previous === null || candidate < previous);
        if (changed) {
          maps.distances[arc.target] = candidate;
          maps.predecessors[arc.target] = { vertex: current, edgeId: arc.edgeId };
        }
        frames.push(frame(graph, maps, {
          phase: "relax",
          activeVertexId: current,
          activeEdgeId: arc.edgeId,
          activeArcId: arc.id,
          frontier: order.slice(orderIndex + 1),
          settled: processed.slice(),
          iteration: orderIndex + 1,
          relaxation: relaxationDetail(
            arc, previous, candidate, changed,
            candidate === null
              ? "Начало ребра недостижимо; бесконечность не участвует в сложении."
              : changed ? "Кандидат улучшил верхнюю границу." : "Текущая верхняя граница не хуже кандидата."
          ),
          message: candidate === null
            ? "Релаксация пропущена: " + current + " недостижима из источника."
            : changed
              ? "Метка " + arc.target + " уменьшена до " + candidate.toString() + "."
              : "Метка " + arc.target + " не изменилась.",
        }));
      });
      processed.push(current);
    });
    frames.push(frame(graph, maps, {
      phase: "finish",
      settled: processed.slice(),
      iteration: order.length,
      message: "Все вершины обработаны один раз в топологическом порядке.",
    }));
    return frames;
  }

  function heapLess(left, right) {
    return left.key < right.key ||
      (left.key === right.key && (left.vertex < right.vertex ||
        (left.vertex === right.vertex && left.serial < right.serial)));
  }

  function heapPush(heap, entry) {
    heap.push(entry);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!heapLess(heap[index], heap[parent])) break;
      const temporary = heap[index];
      heap[index] = heap[parent];
      heap[parent] = temporary;
      index = parent;
    }
  }

  function heapPop(heap) {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heapLess(heap[left], heap[smallest])) smallest = left;
        if (right < heap.length && heapLess(heap[right], heap[smallest])) smallest = right;
        if (smallest === index) break;
        const temporary = heap[index];
        heap[index] = heap[smallest];
        heap[smallest] = temporary;
        index = smallest;
      }
    }
    return first;
  }

  function heapSnapshot(heap) {
    return heap.slice().sort(function (left, right) {
      return heapLess(left, right) ? -1 : heapLess(right, left) ? 1 : 0;
    }).map(function (entry) {
      return { vertex: entry.vertex, distance: entry.key.toString() };
    });
  }

  function buildDijkstra(graph, source, validation) {
    const maps = initialMaps(graph, source);
    const adjacency = adjacencyFor(graph);
    const heap = [];
    const settled = new Set();
    let serial = 0;
    heapPush(heap, { vertex: source, key: 0n, serial: serial });
    const frames = [startFrame(graph, maps, validation, heapSnapshot(heap))];
    while (heap.length) {
      const entry = heapPop(heap);
      const stale = settled.has(entry.vertex) || maps.distances[entry.vertex] !== entry.key;
      if (stale) {
        frames.push(frame(graph, maps, {
          phase: "stale",
          activeVertexId: entry.vertex,
          frontier: heapSnapshot(heap),
          settled: Array.from(settled),
          message: "Устаревшая запись " + entry.vertex + ":" + entry.key.toString() + " отброшена без decrease-key.",
        }));
        continue;
      }
      settled.add(entry.vertex);
      frames.push(frame(graph, maps, {
        phase: "extract",
        activeVertexId: entry.vertex,
        frontier: heapSnapshot(heap),
        settled: Array.from(settled),
        message: "Извлечён глобальный минимум " + entry.vertex + ":" + entry.key.toString() + "; метка стала окончательной.",
      }));
      adjacency[entry.vertex].forEach(function (arc) {
        const previous = maps.distances[arc.target];
        const candidate = entry.key + arc.weight;
        const changed = previous === null || candidate < previous;
        if (changed) {
          maps.distances[arc.target] = candidate;
          maps.predecessors[arc.target] = { vertex: entry.vertex, edgeId: arc.edgeId };
          serial += 1;
          heapPush(heap, { vertex: arc.target, key: candidate, serial: serial });
        }
        frames.push(frame(graph, maps, {
          phase: "relax",
          activeVertexId: entry.vertex,
          activeEdgeId: arc.edgeId,
          activeArcId: arc.id,
          frontier: heapSnapshot(heap),
          settled: Array.from(settled),
          relaxation: relaxationDetail(
            arc, previous, candidate, changed,
            changed
              ? "Новая пара добавлена в очередь; старая запись, если есть, останется до ленивого удаления."
              : "Кандидат не уменьшает верхнюю границу."
          ),
          message: changed
            ? "Метка " + arc.target + " уменьшена до " + candidate.toString() + "."
            : "Ребро не улучшает метку " + arc.target + ".",
        }));
      });
    }
    frames.push(frame(graph, maps, {
      phase: "finish",
      settled: Array.from(settled),
      message: "Очередь пуста: все достижимые вершины получили окончательные расстояния.",
    }));
    return frames;
  }

  function recoverNegativeCycle(graph, predecessors, start) {
    let vertex = start;
    for (let index = 0; index < graph.nodes.length; index += 1) {
      if (!predecessors[vertex]) return null;
      vertex = predecessors[vertex].vertex;
    }
    const backwardVertices = [vertex];
    const backwardEdges = [];
    let current = vertex;
    do {
      const predecessor = predecessors[current];
      if (!predecessor || backwardVertices.length > graph.nodes.length + 1) return null;
      backwardEdges.push(predecessor.edgeId);
      current = predecessor.vertex;
      backwardVertices.push(current);
    } while (current !== vertex);
    return {
      vertices: backwardVertices.slice().reverse(),
      edgeIds: backwardEdges.slice().reverse(),
    };
  }

  function buildBellmanFord(graph, source, validation) {
    let maps = initialMaps(graph, source);
    const arcs = arcsFor(graph);
    const frames = [startFrame(graph, maps, validation, [])];
    let completedPasses = 0;
    for (let pass = 1; pass <= Math.max(0, graph.nodes.length - 1); pass += 1) {
      const baseDistances = Object.assign(Object.create(null), maps.distances);
      const nextDistances = Object.assign(Object.create(null), maps.distances);
      const nextPredecessors = Object.assign(Object.create(null), maps.predecessors);
      let changedInPass = false;
      frames.push(frame(graph, maps, {
        phase: "pass-start",
        iteration: pass,
        message: "Проход " + pass + ": кандидаты строятся только из меток предыдущего слоя.",
      }));
      arcs.forEach(function (arc) {
        const previous = nextDistances[arc.target];
        const candidate = baseDistances[arc.source] === null
          ? null
          : baseDistances[arc.source] + arc.weight;
        const changed = candidate !== null && (previous === null || candidate < previous);
        if (changed) {
          nextDistances[arc.target] = candidate;
          nextPredecessors[arc.target] = { vertex: arc.source, edgeId: arc.edgeId };
          changedInPass = true;
        }
        const workingMaps = { distances: nextDistances, predecessors: nextPredecessors };
        frames.push(frame(graph, workingMaps, {
          phase: "relax",
          iteration: pass,
          activeVertexId: arc.source,
          activeEdgeId: arc.edgeId,
          activeArcId: arc.id,
          relaxation: relaxationDetail(
            arc, previous, candidate, changed,
            candidate === null
              ? "Начало ребра недостижимо на предыдущем слое; сложения с бесконечностью нет."
              : changed ? "Улучшен лучший путь не более чем из " + pass + " рёбер." : "Кандидат не улучшает текущий слой."
          ),
          message: candidate === null
            ? "Ребро пропущено: его начало пока недостижимо."
            : changed
              ? "На слое " + pass + " метка " + arc.target + " стала " + candidate.toString() + "."
              : "На слое " + pass + " метка " + arc.target + " не изменилась.",
        }));
      });
      maps = { distances: nextDistances, predecessors: nextPredecessors };
      completedPasses = pass;
      frames.push(frame(graph, maps, {
        phase: "pass-end",
        iteration: pass,
        message: changedInPass
          ? "Завершён слой путей не более чем из " + pass + " рёбер."
          : "Ни одна метка не изменилась; дальнейшие слои совпадут, можно остановиться.",
      }));
      if (!changedInPass) break;
    }

    let violation = null;
    arcs.some(function (arc) {
      if (maps.distances[arc.source] === null) return false;
      const candidate = maps.distances[arc.source] + arc.weight;
      if (maps.distances[arc.target] === null || candidate < maps.distances[arc.target]) {
        violation = { arc: arc, candidate: candidate, previous: maps.distances[arc.target] };
        return true;
      }
      return false;
    });
    if (violation) {
      maps.predecessors[violation.arc.target] = {
        vertex: violation.arc.source,
        edgeId: violation.arc.edgeId,
      };
      const cycle = recoverNegativeCycle(graph, maps.predecessors, violation.arc.target);
      frames.push(frame(graph, maps, {
        phase: "negative-cycle",
        iteration: completedPasses + 1,
        activeVertexId: violation.arc.source,
        activeEdgeId: violation.arc.edgeId,
        activeArcId: violation.arc.id,
        relaxation: relaxationDetail(
          violation.arc,
          violation.previous,
          violation.candidate,
          true,
          "После |V|−1 слоёв улучшение возможно только из-за достижимого отрицательного цикла."
        ),
        negativeCycle: cycle ? cycle.vertices : null,
        negativeCycleEdgeIds: cycle ? cycle.edgeIds : [violation.arc.edgeId],
        message: cycle
          ? "Обнаружен достижимый отрицательный цикл: " + cycle.vertices.join(" → ") + "."
          : "Обнаружено улучшение на дополнительном проходе; достижимый отрицательный цикл существует.",
      }));
      return frames;
    }
    frames.push(frame(graph, maps, {
      phase: "finish",
      iteration: completedPasses,
      message: "Дополнительный проход не улучшает метки: достижимого отрицательного цикла нет.",
    }));
    return frames;
  }

  function rejectedFrames(graph, source, validation) {
    const maps = initialMaps(graph, graph.nodes.some(function (node) { return node.id === source; })
      ? source
      : graph.nodes.length ? graph.nodes[0].id : "");
    return [frame(graph, maps, { phase: "reject", message: validation.reason })];
  }

  function wrapState(meta, playback) {
    return Object.freeze({
      mode: meta.mode,
      graph: meta.graph,
      source: meta.source,
      accepted: meta.accepted,
      reason: meta.reason,
      frames: playback.frames,
      cursor: playback.cursor,
      current: playback.current,
      atStart: playback.atStart,
      finished: playback.finished,
    });
  }

  function createState(options) {
    const settings = options || {};
    const mode = modeName(settings.mode || "dijkstra");
    const graph = settings.graph
      ? normalizeGraph(settings.graph)
      : graphFromPreset(settings.preset || "nonnegative");
    const fallbackSource = settings.preset && PRESETS[settings.preset]
      ? PRESETS[settings.preset].source
      : graph.nodes.length ? graph.nodes[0].id : "";
    const source = String(settings.source === undefined ? fallbackSource : settings.source).trim();
    const validation = validateMode(graph, source, mode);
    let frames;
    if (!validation.accepted) frames = rejectedFrames(graph, source, validation);
    else if (mode === "bfs") frames = buildBfs(graph, source, validation);
    else if (mode === "dag") frames = buildDag(graph, source, validation);
    else if (mode === "dijkstra") frames = buildDijkstra(graph, source, validation);
    else frames = buildBellmanFord(graph, source, validation);
    const playback = shared.createPlayback(frames, { maxFrames: MAX_FRAMES });
    return wrapState({
      mode: mode,
      graph: graph,
      source: source,
      accepted: validation.accepted,
      reason: validation.reason,
    }, playback);
  }

  function step(state) {
    return wrapState(state, shared.playbackStep(state));
  }

  function runToEnd(state) {
    let current = state;
    let steps = 0;
    while (!current.finished) {
      current = step(current);
      steps += 1;
      if (steps > MAX_FRAMES) throw new Error("Превышен предел кадров выполнения.");
    }
    return current;
  }

  function reconstructPath(state, rawTarget) {
    const target = String(rawTarget || "").trim();
    if (!state.graph.nodes.some(function (node) { return node.id === target; })) {
      throw new RangeError("Неизвестная вершина: " + target + ".");
    }
    const frameState = state.current;
    if (frameState.distances[target] === null || frameState.phase === "negative-cycle") return null;
    const path = [];
    const seen = new Set();
    let current = target;
    while (current !== state.source) {
      if (seen.has(current) || path.length > state.graph.nodes.length) return null;
      seen.add(current);
      path.push(current);
      const predecessor = frameState.predecessors[current];
      if (!predecessor) return null;
      current = predecessor.vertex;
    }
    path.push(state.source);
    return path.reverse();
  }

  return Object.freeze({
    MODES: MODES,
    PRESETS: PRESETS,
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_WEIGHT_DIGITS: MAX_WEIGHT_DIGITS,
    parseWeight: parseWeight,
    normalizeGraph: normalizeGraph,
    graphFromPreset: graphFromPreset,
    parseGraphText: parseGraphText,
    graphText: graphText,
    topologicalOrder: topologicalOrder,
    validateMode: validateMode,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
    reconstructPath: reconstructPath,
  });
});
