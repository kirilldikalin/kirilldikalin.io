(function (root, factory) {
  "use strict";
  const graphCore = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(graphCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DynamicGraphAlgorithmsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (graphCore) {
  "use strict";

  if (!graphCore) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 20;
  const MAX_OPERATIONS = 80;
  const PRESETS = Object.freeze({
    replacement: {
      vertices: "A, B, C, D, E",
      operations: "+ e1 A B\n+ e2 B C\n+ e3 C D\n+ e4 A D\n? A C\n- e2\n? B C\n+ e5 D E\n? A E",
    },
    parallel: {
      vertices: "A, B, C",
      operations: "+ e1 A B\n+ e2 A B\n+ e3 B C\n? A C\n- e1\n? A C\n- e2\n? A C",
    },
    adversarial: {
      vertices: "A, B, C, D, E, F",
      operations: "+ e1 A B\n+ e2 B C\n+ e3 C D\n+ e4 D E\n+ e5 E F\n+ x1 A C\n+ x2 D F\n+ x3 A F\n? A F\n- e3\n? B E\n+ e6 C D\n- x3\n- e6\n? A F",
    },
    disconnected: {
      vertices: "A, B, C, D",
      operations: "+ e1 A B\n+ e2 C D\n? A D\n+ e3 B C\n? A D\n- e3\n? B C",
    },
    loop: {
      vertices: "A, B",
      operations: "+ loop A A\n? A B\n+ e1 A B\n? A B\n- loop\n? A A",
    },
    singleton: { vertices: "v", operations: "? v v" },
    empty: { vertices: "", operations: "" },
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function parseVertices(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];
    const seen = new Set();
    const nodes = text.split(/[\n,;]+/).map(function (part) {
      const id = graphCore.normalizeId(part.trim(), "Вершина");
      if (seen.has(id)) throw new RangeError("Вершина " + id + " указана дважды.");
      seen.add(id);
      return { id: id, label: id, partition: null };
    });
    if (nodes.length > MAX_NODES) throw new RangeError("Допустимо не более " + MAX_NODES + " вершин.");
    return nodes;
  }

  function parseTimeline(rawVertices, rawOperations) {
    const nodes = parseVertices(rawVertices);
    const ids = new Set(nodes.map(function (node) { return node.id; }));
    const lines = String(rawOperations || "").split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (lines.length > MAX_OPERATIONS) throw new RangeError("Допустимо не более " + MAX_OPERATIONS + " операций.");
    const knownEdges = new Map();
    const active = new Set();
    const operations = lines.map(function (line, index) {
      const parts = line.split(/\s+/);
      const symbol = parts[0];
      if (symbol === "+") {
        if (parts.length !== 4) throw new RangeError("Добавление записывается как «+ id u v»: строка " + (index + 1) + ".");
        const edgeId = graphCore.normalizeId(parts[1], "ID ребра");
        const source = graphCore.normalizeId(parts[2], "Начало ребра");
        const target = graphCore.normalizeId(parts[3], "Конец ребра");
        if (!ids.has(source) || !ids.has(target)) throw new RangeError("Строка " + (index + 1) + " ссылается на неизвестную вершину.");
        if (knownEdges.has(edgeId)) throw new RangeError("ID ребра " + edgeId + " уже использован; для повторного добавления нужен новый ID.");
        knownEdges.set(edgeId, { id: edgeId, source: source, target: target, directed: false });
        active.add(edgeId);
        return { index: index, type: "add", edgeId: edgeId, source: source, target: target, label: "+ " + edgeId + " " + source + " " + target };
      }
      if (symbol === "-") {
        if (parts.length !== 2) throw new RangeError("Удаление записывается как «- id»: строка " + (index + 1) + ".");
        const edgeId = graphCore.normalizeId(parts[1], "ID ребра");
        if (!knownEdges.has(edgeId)) throw new RangeError("Нельзя удалить ещё не добавленное ребро " + edgeId + ".");
        if (!active.has(edgeId)) throw new RangeError("Ребро " + edgeId + " уже удалено.");
        active.delete(edgeId);
        const edge = knownEdges.get(edgeId);
        return { index: index, type: "remove", edgeId: edgeId, source: edge.source, target: edge.target, label: "- " + edgeId };
      }
      if (symbol === "?") {
        if (parts.length !== 3) throw new RangeError("Запрос записывается как «? u v»: строка " + (index + 1) + ".");
        const source = graphCore.normalizeId(parts[1], "Первая вершина запроса");
        const target = graphCore.normalizeId(parts[2], "Вторая вершина запроса");
        if (!ids.has(source) || !ids.has(target)) throw new RangeError("Строка " + (index + 1) + " ссылается на неизвестную вершину.");
        return { index: index, type: "query", source: source, target: target, label: "? " + source + " " + target };
      }
      throw new RangeError("Неизвестная операция в строке " + (index + 1) + ". Используйте +, - или ?.");
    });
    return graphCore.deepFreeze({ nodes: nodes, operations: operations, edges: Array.from(knownEdges.values()) });
  }

  function timelineFromPreset(name) {
    const preset = PRESETS[name];
    if (!preset) throw new RangeError("Неизвестный пример временной шкалы.");
    return parseTimeline(preset.vertices, preset.operations);
  }

  function timelineText(timeline) {
    return {
      vertices: timeline.nodes.map(function (node) { return node.id; }).join(", "),
      operations: timeline.operations.map(function (operation) { return operation.label; }).join("\n"),
    };
  }

  function activeGraph(nodes, activeEdges) {
    return { nodes: nodes.map(function (node) { return clone(node); }), edges: Array.from(activeEdges.values()).map(function (edge) { return clone(edge); }) };
  }

  function connectivity(nodes, edges, source, target) {
    if (source === target) return { connected: true, inspectedEdges: 0, visitedVertexIds: [source] };
    const queue = [source];
    const visited = new Set([source]);
    let inspected = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const edge of edges.values()) {
        inspected += 1;
        let next = null;
        if (edge.source === current) next = edge.target;
        else if (edge.target === current) next = edge.source;
        if (next === null || visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
        if (next === target) return { connected: true, inspectedEdges: inspected, visitedVertexIds: Array.from(visited) };
      }
    }
    return { connected: false, inspectedEdges: inspected, visitedVertexIds: Array.from(visited) };
  }

  function components(nodes, edges) {
    const componentById = Object.create(null);
    const groups = [];
    nodes.forEach(function (node) {
      if (Object.prototype.hasOwnProperty.call(componentById, node.id)) return;
      const group = connectivity(nodes, edges, node.id, "\u0000").visitedVertexIds;
      const index = groups.length;
      group.forEach(function (id) { componentById[id] = index; });
      groups.push(group);
    });
    return { componentById: componentById, groups: groups };
  }

  function forestEdgeMap(activeEdges, forestIds) {
    const map = new Map();
    forestIds.forEach(function (id) { if (activeEdges.has(id)) map.set(id, activeEdges.get(id)); });
    return map;
  }

  function partitionsAgree(nodes, activeEdges, forestIds) {
    const full = components(nodes, activeEdges).componentById;
    const forest = components(nodes, forestEdgeMap(activeEdges, forestIds)).componentById;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = 0; j < nodes.length; j += 1) {
        if ((full[nodes[i].id] === full[nodes[j].id]) !== (forest[nodes[i].id] === forest[nodes[j].id])) return false;
      }
    }
    return true;
  }

  function fullRebuildWork(nodes, activeEdges) {
    let work = 0;
    const seen = new Set();
    nodes.forEach(function (node) {
      if (seen.has(node.id)) return;
      const result = connectivity(nodes, activeEdges, node.id, "\u0000");
      result.visitedVertexIds.forEach(function (id) { seen.add(id); });
      work += result.inspectedEdges + result.visitedVertexIds.length;
    });
    return work;
  }

  function makeFrame(values) {
    return Object.assign({
      operationIndex: -1, operation: null, phase: "start", message: "",
      activeEdges: [], forestEdgeIds: [], nonTreeEdgeIds: [], activeEdgeId: null,
      replacementCandidateIds: [], promotedEdgeId: null, groups: [],
      baselineResult: null, dynamicResult: null, baselineWork: 0, dynamicWork: 0,
      cumulativeBaselineWork: 0, cumulativeDynamicWork: 0, invariantHolds: true,
    }, clone(values));
  }

  function simulate(timeline) {
    const active = new Map();
    const edgeById = new Map(timeline.edges.map(function (edge) { return [edge.id, edge]; }));
    const forest = new Set();
    let cumulativeBaseline = 0;
    let cumulativeDynamic = 0;
    const frames = [makeFrame({ phase: "start", message: timeline.nodes.length ? "Граф пуст; начинаем обрабатывать временную шкалу." : "Нет вершин и операций: обе стратегии уже завершены.", groups: timeline.nodes.map(function (node) { return [node.id]; }) })];

    timeline.operations.forEach(function (operation) {
      let baselineResult = null;
      let dynamicResult = null;
      let baselineWork = 0;
      let dynamicWork = 0;
      let activeEdgeId = null;
      let promotedEdgeId = null;
      const candidates = [];
      let phase = operation.type;
      let message = "";
      if (operation.type === "add") {
        const edge = edgeById.get(operation.edgeId);
        const beforeForest = forestEdgeMap(active, forest);
        const connectedBefore = connectivity(timeline.nodes, beforeForest, edge.source, edge.target);
        dynamicWork += connectedBefore.inspectedEdges + 1;
        active.set(edge.id, edge);
        activeEdgeId = edge.id;
        if (edge.source !== edge.target && !connectedBefore.connected) {
          forest.add(edge.id);
          message = "Ребро " + edge.id + " связывает разные деревья и входит в остовный лес.";
        } else {
          message = edge.source === edge.target
            ? "Петля " + edge.id + " не влияет на связность и остаётся вне леса."
            : "Концы " + edge.id + " уже связаны; сохраняем ребро как резервное.";
        }
        baselineWork = fullRebuildWork(timeline.nodes, active);
      } else if (operation.type === "remove") {
        const removed = active.get(operation.edgeId);
        active.delete(operation.edgeId);
        activeEdgeId = operation.edgeId;
        if (!forest.has(operation.edgeId)) {
          dynamicWork = 1;
          message = "Удалено резервное ребро " + operation.edgeId + "; остовный лес не меняется.";
        } else {
          forest.delete(operation.edgeId);
          const cutForest = forestEdgeMap(active, forest);
          const side = connectivity(timeline.nodes, cutForest, removed.source, "\u0000");
          const sideIds = new Set(side.visitedVertexIds);
          dynamicWork += side.inspectedEdges + 1;
          const nonTree = Array.from(active.values()).filter(function (edge) { return !forest.has(edge.id); }).sort(function (a, b) { return a.id.localeCompare(b.id, "en", { numeric: true }); });
          for (const edge of nonTree) {
            candidates.push(edge.id);
            dynamicWork += 1;
            if (edge.source !== edge.target && sideIds.has(edge.source) !== sideIds.has(edge.target)) {
              forest.add(edge.id); promotedEdgeId = edge.id; break;
            }
          }
          phase = "remove-tree";
          message = promotedEdgeId
            ? "Удалено древесное ребро " + operation.edgeId + "; резерв " + promotedEdgeId + " пересекает разрез и повышен до древесного."
            : "Удалено древесное ребро " + operation.edgeId + "; пересекающей разрез замены нет, компонента распалась.";
        }
        baselineWork = fullRebuildWork(timeline.nodes, active);
      } else {
        const fullAnswer = connectivity(timeline.nodes, active, operation.source, operation.target);
        const forestAnswer = connectivity(timeline.nodes, forestEdgeMap(active, forest), operation.source, operation.target);
        baselineResult = fullAnswer.connected;
        dynamicResult = forestAnswer.connected;
        baselineWork = fullAnswer.inspectedEdges + 1;
        dynamicWork = forestAnswer.inspectedEdges + 1;
        message = "Запрос " + operation.source + " ↔ " + operation.target + ": " + (dynamicResult ? "связаны" : "не связаны") + ". Оба метода дали одинаковый ответ.";
      }
      cumulativeBaseline += baselineWork;
      cumulativeDynamic += dynamicWork;
      const forestMap = forestEdgeMap(active, forest);
      const grouping = components(timeline.nodes, forestMap).groups;
      const invariant = partitionsAgree(timeline.nodes, active, forest) && (operation.type !== "query" || baselineResult === dynamicResult);
      frames.push(makeFrame({
        operationIndex: operation.index, operation: operation, phase: phase, message: message,
        activeEdges: Array.from(active.values()), forestEdgeIds: Array.from(forest),
        nonTreeEdgeIds: Array.from(active.keys()).filter(function (id) { return !forest.has(id); }),
        activeEdgeId: activeEdgeId, replacementCandidateIds: candidates,
        promotedEdgeId: promotedEdgeId, groups: grouping,
        baselineResult: baselineResult, dynamicResult: dynamicResult,
        baselineWork: baselineWork, dynamicWork: dynamicWork,
        cumulativeBaselineWork: cumulativeBaseline, cumulativeDynamicWork: cumulativeDynamic,
        invariantHolds: invariant,
      }));
      if (!invariant) throw new Error("Остовный лес потерял компонентный инвариант на операции " + (operation.index + 1) + ".");
    });
    return frames;
  }

  function createState(options) {
    const timeline = options && options.timeline ? options.timeline : timelineFromPreset("replacement");
    const frames = simulate(timeline);
    const playback = graphCore.createPlayback(frames, { maxFrames: MAX_OPERATIONS + 1 });
    return graphCore.deepFreeze(Object.assign({}, playback, { timeline: timeline }));
  }

  function withPlayback(state, playback) { return graphCore.deepFreeze(Object.assign({}, state, playback)); }
  function step(state) { return withPlayback(state, graphCore.playbackStep(state)); }
  function seek(state, cursor) { return withPlayback(state, graphCore.playbackSeek(state, cursor)); }
  function reset(state) { return withPlayback(state, graphCore.playbackReset(state)); }

  function solveDeletionOnlyReverse(rawNodes, rawEdges, operations) {
    const nodes = rawNodes.map(function (node) { return typeof node === "string" ? { id: node, label: node } : node; });
    if (!nodes.length) return [];
    const edgeById = new Map(rawEdges.map(function (edge) { return [edge.id, edge]; }));
    const deleted = new Set(operations.filter(function (operation) { return operation.type === "remove"; }).map(function (operation) { return operation.edgeId; }));
    const dsu = new graphCore.DisjointSet(nodes.map(function (node) { return node.id; }));
    rawEdges.forEach(function (edge) { if (!deleted.has(edge.id) && edge.source !== edge.target) dsu.union(edge.source, edge.target); });
    const answers = new Array(operations.length).fill(null);
    for (let i = operations.length - 1; i >= 0; i -= 1) {
      const operation = operations[i];
      if (operation.type === "query") answers[i] = dsu.connected(operation.source, operation.target);
      else if (operation.type === "remove") {
        const edge = edgeById.get(operation.edgeId);
        if (!edge) throw new RangeError("Неизвестное удаляемое ребро " + operation.edgeId + ".");
        if (edge.source !== edge.target) dsu.union(edge.source, edge.target);
      } else throw new RangeError("Обратное время поддерживает только удаления и запросы.");
    }
    return answers;
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES, MAX_OPERATIONS: MAX_OPERATIONS, PRESETS: PRESETS,
    parseTimeline: parseTimeline, timelineFromPreset: timelineFromPreset, timelineText: timelineText,
    connectivity: connectivity, components: components, partitionsAgree: partitionsAgree,
    simulate: simulate, solveDeletionOnlyReverse: solveDeletionOnlyReverse,
    createState: createState, step: step, seek: seek, reset: reset,
    isFinished: function (state) { return Boolean(state && state.finished); },
  });
});
