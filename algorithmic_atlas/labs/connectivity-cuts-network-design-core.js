(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ConnectivityCutsNetworkDesignCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MODES = Object.freeze(["low-link", "bridges", "articulation", "s-t-cut", "global-cut"]);
  const MAX_NODES = 14;
  const MAX_EDGES = 42;
  const MAX_CAPACITY_DIGITS = 36;
  const MAX_FRAMES = 4096;

  const PRESETS = shared.deepFreeze({
    blocks: {
      label: "Три блока и два шарнира",
      vertices: ["a", "b", "c", "d", "e", "f", "g"],
      edges: [
        ["a", "b", "1"], ["b", "c", "1"], ["c", "a", "1"],
        ["c", "d", "2"], ["d", "e", "1"], ["e", "f", "1"],
        ["f", "d", "1"], ["d", "g", "3"],
      ],
      source: "a", sink: "g",
    },
    parallel: {
      label: "Параллельные рёбра и петля",
      vertices: ["a", "b", "c", "d"],
      edges: [
        ["a", "b", "2"], ["a", "b", "5"], ["b", "c", "1"],
        ["c", "d", "4"], ["d", "b", "3"], ["c", "c", "9"],
      ],
      source: "a", sink: "d",
    },
    disconnected: {
      label: "Несвязный граф",
      vertices: ["a", "b", "c", "x", "y", "z"],
      edges: [["a", "b", "2"], ["b", "c", "2"], ["c", "a", "2"], ["x", "y", "1"]],
      source: "a", sink: "z",
    },
    equalCuts: {
      label: "Несколько равных разрезов",
      vertices: ["a", "b", "c", "d"],
      edges: [["a", "b", "1"], ["b", "c", "1"], ["c", "d", "1"], ["d", "a", "1"]],
      source: "a", sink: "c",
    },
    weighted: {
      label: "Взвешенная резервированная сеть",
      vertices: ["s", "a", "b", "c", "d", "t", "z"],
      edges: [
        ["s", "a", "7"], ["s", "b", "6"], ["a", "b", "2"],
        ["a", "c", "5"], ["b", "d", "5"], ["c", "d", "3"],
        ["c", "t", "6"], ["d", "t", "7"], ["a", "z", "1"],
      ],
      source: "s", sink: "t",
    },
    singleton: {
      label: "Одна вершина с петлёй",
      vertices: ["a"],
      edges: [["a", "a", "12"]],
      source: "a", sink: "a",
    },
  });

  function modeName(raw) {
    const mode = String(raw || "low-link").trim().toLowerCase();
    if (!MODES.includes(mode)) throw new RangeError("Неизвестный режим анализа связности.");
    return mode;
  }

  function parseCapacity(raw, label) {
    if (raw === undefined || raw === null || raw === "") return 1n;
    if (typeof raw === "number") {
      if (!Number.isSafeInteger(raw)) {
        throw new RangeError((label || "Ёмкость") + ": большие целые вводите строкой.");
      }
      raw = String(raw);
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!/^\+?\d+$/.test(text)) {
      throw new RangeError((label || "Ёмкость") + ": требуется неотрицательное целое.");
    }
    const normalized = text.replace(/^\+/, "");
    if (normalized.replace(/^0+(?=\d)/, "").length > MAX_CAPACITY_DIGITS) {
      throw new RangeError((label || "Ёмкость") + ": не больше " + MAX_CAPACITY_DIGITS + " цифр.");
    }
    return BigInt(normalized);
  }

  function normalizeGraph(rawGraph) {
    const raw = rawGraph || {};
    const prepared = Array.isArray(raw.edges) ? raw.edges.map(function (edge) {
      const copy = Object.assign({}, edge);
      if (copy.capacity !== undefined) copy.weight = copy.capacity;
      return copy;
    }) : raw.edges;
    const base = shared.normalizeGraph({
      id: raw.id || "connectivity-graph",
      label: raw.label || "Неориентированный граф",
      directed: false,
      nodes: raw.nodes || [],
      edges: prepared || [],
    }, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
    const edges = base.edges.map(function (edge) {
      const capacity = parseCapacity(edge.weight, "Ёмкость ребра " + edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        directed: false,
        capacity: capacity.toString(),
        weight: capacity.toString(),
      };
    });
    return shared.deepFreeze({
      id: base.id,
      label: base.label,
      directed: false,
      nodes: base.nodes.map(function (node) {
        return { id: node.id, label: node.label, layer: node.layer, partition: node.partition };
      }),
      edges: edges,
    });
  }

  function graphFromPreset(rawPreset) {
    const id = String(rawPreset || "blocks");
    const preset = PRESETS[id];
    if (!preset) throw new RangeError("Неизвестный сценарий: " + id + ".");
    return normalizeGraph({
      id: id,
      label: preset.label,
      nodes: preset.vertices.map(function (vertex) { return { id: vertex, label: vertex }; }),
      edges: preset.edges.map(function (edge, index) {
        return { id: "e" + String(index + 1), source: edge[0], target: edge[1], capacity: edge[2] };
      }),
    });
  }

  function graphText(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    return shared.deepFreeze({
      vertices: graph.nodes.map(function (node) { return node.id; }).join(", "),
      edges: graph.edges.map(function (edge) {
        return edge.source + " " + edge.target + " " + edge.capacity;
      }).join("; "),
    });
  }

  function parseGraphText(rawVertices, rawEdges) {
    const vertices = String(rawVertices || "").split(/[\s,;]+/)
      .map(function (item) { return item.trim(); }).filter(Boolean);
    if (vertices.length > MAX_NODES) throw new RangeError("Допустимо не больше " + MAX_NODES + " вершин.");
    const lines = String(rawEdges || "").split(/[;\n]+/)
      .map(function (item) { return item.trim(); }).filter(Boolean);
    if (lines.length > MAX_EDGES) throw new RangeError("Допустимо не больше " + MAX_EDGES + " рёбер.");
    return normalizeGraph({
      nodes: vertices.map(function (id) { return { id: id, label: id }; }),
      edges: lines.map(function (line, index) {
        const parts = line.split(/[\s,]+/).filter(Boolean);
        if (parts.length !== 2 && parts.length !== 3) {
          throw new RangeError("Ребро " + String(index + 1) + ": формат «вершина вершина [ёмкость]».");
        }
        return {
          id: "e" + String(index + 1),
          source: parts[0],
          target: parts[1],
          capacity: parseCapacity(parts.length === 3 ? parts[2] : "1", "Ёмкость ребра " + String(index + 1)).toString(),
        };
      }),
    });
  }

  function idSet(rawValues) {
    if (rawValues instanceof Set) return new Set(Array.from(rawValues, String));
    return new Set(Array.isArray(rawValues) ? rawValues.map(String) : []);
  }

  function effectiveGraph(rawGraph, rawRemovedVertices, rawRemovedEdges) {
    const graph = normalizeGraph(rawGraph);
    const removedVertices = idSet(rawRemovedVertices);
    const removedEdges = idSet(rawRemovedEdges);
    const knownVertices = new Set(graph.nodes.map(function (node) { return node.id; }));
    const knownEdges = new Set(graph.edges.map(function (edge) { return edge.id; }));
    removedVertices.forEach(function (id) {
      if (!knownVertices.has(id)) throw new RangeError("Удаляемая вершина " + id + " отсутствует.");
    });
    removedEdges.forEach(function (id) {
      if (!knownEdges.has(id)) throw new RangeError("Удаляемое ребро " + id + " отсутствует.");
    });
    return normalizeGraph({
      id: graph.id + "-effective",
      label: graph.label,
      nodes: graph.nodes.filter(function (node) { return !removedVertices.has(node.id); }),
      edges: graph.edges.filter(function (edge) {
        return !removedEdges.has(edge.id) &&
          !removedVertices.has(edge.source) &&
          !removedVertices.has(edge.target);
      }),
    });
  }

  function adjacency(graph) {
    const result = new Map();
    graph.nodes.forEach(function (node) { result.set(node.id, []); });
    graph.edges.forEach(function (edge, order) {
      if (edge.source === edge.target) {
        result.get(edge.source).push({ edgeId: edge.id, from: edge.source, to: edge.target, loop: true, order: order * 2 });
        return;
      }
      result.get(edge.source).push({ edgeId: edge.id, from: edge.source, to: edge.target, loop: false, order: order * 2 });
      result.get(edge.target).push({ edgeId: edge.id, from: edge.target, to: edge.source, loop: false, order: order * 2 + 1 });
    });
    return result;
  }

  function connectedComponents(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const adj = adjacency(graph);
    const seen = new Set();
    const components = [];
    graph.nodes.forEach(function (node) {
      if (seen.has(node.id)) return;
      const queue = [node.id];
      const component = [];
      seen.add(node.id);
      for (let index = 0; index < queue.length; index += 1) {
        const vertex = queue[index];
        component.push(vertex);
        (adj.get(vertex) || []).forEach(function (arc) {
          if (!seen.has(arc.to)) {
            seen.add(arc.to);
            queue.push(arc.to);
          }
        });
      }
      components.push(component.sort());
    });
    return components;
  }

  function copyMap(map, nodes) {
    const result = {};
    nodes.forEach(function (node) {
      result[node.id] = map[node.id] === undefined ? null : map[node.id];
    });
    return result;
  }

  function lowLinkAnalysis(rawGraph, recordFrames) {
    const graph = normalizeGraph(rawGraph);
    const adj = adjacency(graph);
    const discovery = {};
    const low = {};
    const parent = {};
    const bridges = [];
    const articulations = new Set();
    const edgeStack = [];
    const biconnected = [];
    const frames = [];
    let timer = 0;

    function snapshot(phase, message, activeVertexId, activeEdgeId) {
      if (!recordFrames) return;
      frames.push(shared.deepFreeze({
        phase: phase,
        message: message,
        activeVertexId: activeVertexId || null,
        activeEdgeId: activeEdgeId || null,
        discovery: copyMap(discovery, graph.nodes),
        low: copyMap(low, graph.nodes),
        parent: copyMap(parent, graph.nodes),
        bridges: bridges.slice().sort(),
        articulations: Array.from(articulations).sort(),
        biconnected: biconnected.map(function (block) { return block.slice(); }),
        edgeStack: edgeStack.slice(),
      }));
    }

    function popBlock(stopEdgeId) {
      const block = [];
      while (edgeStack.length) {
        const id = edgeStack.pop();
        block.push(id);
        if (id === stopEdgeId) break;
      }
      if (block.length) biconnected.push(block.sort());
    }

    function visit(vertex, parentEdgeId, root) {
      timer += 1;
      discovery[vertex] = timer;
      low[vertex] = timer;
      parent[vertex] = root ? null : parent[vertex];
      let childCount = 0;
      snapshot("enter", "Открыта вершина " + vertex + ": tin = low = " + String(timer) + ".", vertex, parentEdgeId);
      const arcs = adj.get(vertex) || [];
      for (let index = 0; index < arcs.length; index += 1) {
        const arc = arcs[index];
        if (arc.loop) {
          snapshot("loop", "Петля " + arc.edgeId + " не соединяет разные вершины и не меняет low-link.", vertex, arc.edgeId);
          continue;
        }
        if (arc.edgeId === parentEdgeId) continue;
        if (discovery[arc.to] === undefined) {
          childCount += 1;
          parent[arc.to] = vertex;
          edgeStack.push(arc.edgeId);
          snapshot("tree-edge", "Ребро " + arc.edgeId + " открывает ребёнка " + arc.to + ".", vertex, arc.edgeId);
          visit(arc.to, arc.edgeId, false);
          low[vertex] = Math.min(low[vertex], low[arc.to]);
          if (low[arc.to] > discovery[vertex]) bridges.push(arc.edgeId);
          if (!root && low[arc.to] >= discovery[vertex]) articulations.add(vertex);
          if (low[arc.to] >= discovery[vertex]) popBlock(arc.edgeId);
          snapshot(
            "return",
            "Возврат из " + arc.to + ": low[" + vertex + "] = min(low[" + vertex + "], low[" + arc.to + "]).",
            vertex,
            arc.edgeId
          );
        } else if (discovery[arc.to] < discovery[vertex]) {
          edgeStack.push(arc.edgeId);
          low[vertex] = Math.min(low[vertex], discovery[arc.to]);
          snapshot(
            "back-edge",
            "Обратное ребро к предку " + arc.to + " уменьшает low[" + vertex + "] до " + String(low[vertex]) + ".",
            vertex,
            arc.edgeId
          );
        }
      }
      if (root && childCount > 1) articulations.add(vertex);
      snapshot("exit", "Обход поддерева " + vertex + " завершён.", vertex, parentEdgeId);
    }

    snapshot("start", graph.nodes.length ? "Начинаем DFS-лес." : "Пустой граф не содержит компонент.", null, null);
    graph.nodes.forEach(function (node) {
      if (discovery[node.id] !== undefined) return;
      parent[node.id] = null;
      visit(node.id, null, true);
      if (edgeStack.length) popBlock(edgeStack[0]);
    });
    const result = shared.deepFreeze({
      discovery: copyMap(discovery, graph.nodes),
      low: copyMap(low, graph.nodes),
      parent: copyMap(parent, graph.nodes),
      bridges: bridges.slice().sort(),
      articulations: Array.from(articulations).sort(),
      biconnected: biconnected.map(function (block) { return block.slice(); }),
      components: connectedComponents(graph),
    });
    snapshot(
      "finish",
      "DFS-лес завершён: мостов — " + String(result.bridges.length) +
        ", точек сочленения — " + String(result.articulations.length) + ".",
      null,
      null
    );
    return { result: result, frames: frames };
  }

  function bridgeAndArticulationReference(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const baseCount = connectedComponents(graph).length;
    const bridges = graph.edges.filter(function (edge) {
      if (edge.source === edge.target) return false;
      return connectedComponents(effectiveGraph(graph, [], [edge.id])).length > baseCount;
    }).map(function (edge) { return edge.id; }).sort();
    const articulations = graph.nodes.filter(function (node) {
      const reduced = effectiveGraph(graph, [node.id], []);
      if (graph.nodes.length <= 1) return false;
      return connectedComponents(reduced).length > baseCount;
    }).map(function (node) { return node.id; }).sort();
    return { bridges: bridges, articulations: articulations };
  }

  function cutCapacity(rawGraph, rawSourceSide) {
    const graph = normalizeGraph(rawGraph);
    const sourceSide = idSet(rawSourceSide);
    let capacity = 0n;
    const cutEdgeIds = [];
    graph.edges.forEach(function (edge) {
      if (edge.source === edge.target) return;
      if (sourceSide.has(edge.source) !== sourceSide.has(edge.target)) {
        capacity += BigInt(edge.capacity);
        cutEdgeIds.push(edge.id);
      }
    });
    return { capacity: capacity, cutEdgeIds: cutEdgeIds.sort() };
  }

  function enumerateCuts(rawGraph, rawSource, rawSink, globalMode, onImprovement) {
    const graph = normalizeGraph(rawGraph);
    if (graph.nodes.length < 2) return null;
    const ids = graph.nodes.map(function (node) { return node.id; });
    const source = globalMode ? ids[0] : String(rawSource || "");
    const sink = globalMode ? null : String(rawSink || "");
    if (!ids.includes(source)) throw new RangeError("Источник разреза отсутствует в графе.");
    if (!globalMode && (!ids.includes(sink) || source === sink)) {
      throw new RangeError("Для s–t-разреза нужны две разные существующие вершины.");
    }
    const variable = ids.filter(function (id) { return id !== source && id !== sink; });
    let best = null;
    let evaluated = 0;
    const totalMasks = 2 ** variable.length;
    for (let mask = 0; mask < totalMasks; mask += 1) {
      const sourceSide = new Set([source]);
      variable.forEach(function (id, index) {
        if (mask & (2 ** index)) sourceSide.add(id);
      });
      if (globalMode && sourceSide.size === ids.length) continue;
      const cut = cutCapacity(graph, sourceSide);
      evaluated += 1;
      if (best === null || cut.capacity < best.capacity) {
        best = {
          capacity: cut.capacity,
          sourceSide: Array.from(sourceSide).sort(),
          sinkSide: ids.filter(function (id) { return !sourceSide.has(id); }).sort(),
          cutEdgeIds: cut.cutEdgeIds,
          evaluated: evaluated,
        };
        if (onImprovement) onImprovement(best);
      }
    }
    if (best) best.evaluated = evaluated;
    return best;
  }

  function minimumSTCut(graph, source, sink) {
    return enumerateCuts(graph, source, sink, false, null);
  }

  function globalMinimumCut(graph) {
    return enumerateCuts(graph, null, null, true, null);
  }

  function unitGraph(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    return normalizeGraph({
      nodes: graph.nodes,
      edges: graph.edges.map(function (edge) {
        return { id: edge.id, source: edge.source, target: edge.target, capacity: edge.source === edge.target ? "0" : "1" };
      }),
    });
  }

  function edgeConnectivity(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    if (graph.nodes.length < 2) return 0n;
    if (connectedComponents(graph).length !== 1) return 0n;
    return globalMinimumCut(unitGraph(graph)).capacity;
  }

  function vertexConnectivity(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const n = graph.nodes.length;
    if (n < 2 || connectedComponents(graph).length !== 1) return 0;
    const ids = graph.nodes.map(function (node) { return node.id; });
    for (let size = 1; size <= n - 1; size += 1) {
      const limit = 2 ** n;
      for (let mask = 0; mask < limit; mask += 1) {
        let bits = 0;
        for (let x = mask; x; x &= x - 1) bits += 1;
        if (bits !== size) continue;
        const removed = ids.filter(function (_, index) { return mask & (2 ** index); });
        const remaining = effectiveGraph(graph, removed, []);
        if (remaining.nodes.length <= 1 || connectedComponents(remaining).length > 1) return size;
      }
    }
    return n - 1;
  }

  function cutFrame(graph, cut, phase, message) {
    return shared.deepFreeze({
      phase: phase,
      message: message,
      activeVertexId: null,
      activeEdgeId: null,
      discovery: Object.fromEntries(graph.nodes.map(function (node) { return [node.id, null]; })),
      low: Object.fromEntries(graph.nodes.map(function (node) { return [node.id, null]; })),
      parent: Object.fromEntries(graph.nodes.map(function (node) { return [node.id, null]; })),
      bridges: [],
      articulations: [],
      biconnected: [],
      edgeStack: [],
      cut: cut ? {
        capacity: cut.capacity.toString(),
        sourceSide: cut.sourceSide.slice(),
        sinkSide: cut.sinkSide.slice(),
        cutEdgeIds: cut.cutEdgeIds.slice(),
        evaluated: cut.evaluated,
      } : null,
    });
  }

  function cutFrames(graph, source, sink, globalMode) {
    const frames = [cutFrame(graph, null, "start", globalMode
      ? "Перебираем непустые разбиения, зафиксировав первую вершину на стороне S."
      : "Перебираем разбиения, где источник лежит в S, а сток — в T.")];
    const best = enumerateCuts(graph, source, sink, globalMode, function (candidate) {
      if (frames.length >= MAX_FRAMES - 1) return;
      frames.push(cutFrame(
        graph,
        candidate,
        "candidate",
        "Новая лучшая граница: ёмкость " + candidate.capacity.toString() + "."
      ));
    });
    frames.push(cutFrame(
      graph,
      best,
      "finish",
      best
        ? "Полный ограниченный перебор завершён. Минимальная ёмкость равна " + best.capacity.toString() + "."
        : "Для графа менее чем с двумя вершинами глобальный разрез не определён."
    ));
    return frames;
  }

  function decorateFrame(frame, graph, baseComponents, mode) {
    const result = Object.assign({}, frame, {
      components: connectedComponents(graph),
      baseComponentCount: baseComponents,
      mode: mode,
    });
    return shared.deepFreeze(result);
  }

  function wrapState(meta, playback) {
    return Object.freeze({
      mode: meta.mode,
      baseGraph: meta.baseGraph,
      graph: meta.graph,
      source: meta.source,
      sink: meta.sink,
      removedVertices: meta.removedVertices,
      removedEdges: meta.removedEdges,
      analysis: meta.analysis,
      frames: playback.frames,
      cursor: playback.cursor,
      current: playback.current,
      atStart: playback.atStart,
      finished: playback.finished,
    });
  }

  function createState(options) {
    const settings = options || {};
    const mode = modeName(settings.mode);
    const presetId = settings.preset || "blocks";
    const baseGraph = settings.graph ? normalizeGraph(settings.graph) : graphFromPreset(presetId);
    const removedVertices = Array.from(idSet(settings.removedVertices)).sort();
    const removedEdges = Array.from(idSet(settings.removedEdges)).sort();
    const graph = effectiveGraph(baseGraph, removedVertices, removedEdges);
    const preset = PRESETS[presetId] || {};
    const fallbackSource = preset.source || (graph.nodes[0] && graph.nodes[0].id) || "";
    const fallbackSink = preset.sink || (graph.nodes[graph.nodes.length - 1] && graph.nodes[graph.nodes.length - 1].id) || "";
    const source = String(settings.source === undefined ? fallbackSource : settings.source);
    const sink = String(settings.sink === undefined ? fallbackSink : settings.sink);
    if ((mode === "s-t-cut") && (!graph.nodes.some(function (node) { return node.id === source; }) ||
      !graph.nodes.some(function (node) { return node.id === sink; }) || source === sink)) {
      throw new RangeError("В режиме s–t нужны две разные неудалённые вершины.");
    }
    let analysis = null;
    let rawFrames;
    if (mode === "s-t-cut") rawFrames = cutFrames(graph, source, sink, false);
    else if (mode === "global-cut") rawFrames = cutFrames(graph, source, sink, true);
    else {
      const traced = lowLinkAnalysis(graph, true);
      analysis = traced.result;
      rawFrames = traced.frames;
    }
    const baseCount = connectedComponents(baseGraph).length;
    const frames = rawFrames.map(function (frame) {
      return decorateFrame(frame, graph, baseCount, mode);
    });
    return wrapState({
      mode: mode,
      baseGraph: baseGraph,
      graph: graph,
      source: source,
      sink: sink,
      removedVertices: removedVertices,
      removedEdges: removedEdges,
      analysis: analysis,
    }, shared.createPlayback(frames, { maxFrames: MAX_FRAMES }));
  }

  function step(state) {
    return wrapState(state, shared.playbackStep(state));
  }

  function runToEnd(state) {
    let result = state;
    let guard = 0;
    while (!result.finished) {
      result = step(result);
      guard += 1;
      if (guard > MAX_FRAMES) throw new Error("Превышен безопасный предел кадров.");
    }
    return result;
  }

  return Object.freeze({
    MODES: MODES,
    PRESETS: PRESETS,
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_CAPACITY_DIGITS: MAX_CAPACITY_DIGITS,
    parseCapacity: parseCapacity,
    normalizeGraph: normalizeGraph,
    graphFromPreset: graphFromPreset,
    graphText: graphText,
    parseGraphText: parseGraphText,
    effectiveGraph: effectiveGraph,
    connectedComponents: connectedComponents,
    lowLinkAnalysis: lowLinkAnalysis,
    bridgeAndArticulationReference: bridgeAndArticulationReference,
    cutCapacity: cutCapacity,
    minimumSTCut: minimumSTCut,
    globalMinimumCut: globalMinimumCut,
    edgeConnectivity: edgeConnectivity,
    vertexConnectivity: vertexConnectivity,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
  });
});
