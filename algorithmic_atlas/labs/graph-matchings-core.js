(function (root, factory) {
  "use strict";
  const graphCore = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(graphCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GraphMatchingsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (graphCore) {
  "use strict";

  if (!graphCore) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 18;
  const MAX_EDGES = 72;
  const MODES = Object.freeze(["bipartite", "blossom"]);
  const PRESETS = Object.freeze({
    augmenting: {
      mode: "bipartite",
      vertices: "A:L, B:L, 1:R, 2:R",
      edges: "A 1\nA 2\nB 1",
    },
    multiple: {
      mode: "bipartite",
      vertices: "A:L, B:L, 1:R, 2:R",
      edges: "A 1\nA 2\nB 1\nB 2",
    },
    deficient: {
      mode: "bipartite",
      vertices: "A:L, B:L, C:L, 1:R, 2:R, 3:R",
      edges: "A 1\nB 1\nC 1\nC 2",
    },
    parallel: {
      mode: "bipartite",
      vertices: "A:L, B:L, 1:R, 2:R",
      edges: "A 1\nA 1\nA 2\nB 1\nB 2",
    },
    empty: { mode: "bipartite", vertices: "", edges: "" },
    singleton: { mode: "blossom", vertices: "v", edges: "" },
    blossom: {
      mode: "blossom",
      vertices: "a, b, c, d, e, x",
      edges: "a b\nb c\nc d\nd e\ne a\na x",
    },
    oddCycle: {
      mode: "blossom",
      vertices: "a, b, c, d, e",
      edges: "a b\nb c\nc d\nd e\ne a",
    },
  });

  function assertMode(mode) {
    if (!MODES.includes(mode)) throw new RangeError("Неизвестный режим паросочетаний.");
    return mode;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseVertices(raw, mode) {
    const text = String(raw || "").trim();
    if (!text) return [];
    const seen = new Set();
    const nodes = text.split(/[\n,;]+/).map(function (chunk) {
      const token = chunk.trim();
      if (!token) return null;
      const pieces = token.split(":");
      const id = graphCore.normalizeId(pieces[0].trim(), "Вершина");
      if (seen.has(id)) throw new RangeError("Вершина " + id + " указана дважды.");
      seen.add(id);
      let partition = null;
      if (mode === "bipartite") {
        const side = String(pieces[1] || "").trim().toUpperCase();
        if (side !== "L" && side !== "R") {
          throw new RangeError("Для двудольного графа укажите долю: " + id + ":L или " + id + ":R.");
        }
        partition = side;
      }
      return { id: id, label: id, partition: partition };
    }).filter(Boolean);
    if (nodes.length > MAX_NODES) throw new RangeError("Допустимо не более " + MAX_NODES + " вершин.");
    return nodes;
  }

  function parseGraphText(rawVertices, rawEdges, rawMode) {
    const mode = assertMode(rawMode || "bipartite");
    const nodes = parseVertices(rawVertices, mode);
    const ids = new Set(nodes.map(function (node) { return node.id; }));
    const lines = String(rawEdges || "").split(/[\n;]+/).map(function (line) {
      return line.trim();
    }).filter(Boolean);
    if (lines.length > MAX_EDGES) throw new RangeError("Допустимо не более " + MAX_EDGES + " рёбер.");
    const nodeById = Object.create(null);
    nodes.forEach(function (node) { nodeById[node.id] = node; });
    const edges = lines.map(function (line, index) {
      const parts = line.split(/\s+/);
      if (parts.length !== 2) throw new RangeError("Ребро должно содержать ровно два конца: «" + line + "».");
      const source = graphCore.normalizeId(parts[0], "Начало ребра");
      const target = graphCore.normalizeId(parts[1], "Конец ребра");
      if (!ids.has(source) || !ids.has(target)) throw new RangeError("Ребро «" + line + "» ссылается на неизвестную вершину.");
      if (mode === "bipartite" && nodeById[source].partition === nodeById[target].partition) {
        throw new RangeError("Двудольное ребро должно соединять L и R: «" + line + "».");
      }
      return { id: "e" + (index + 1), source: source, target: target, directed: false };
    });
    return normalize({ nodes: nodes, edges: edges }, mode);
  }

  function normalize(rawGraph, mode) {
    const graph = graphCore.normalizeGraph(rawGraph, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
    const normalizedNodes = graph.nodes.map(function (node) {
      let partition = node.partition === null ? null : String(node.partition).toUpperCase();
      if (mode === "bipartite" && partition !== "L" && partition !== "R") {
        throw new RangeError("У вершины " + node.id + " нет доли L или R.");
      }
      return Object.assign({}, node, { partition: partition });
    });
    const byId = Object.create(null);
    normalizedNodes.forEach(function (node) { byId[node.id] = node; });
    graph.edges.forEach(function (edge) {
      if (mode === "bipartite" && byId[edge.source].partition === byId[edge.target].partition) {
        throw new RangeError("Ребро " + edge.id + " нарушает двудольность.");
      }
    });
    return graphCore.deepFreeze({ nodes: normalizedNodes, edges: graph.edges.map(function (edge) {
      return Object.assign({}, edge, { directed: false });
    }) });
  }

  function graphFromPreset(name) {
    const preset = PRESETS[name];
    if (!preset) throw new RangeError("Неизвестный пример графа.");
    return parseGraphText(preset.vertices, preset.edges, preset.mode);
  }

  function graphText(graph, mode) {
    const vertices = graph.nodes.map(function (node) {
      return node.id + (mode === "bipartite" ? ":" + node.partition : "");
    }).join(", ");
    const edges = graph.edges.map(function (edge) { return edge.source + " " + edge.target; }).join("\n");
    return { vertices: vertices, edges: edges };
  }

  function endpointMap(graph) {
    const map = Object.create(null);
    graph.edges.forEach(function (edge) { map[edge.id] = edge; });
    return map;
  }

  function matchingInfo(graph, edgeIds) {
    const edgeById = endpointMap(graph);
    const used = new Set();
    const valid = [];
    (edgeIds || []).forEach(function (id) {
      const edge = edgeById[id];
      if (!edge) throw new RangeError("Неизвестное ребро паросочетания: " + id + ".");
      if (edge.source === edge.target) throw new RangeError("Петля не может входить в паросочетание.");
      if (used.has(edge.source) || used.has(edge.target)) throw new RangeError("Рёбра не образуют паросочетание.");
      used.add(edge.source); used.add(edge.target); valid.push(id);
    });
    return { valid: true, edgeIds: valid, matchedVertexIds: Array.from(used) };
  }

  function bruteMaximumMatching(rawGraph) {
    const graph = rawGraph;
    const edges = graph.edges.filter(function (edge) { return edge.source !== edge.target; });
    if (edges.length > 18) return { size: null, count: null, edgeIds: [], exact: false };
    let bestSize = -1;
    let count = 0;
    let witness = [];
    function visit(index, used, chosen) {
      if (chosen.length + Math.floor((graph.nodes.length - used.size) / 2) < bestSize) return;
      if (index === edges.length) {
        if (chosen.length > bestSize) { bestSize = chosen.length; count = 1; witness = chosen.slice(); }
        else if (chosen.length === bestSize) count += 1;
        return;
      }
      visit(index + 1, used, chosen);
      const edge = edges[index];
      if (!used.has(edge.source) && !used.has(edge.target)) {
        used.add(edge.source); used.add(edge.target); chosen.push(edge.id);
        visit(index + 1, used, chosen);
        chosen.pop(); used.delete(edge.source); used.delete(edge.target);
      }
    }
    visit(0, new Set(), []);
    return graphCore.deepFreeze({ size: Math.max(0, bestSize), count: count, edgeIds: witness, exact: true });
  }

  function frame(base) {
    return Object.assign({
      phase: "search", message: "", matchingEdgeIds: [], activeEdgeId: null,
      augmentingPathEdgeIds: [], augmentingPathVertexIds: [], layers: {},
      reachableVertexIds: [], minVertexCoverIds: [], blossomVertexIds: [],
      contractedBaseId: null, forestParents: {},
    }, clone(base));
  }

  function orientedBipartite(graph) {
    const left = graph.nodes.filter(function (node) { return node.partition === "L"; }).map(function (node) { return node.id; });
    const right = graph.nodes.filter(function (node) { return node.partition === "R"; }).map(function (node) { return node.id; });
    const adjacency = Object.create(null);
    graph.nodes.forEach(function (node) { adjacency[node.id] = []; });
    graph.edges.forEach(function (edge) {
      if (edge.source === edge.target) return;
      const l = graph.nodes.find(function (node) { return node.id === edge.source; }).partition === "L" ? edge.source : edge.target;
      const r = l === edge.source ? edge.target : edge.source;
      adjacency[l].push({ to: r, edgeId: edge.id });
      adjacency[r].push({ to: l, edgeId: edge.id });
    });
    Object.keys(adjacency).forEach(function (id) {
      adjacency[id].sort(function (a, b) { return a.edgeId.localeCompare(b.edgeId, "en", { numeric: true }); });
    });
    return { left: left, right: right, adjacency: adjacency };
  }

  function bipartiteFrames(graph) {
    const data = orientedBipartite(graph);
    let matching = [];
    const frames = [frame({ phase: "start", message: graph.nodes.length ? "Начинаем с пустого паросочетания." : "Пустой граф: паросочетание уже максимально." })];
    function mates() {
      const map = Object.create(null);
      const byEdge = endpointMap(graph);
      matching.forEach(function (id) {
        const edge = byEdge[id]; map[edge.source] = { vertex: edge.target, edgeId: id }; map[edge.target] = { vertex: edge.source, edgeId: id };
      });
      return map;
    }
    let finalReachable = [];
    while (true) {
      const mate = mates();
      const queue = [];
      const predecessor = Object.create(null);
      const layers = Object.create(null);
      data.left.forEach(function (id) {
        if (!mate[id]) { queue.push(id); predecessor[id] = null; layers[id] = 0; }
      });
      let cursor = 0;
      let target = null;
      frames.push(frame({
        phase: "search", matchingEdgeIds: matching.slice(), layers: layers,
        reachableVertexIds: queue.slice(),
        message: queue.length ? "Строим чередующийся лес от всех свободных вершин левой доли." : "Свободных вершин слева нет: паросочетание совершенное для левой доли.",
      }));
      while (cursor < queue.length && target === null) {
        const v = queue[cursor++];
        if (data.left.includes(v)) {
          const options = data.adjacency[v].filter(function (item) { return !mate[v] || item.edgeId !== mate[v].edgeId; });
          for (let i = 0; i < options.length && target === null; i += 1) {
            const item = options[i];
            frames.push(frame({ phase: "scan", matchingEdgeIds: matching.slice(), activeEdgeId: item.edgeId, layers: layers, reachableVertexIds: Object.keys(predecessor), message: "Из " + v + " проверяем незанятое ребро " + item.edgeId + "." }));
            if (Object.prototype.hasOwnProperty.call(predecessor, item.to)) continue;
            predecessor[item.to] = { vertex: v, edgeId: item.edgeId };
            layers[item.to] = layers[v] + 1;
            if (!mate[item.to]) target = item.to;
            else {
              const back = mate[item.to];
              if (!Object.prototype.hasOwnProperty.call(predecessor, back.vertex)) {
                predecessor[back.vertex] = { vertex: item.to, edgeId: back.edgeId };
                layers[back.vertex] = layers[item.to] + 1;
                queue.push(back.vertex);
              }
            }
          }
        }
      }
      finalReachable = Object.keys(predecessor);
      if (target === null) break;
      const pathVertices = [target];
      const pathEdges = [];
      let current = target;
      while (predecessor[current]) {
        pathEdges.push(predecessor[current].edgeId);
        current = predecessor[current].vertex;
        pathVertices.push(current);
      }
      pathEdges.reverse(); pathVertices.reverse();
      const toggled = new Set(matching);
      pathEdges.forEach(function (id) { if (toggled.has(id)) toggled.delete(id); else toggled.add(id); });
      matching = Array.from(toggled);
      frames.push(frame({ phase: "augment", matchingEdgeIds: matching.slice(), augmentingPathEdgeIds: pathEdges, augmentingPathVertexIds: pathVertices, layers: layers, reachableVertexIds: Object.keys(predecessor), message: "Найден увеличивающий путь " + pathVertices.join(" — ") + "; меняем статус каждого его ребра." }));
    }
    const reachable = new Set(finalReachable);
    const cover = data.left.filter(function (id) { return !reachable.has(id); }).concat(data.right.filter(function (id) { return reachable.has(id); }));
    const analysis = bruteMaximumMatching(graph);
    frames.push(frame({
      phase: "done", matchingEdgeIds: matching.slice(), reachableVertexIds: finalReachable,
      minVertexCoverIds: cover,
      message: "Увеличивающего пути нет. По лемме Бержа паросочетание максимально; достижимый лес даёт минимальное вершинное покрытие.",
    }));
    return { frames: frames, finalMatchingEdgeIds: matching, minVertexCoverIds: cover, analysis: analysis };
  }

  function simpleAdjacency(graph) {
    const index = Object.create(null);
    graph.nodes.forEach(function (node, i) { index[node.id] = i; });
    const adjacency = graph.nodes.map(function () { return []; });
    const pairEdge = Object.create(null);
    graph.edges.forEach(function (edge) {
      if (edge.source === edge.target) return;
      const a = index[edge.source]; const b = index[edge.target];
      const key = Math.min(a, b) + ":" + Math.max(a, b);
      if (pairEdge[key] === undefined || edge.id.localeCompare(pairEdge[key], "en", { numeric: true }) < 0) pairEdge[key] = edge.id;
      if (!adjacency[a].includes(b)) { adjacency[a].push(b); adjacency[b].push(a); }
    });
    adjacency.forEach(function (list) { list.sort(function (a, b) { return a - b; }); });
    return { adjacency: adjacency, pairEdge: pairEdge };
  }

  function generalFrames(graph) {
    const n = graph.nodes.length;
    const simple = simpleAdjacency(graph);
    const adj = simple.adjacency;
    const match = new Array(n).fill(-1);
    const frames = [frame({ phase: "start", message: n ? "Запускаем поиск увеличивающих путей в общем графе." : "Пустой граф: увеличивать нечего." })];
    function edgeId(a, b) { return simple.pairEdge[Math.min(a, b) + ":" + Math.max(a, b)] || null; }
    function matchingIds() {
      const ids = [];
      for (let i = 0; i < n; i += 1) if (match[i] > i) ids.push(edgeId(i, match[i]));
      return ids.filter(Boolean);
    }
    function ids(indices) { return indices.map(function (i) { return graph.nodes[i].id; }); }

    function findPath(rootIndex) {
      const used = new Array(n).fill(false);
      const parent = new Array(n).fill(-1);
      const base = Array.from({ length: n }, function (_, i) { return i; });
      const queue = [rootIndex]; used[rootIndex] = true;
      function lca(a, b) {
        const visited = new Array(n).fill(false);
        let x = a;
        while (true) {
          x = base[x]; visited[x] = true;
          if (match[x] === -1) break;
          x = parent[match[x]];
        }
        let y = b;
        while (true) {
          y = base[y]; if (visited[y]) return y;
          if (match[y] === -1) return y;
          y = parent[match[y]];
        }
      }
      function markPath(v, b, child, blossom) {
        let x = v; let nextChild = child;
        while (base[x] !== b) {
          blossom[base[x]] = true; blossom[base[match[x]]] = true;
          parent[x] = nextChild;
          nextChild = match[x];
          x = parent[match[x]];
        }
      }
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const v = queue[cursor];
        for (let j = 0; j < adj[v].length; j += 1) {
          const to = adj[v][j];
          frames.push(frame({ phase: "scan", matchingEdgeIds: matchingIds(), activeEdgeId: edgeId(v, to), reachableVertexIds: ids(queue), forestParents: parent.reduce(function (out, p, i) { if (p !== -1) out[graph.nodes[i].id] = graph.nodes[p].id; return out; }, {}), message: "В чередующемся лесу проверяем ребро " + graph.nodes[v].id + " — " + graph.nodes[to].id + "." }));
          if (base[v] === base[to] || match[v] === to) continue;
          if (to === rootIndex || (match[to] !== -1 && parent[match[to]] !== -1)) {
            const currentBase = lca(v, to);
            const blossom = new Array(n).fill(false);
            markPath(v, currentBase, to, blossom);
            markPath(to, currentBase, v, blossom);
            const contracted = [];
            for (let i = 0; i < n; i += 1) {
              if (blossom[base[i]]) { base[i] = currentBase; if (!used[i]) { used[i] = true; queue.push(i); } contracted.push(i); }
            }
            if (!contracted.includes(currentBase)) contracted.push(currentBase);
            frames.push(frame({ phase: "contract", matchingEdgeIds: matchingIds(), activeEdgeId: edgeId(v, to), reachableVertexIds: ids(queue), blossomVertexIds: ids(contracted), contractedBaseId: graph.nodes[currentBase].id, forestParents: parent.reduce(function (out, p, i) { if (p !== -1) out[graph.nodes[i].id] = graph.nodes[p].id; return out; }, {}), message: "Нечётный чередующийся цикл сжимаем в цветок с базой " + graph.nodes[currentBase].id + "." }));
          } else if (parent[to] === -1) {
            parent[to] = v;
            if (match[to] === -1) return { endpoint: to, parent: parent };
            const next = match[to]; used[next] = true; queue.push(next);
          }
        }
      }
      return null;
    }

    for (let i = 0; i < n; i += 1) {
      if (match[i] !== -1) continue;
      const found = findPath(i);
      if (!found) continue;
      const pathIndices = [found.endpoint];
      const pathEdges = [];
      let traceVertex = found.endpoint;
      while (found.parent[traceVertex] !== -1) {
        const traceParent = found.parent[traceVertex];
        pathIndices.push(traceParent);
        pathEdges.push(edgeId(traceVertex, traceParent));
        const previousMate = match[traceParent];
        if (previousMate === -1) break;
        pathIndices.push(previousMate);
        pathEdges.push(edgeId(traceParent, previousMate));
        traceVertex = previousMate;
      }
      let v = found.endpoint;
      while (v !== -1) {
        const pv = found.parent[v];
        if (pv === -1) break;
        const ppv = match[pv];
        match[v] = pv; match[pv] = v; v = ppv;
      }
      frames.push(frame({ phase: "augment", matchingEdgeIds: matchingIds(), augmentingPathEdgeIds: pathEdges.filter(Boolean).reverse(), augmentingPathVertexIds: ids(pathIndices.reverse()), message: "Увеличивающий путь найден; чередование перевёрнуто, размер паросочетания вырос на один." }));
    }
    const analysis = bruteMaximumMatching(graph);
    frames.push(frame({ phase: "done", matchingEdgeIds: matchingIds(), message: "Поиск завершён: увеличивающих путей больше нет." }));
    return { frames: frames, finalMatchingEdgeIds: matchingIds(), minVertexCoverIds: [], analysis: analysis };
  }

  function createState(options) {
    const settings = options || {};
    const mode = assertMode(settings.mode || "bipartite");
    const graph = normalize(settings.graph || { nodes: [], edges: [] }, mode);
    const result = mode === "bipartite" ? bipartiteFrames(graph) : generalFrames(graph);
    const playback = graphCore.createPlayback(result.frames, { maxFrames: 4096 });
    return graphCore.deepFreeze(Object.assign({}, playback, {
      mode: mode, graph: graph, finalMatchingEdgeIds: result.finalMatchingEdgeIds,
      minVertexCoverIds: result.minVertexCoverIds, analysis: result.analysis,
    }));
  }

  function withPlayback(state, playback) {
    return graphCore.deepFreeze(Object.assign({}, state, playback));
  }
  function step(state) { return withPlayback(state, graphCore.playbackStep(state)); }
  function seek(state, cursor) { return withPlayback(state, graphCore.playbackSeek(state, cursor)); }
  function reset(state) { return withPlayback(state, graphCore.playbackReset(state)); }

  function coverIsValid(graph, coverIds) {
    const cover = new Set(coverIds || []);
    return graph.edges.every(function (edge) { return cover.has(edge.source) || cover.has(edge.target); });
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES, MAX_EDGES: MAX_EDGES, MODES: MODES, PRESETS: PRESETS,
    parseGraphText: parseGraphText, graphFromPreset: graphFromPreset, graphText: graphText,
    matchingInfo: matchingInfo, bruteMaximumMatching: bruteMaximumMatching,
    coverIsValid: coverIsValid, createState: createState, step: step, seek: seek, reset: reset,
    isFinished: function (state) { return Boolean(state && state.finished); },
  });
});
