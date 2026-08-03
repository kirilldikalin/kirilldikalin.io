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
    root.GraphLanguageTraversalsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MAX_NODES = 14;
  const MAX_EDGES = 48;
  const ALGORITHMS = Object.freeze(["bfs", "dfs"]);
  const REPRESENTATIONS = Object.freeze(["list", "matrix"]);
  const PRESETS = shared.deepFreeze({
    connected: {
      id: "connected",
      label: "Связный неориентированный",
      directed: false,
      nodes: ["A", "B", "C", "D", "E", "F"].map(function (id) {
        return { id: id, label: id };
      }),
      edges: [
        ["A", "B"], ["A", "C"], ["B", "D"], ["B", "E"],
        ["C", "E"], ["D", "F"], ["E", "F"],
      ].map(function (pair, index) {
        return { id: "e" + (index + 1), source: pair[0], target: pair[1] };
      }),
    },
    disconnected: {
      id: "disconnected",
      label: "Две компоненты и изолированная вершина",
      directed: false,
      nodes: ["A", "B", "C", "D", "E", "F", "G"].map(function (id) {
        return { id: id, label: id };
      }),
      edges: [
        ["A", "B"], ["B", "C"], ["A", "C"], ["D", "E"], ["E", "F"],
      ].map(function (pair, index) {
        return { id: "e" + (index + 1), source: pair[0], target: pair[1] };
      }),
    },
    directed: {
      id: "directed",
      label: "Ориентированный с разными типами рёбер",
      directed: true,
      nodes: ["A", "B", "C", "D", "E", "F"].map(function (id) {
        return { id: id, label: id };
      }),
      edges: [
        ["A", "B"], ["A", "C"], ["B", "D"], ["D", "B"],
        ["C", "D"], ["C", "E"], ["E", "F"], ["F", "C"], ["A", "D"],
      ].map(function (pair, index) {
        return { id: "e" + (index + 1), source: pair[0], target: pair[1], directed: true };
      }),
    },
    multigraph: {
      id: "multigraph",
      label: "Петля и параллельные рёбра",
      directed: false,
      nodes: ["A", "B", "C", "D"].map(function (id) {
        return { id: id, label: id };
      }),
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "B" },
        { id: "e3", source: "B", target: "B", label: "петля" },
        { id: "e4", source: "B", target: "C" },
        { id: "e5", source: "C", target: "D" },
      ],
    },
  });

  function emptyGraph(rawGraph) {
    return shared.deepFreeze({
      id: rawGraph && rawGraph.id ? String(rawGraph.id) : "empty",
      label: rawGraph && rawGraph.label ? String(rawGraph.label) : "Пустой граф",
      directed: Boolean(rawGraph && rawGraph.directed),
      nodes: [],
      edges: [],
    });
  }

  function normalizeGraph(rawGraph) {
    if (!rawGraph || typeof rawGraph !== "object" || Array.isArray(rawGraph)) {
      throw new TypeError("Граф должен быть объектом с массивами nodes и edges");
    }
    if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
      throw new TypeError("Граф должен содержать массивы nodes и edges");
    }
    if (rawGraph.nodes.length === 0) {
      if (rawGraph.edges.length !== 0) {
        throw new RangeError("Пустой граф не может содержать рёбра");
      }
      return emptyGraph(rawGraph);
    }
    return shared.normalizeGraph(rawGraph, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
  }

  function preset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
      throw new RangeError("Неизвестный пример графа");
    }
    return normalizeGraph({
      id: PRESETS[name].id,
      label: PRESETS[name].label,
      directed: PRESETS[name].directed,
      nodes: PRESETS[name].nodes.map(function (node) { return Object.assign({}, node); }),
      edges: PRESETS[name].edges.map(function (edge) { return Object.assign({}, edge); }),
    });
  }

  function edgeAdjacency(graph) {
    const result = Object.create(null);
    graph.nodes.forEach(function (node) { result[node.id] = []; });
    graph.edges.forEach(function (edge) {
      result[edge.source].push({ nodeId: edge.target, edgeId: edge.id });
      if (!edge.directed && edge.source !== edge.target) {
        result[edge.target].push({ nodeId: edge.source, edgeId: edge.id });
      }
    });
    Object.keys(result).forEach(function (id) {
      result[id].sort(function (left, right) {
        return left.nodeId.localeCompare(right.nodeId) || left.edgeId.localeCompare(right.edgeId);
      });
    });
    return result;
  }

  function adjacencyList(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const adjacency = edgeAdjacency(graph);
    return shared.deepFreeze(graph.nodes.map(function (node) {
      return {
        id: node.id,
        label: node.label,
        neighbors: adjacency[node.id].map(function (entry) {
          const edge = graph.edges.find(function (candidate) { return candidate.id === entry.edgeId; });
          return { nodeId: entry.nodeId, edgeId: entry.edgeId, directed: edge.directed };
        }),
      };
    }));
  }

  function adjacencyMatrix(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const ids = graph.nodes.map(function (node) { return node.id; });
    const positions = new Map(ids.map(function (id, index) { return [id, index]; }));
    const values = ids.map(function () { return ids.map(function () { return 0; }); });
    graph.edges.forEach(function (edge) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      values[source][target] += 1;
      if (!edge.directed && source !== target) values[target][source] += 1;
    });
    return shared.deepFreeze({ ids: ids, values: values });
  }

  function incidenceMatrix(rawGraph) {
    const graph = normalizeGraph(rawGraph);
    const nodeIds = graph.nodes.map(function (node) { return node.id; });
    const edgeIds = graph.edges.map(function (edge) { return edge.id; });
    const values = nodeIds.map(function () { return edgeIds.map(function () { return 0; }); });
    const positions = new Map(nodeIds.map(function (id, index) { return [id, index]; }));
    graph.edges.forEach(function (edge, edgeIndex) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (edge.directed) {
        values[source][edgeIndex] -= 1;
        values[target][edgeIndex] += 1;
      } else if (source === target) {
        values[source][edgeIndex] = 2;
      } else {
        values[source][edgeIndex] = 1;
        values[target][edgeIndex] = 1;
      }
    });
    return shared.deepFreeze({ nodeIds: nodeIds, edgeIds: edgeIds, values: values });
  }

  function representation(rawGraph, kind) {
    if (!REPRESENTATIONS.includes(kind)) throw new RangeError("Неизвестное представление графа");
    return kind === "list" ? adjacencyList(rawGraph) : adjacencyMatrix(rawGraph);
  }

  function makeMaps(graph) {
    const colors = Object.create(null);
    const parents = Object.create(null);
    const parentEdges = Object.create(null);
    const distances = Object.create(null);
    const discover = Object.create(null);
    const finish = Object.create(null);
    const components = Object.create(null);
    graph.nodes.forEach(function (node) {
      colors[node.id] = "white";
      parents[node.id] = null;
      parentEdges[node.id] = null;
      distances[node.id] = null;
      discover[node.id] = null;
      finish[node.id] = null;
      components[node.id] = null;
    });
    return { colors: colors, parents: parents, parentEdges: parentEdges, distances: distances,
      discover: discover, finish: finish, components: components };
  }

  function copyObject(value) {
    return Object.assign(Object.create(null), value);
  }

  function pushFrame(frames, state, details) {
    const frame = Object.assign({
      index: frames.length,
      algorithm: state.algorithm,
      phase: "inspect",
      currentVertexId: null,
      activeEdgeId: null,
      message: "",
      finished: false,
    }, details || {}, {
      colors: copyObject(state.colors),
      parents: copyObject(state.parents),
      parentEdges: copyObject(state.parentEdges),
      distances: copyObject(state.distances),
      discover: copyObject(state.discover),
      finish: copyObject(state.finish),
      components: copyObject(state.components),
      edgeTypes: copyObject(state.edgeTypes),
      frontier: state.frontier.slice(),
      order: state.order.slice(),
      treeEdges: state.treeEdges.slice(),
      componentCount: state.componentCount,
      time: state.time,
    });
    frames.push(frame);
  }

  function traversalSettings(rawGraph, rawOptions) {
    const graph = normalizeGraph(rawGraph);
    const options = rawOptions || {};
    const algorithm = options.algorithm || "bfs";
    if (!ALGORITHMS.includes(algorithm)) throw new RangeError("Алгоритм должен быть bfs или dfs");
    const known = new Set(graph.nodes.map(function (node) { return node.id; }));
    let source = options.source === undefined || options.source === null
      ? (graph.nodes[0] ? graph.nodes[0].id : null)
      : String(options.source);
    if (source !== null && !known.has(source)) throw new RangeError("Стартовая вершина отсутствует в графе");
    return { graph: graph, algorithm: algorithm, source: source };
  }

  function rootsFor(graph, source) {
    const ids = graph.nodes.map(function (node) { return node.id; }).sort();
    if (source === null) return ids;
    return [source].concat(ids.filter(function (id) { return id !== source; }));
  }

  function initialState(graph, algorithm) {
    return Object.assign(makeMaps(graph), {
      algorithm: algorithm,
      edgeTypes: Object.create(null),
      frontier: [],
      order: [],
      treeEdges: [],
      componentCount: 0,
      time: 0,
    });
  }

  function edgeById(graph) {
    const result = Object.create(null);
    graph.edges.forEach(function (edge) { result[edge.id] = edge; });
    return result;
  }

  function buildBfsTrace(settings) {
    const graph = settings.graph;
    const adjacency = edgeAdjacency(graph);
    const edges = edgeById(graph);
    const state = initialState(graph, "bfs");
    const frames = [];
    pushFrame(frames, state, { phase: "ready", message: graph.nodes.length
      ? "Все вершины белые; очередь пуста"
      : "В пустом графе обход сразу завершён", finished: graph.nodes.length === 0 });
    if (graph.nodes.length === 0) return frames;

    rootsFor(graph, settings.source).forEach(function (rootId) {
      if (state.colors[rootId] !== "white") return;
      state.componentCount += 1;
      state.time += 1;
      state.colors[rootId] = "gray";
      state.distances[rootId] = 0;
      state.discover[rootId] = state.time;
      state.components[rootId] = state.componentCount;
      state.frontier.push(rootId);
      state.order.push(rootId);
      pushFrame(frames, state, {
        phase: "discover", currentVertexId: rootId,
        message: "Новая компонента: вершина " + rootId + " помещена в очередь",
      });

      while (state.frontier.length) {
        const current = state.frontier.shift();
        pushFrame(frames, state, {
          phase: "dequeue", currentVertexId: current,
          message: "Вершина " + current + " извлечена из начала очереди",
        });
        adjacency[current].forEach(function (entry) {
          const edge = edges[entry.edgeId];
          const target = entry.nodeId;
          if (!edge.directed && Object.prototype.hasOwnProperty.call(state.edgeTypes, edge.id)) {
            return;
          }
          if (state.colors[target] === "white") {
            state.edgeTypes[edge.id] = "tree";
            state.treeEdges.push(edge.id);
            state.parents[target] = current;
            state.parentEdges[target] = edge.id;
            state.distances[target] = state.distances[current] + 1;
            state.components[target] = state.componentCount;
            state.time += 1;
            state.discover[target] = state.time;
            state.colors[target] = "gray";
            state.frontier.push(target);
            state.order.push(target);
            pushFrame(frames, state, {
              phase: "discover", currentVertexId: current, activeEdgeId: edge.id,
              message: "Ребро " + edge.id + " впервые открывает " + target +
                "; расстояние равно " + state.distances[target],
            });
          } else {
            state.edgeTypes[edge.id] = edge.source === edge.target ? "loop" : "non-tree";
            pushFrame(frames, state, {
              phase: "inspect", currentVertexId: current, activeEdgeId: edge.id,
              message: "Вершина " + target + " уже обнаружена; ребро не входит в дерево BFS",
            });
          }
        });
        state.colors[current] = "black";
        state.time += 1;
        state.finish[current] = state.time;
        pushFrame(frames, state, {
          phase: "finish", currentVertexId: current,
          message: "Все соседи " + current + " просмотрены; вершина становится чёрной",
        });
      }
    });
    pushFrame(frames, state, {
      phase: "complete", message: "BFS построил лес обхода и расстояния внутри каждой компоненты",
      finished: true,
    });
    return frames;
  }

  function classifyDfsEdge(state, edge, source, target) {
    if (edge.source === edge.target) return "back";
    if (!edge.directed) return "back";
    if (state.colors[target] === "gray") return "back";
    return state.discover[source] < state.discover[target] ? "forward" : "cross";
  }

  function buildDfsTrace(settings) {
    const graph = settings.graph;
    const adjacency = edgeAdjacency(graph);
    const edges = edgeById(graph);
    const state = initialState(graph, "dfs");
    const frames = [];
    pushFrame(frames, state, { phase: "ready", message: graph.nodes.length
      ? "Все вершины белые; стек вызовов пуст"
      : "В пустом графе обход сразу завершён", finished: graph.nodes.length === 0 });
    if (graph.nodes.length === 0) return frames;

    rootsFor(graph, settings.source).forEach(function (rootId) {
      if (state.colors[rootId] !== "white") return;
      state.componentCount += 1;
      state.time += 1;
      state.colors[rootId] = "gray";
      state.distances[rootId] = 0;
      state.discover[rootId] = state.time;
      state.components[rootId] = state.componentCount;
      state.order.push(rootId);
      const stack = [{ id: rootId, cursor: 0 }];
      state.frontier = stack.map(function (item) { return item.id; });
      pushFrame(frames, state, {
        phase: "discover", currentVertexId: rootId,
        message: "Новая компонента: " + rootId + " открыта и помещена в стек",
      });

      while (stack.length) {
        const top = stack[stack.length - 1];
        const entries = adjacency[top.id];
        if (top.cursor >= entries.length) {
          state.colors[top.id] = "black";
          state.time += 1;
          state.finish[top.id] = state.time;
          stack.pop();
          state.frontier = stack.map(function (item) { return item.id; });
          pushFrame(frames, state, {
            phase: "finish", currentVertexId: top.id,
            message: "Из " + top.id + " больше некуда углубляться; фиксируется время выхода",
          });
          continue;
        }
        const entry = entries[top.cursor];
        top.cursor += 1;
        const edge = edges[entry.edgeId];
        const target = entry.nodeId;
        if (!edge.directed && Object.prototype.hasOwnProperty.call(state.edgeTypes, edge.id)) {
          continue;
        }
        if (state.colors[target] === "white") {
          state.edgeTypes[edge.id] = "tree";
          state.treeEdges.push(edge.id);
          state.parents[target] = top.id;
          state.parentEdges[target] = edge.id;
          state.distances[target] = state.distances[top.id] + 1;
          state.components[target] = state.componentCount;
          state.time += 1;
          state.discover[target] = state.time;
          state.colors[target] = "gray";
          state.order.push(target);
          stack.push({ id: target, cursor: 0 });
          state.frontier = stack.map(function (item) { return item.id; });
          pushFrame(frames, state, {
            phase: "discover", currentVertexId: top.id, activeEdgeId: edge.id,
            message: "Деревянное ребро " + edge.id + " углубляет DFS в вершину " + target,
          });
        } else {
          const type = classifyDfsEdge(state, edge, top.id, target);
          state.edgeTypes[edge.id] = type;
          pushFrame(frames, state, {
            phase: "inspect", currentVertexId: top.id, activeEdgeId: edge.id,
            message: "Ребро " + edge.id + " классифицировано как " + type,
          });
        }
      }
    });
    pushFrame(frames, state, {
      phase: "complete", message: "DFS построил лес и присвоил времена входа и выхода",
      finished: true,
    });
    return frames;
  }

  function buildTrace(rawGraph, rawOptions) {
    const settings = traversalSettings(rawGraph, rawOptions);
    const frames = settings.algorithm === "bfs"
      ? buildBfsTrace(settings)
      : buildDfsTrace(settings);
    return shared.deepFreeze({
      graph: settings.graph,
      algorithm: settings.algorithm,
      source: settings.source,
      frames: frames,
    });
  }

  function createState(rawGraph, rawOptions) {
    const trace = buildTrace(rawGraph, rawOptions);
    return shared.deepFreeze({ trace: trace, playback: shared.createPlayback(trace.frames) });
  }

  function replacePlayback(state, playback) {
    if (!state || !state.trace || !state.playback) throw new TypeError("Некорректное состояние обхода");
    return shared.deepFreeze({ trace: state.trace, playback: playback });
  }

  function step(state) {
    if (state && state.playback && state.playback.finished) return state;
    return replacePlayback(state, shared.playbackStep(state.playback));
  }

  function seek(state, cursor) {
    return replacePlayback(state, shared.playbackSeek(state.playback, cursor));
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.playback || !state.playback.current) {
      throw new TypeError("Некорректное состояние визуализации обхода");
    }
    return shared.deepFreeze({
      graph: state.trace.graph,
      algorithm: state.trace.algorithm,
      source: state.trace.source,
      frame: state.playback.current,
      cursor: state.playback.cursor,
      frameCount: state.playback.frames.length,
      finished: state.playback.finished,
    });
  }

  function graphWithNode(rawGraph, rawNode) {
    const graph = normalizeGraph(rawGraph);
    const next = {
      id: graph.id, label: graph.label, directed: graph.directed,
      nodes: graph.nodes.concat([rawNode]), edges: graph.edges.slice(),
    };
    return normalizeGraph(next);
  }

  function graphWithoutNode(rawGraph, rawNodeId) {
    const graph = normalizeGraph(rawGraph);
    const id = String(rawNodeId);
    if (!graph.nodes.some(function (node) { return node.id === id; })) {
      throw new RangeError("Неизвестная вершина " + id);
    }
    return normalizeGraph({
      id: graph.id, label: graph.label, directed: graph.directed,
      nodes: graph.nodes.filter(function (node) { return node.id !== id; }),
      edges: graph.edges.filter(function (edge) { return edge.source !== id && edge.target !== id; }),
    });
  }

  function graphWithEdge(rawGraph, rawEdge) {
    const graph = normalizeGraph(rawGraph);
    return normalizeGraph({
      id: graph.id, label: graph.label, directed: graph.directed,
      nodes: graph.nodes.slice(),
      edges: graph.edges.concat([Object.assign({ directed: graph.directed }, rawEdge)]),
    });
  }

  function graphWithoutEdge(rawGraph, rawEdgeId) {
    const graph = normalizeGraph(rawGraph);
    const id = String(rawEdgeId);
    if (!graph.edges.some(function (edge) { return edge.id === id; })) {
      throw new RangeError("Неизвестное ребро " + id);
    }
    return normalizeGraph({
      id: graph.id, label: graph.label, directed: graph.directed,
      nodes: graph.nodes.slice(),
      edges: graph.edges.filter(function (edge) { return edge.id !== id; }),
    });
  }

  function graphWithDirection(rawGraph, directed) {
    const graph = normalizeGraph(rawGraph);
    return normalizeGraph({
      id: graph.id, label: graph.label, directed: Boolean(directed),
      nodes: graph.nodes.slice(),
      edges: graph.edges.map(function (edge) {
        return Object.assign({}, edge, { directed: Boolean(directed) });
      }),
    });
  }

  function complexity(rawGraph, representationKind) {
    const graph = normalizeGraph(rawGraph);
    const n = graph.nodes.length;
    const m = graph.edges.length;
    if (representationKind === "matrix") {
      return shared.deepFreeze({ n: n, m: m, memory: "Θ(n²)", traversal: "Θ(n²)" });
    }
    if (representationKind !== "list") throw new RangeError("Неизвестное представление графа");
    return shared.deepFreeze({ n: n, m: m, memory: "Θ(n + m)", traversal: "Θ(n + m)" });
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    ALGORITHMS: ALGORITHMS,
    REPRESENTATIONS: REPRESENTATIONS,
    PRESETS: PRESETS,
    normalizeGraph: normalizeGraph,
    preset: preset,
    adjacencyList: adjacencyList,
    adjacencyMatrix: adjacencyMatrix,
    incidenceMatrix: incidenceMatrix,
    representation: representation,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    seek: seek,
    visualModel: visualModel,
    graphWithNode: graphWithNode,
    graphWithoutNode: graphWithoutNode,
    graphWithEdge: graphWithEdge,
    graphWithoutEdge: graphWithoutEdge,
    graphWithDirection: graphWithDirection,
    complexity: complexity,
  });
});
