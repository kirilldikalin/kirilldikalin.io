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
    root.MinimumSpanningTreesCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) {
    throw new Error("AtlasGraphLabCore is unavailable");
  }

  const MODES = Object.freeze(["kruskal", "prim", "boruvka"]);
  const MAX_NODES = 24;
  const MAX_EDGES = 96;
  const MAX_WEIGHT_DIGITS = 40;
  const MAX_FRAMES = 4096;

  const PRESETS = shared.deepFreeze({
    unique: {
      label: "Связный граф с единственным MST",
      root: "A",
      vertices: ["A", "B", "C", "D", "E", "F"],
      edges: [
        ["A", "B", "4"], ["A", "C", "2"], ["B", "C", "1"],
        ["B", "D", "5"], ["C", "D", "8"], ["C", "E", "10"],
        ["D", "E", "2"], ["D", "F", "6"], ["E", "F", "3"],
      ],
    },
    multiple: {
      label: "Несколько оптимальных деревьев",
      root: "A",
      vertices: ["A", "B", "C", "D"],
      edges: [
        ["A", "B", "1"], ["B", "C", "1"], ["C", "D", "1"],
        ["D", "A", "1"], ["A", "C", "3"],
      ],
    },
    parallel: {
      label: "Петли и параллельные рёбра",
      root: "A",
      vertices: ["A", "B", "C", "D"],
      edges: [
        ["A", "A", "-100"], ["A", "B", "7"], ["A", "B", "2"],
        ["B", "C", "3"], ["A", "C", "9"], ["C", "D", "1"],
        ["B", "D", "8"],
      ],
    },
    disconnected: {
      label: "Несвязный граф: минимальный лес",
      root: "A",
      vertices: ["A", "B", "C", "X", "Y", "Z"],
      edges: [
        ["A", "B", "4"], ["A", "C", "2"], ["B", "C", "1"],
        ["X", "Y", "5"], ["Y", "Z", "-2"], ["X", "Z", "8"],
      ],
    },
    singleton: {
      label: "Одна вершина",
      root: "A",
      vertices: ["A"],
      edges: [],
    },
    signed: {
      label: "Отрицательные и большие веса",
      root: "A",
      vertices: ["A", "B", "C", "D", "E"],
      edges: [
        ["A", "B", "-900719925474099312345"],
        ["A", "C", "-12"], ["B", "C", "4"], ["B", "D", "18"],
        ["C", "D", "-3"], ["C", "E", "900719925474099399999"],
        ["D", "E", "21"],
      ],
    },
  });

  function modeName(rawMode) {
    const mode = String(rawMode || "").trim().toLowerCase();
    if (!MODES.includes(mode)) {
      throw new RangeError("Режим должен быть kruskal, prim или boruvka.");
    }
    return mode;
  }

  function parseWeight(rawWeight, label) {
    if (typeof rawWeight === "number") {
      if (!Number.isSafeInteger(rawWeight)) {
        throw new RangeError((label || "Вес") + ": большие целые вводите строкой.");
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
    if (base.directed || base.edges.some(function (edge) { return edge.directed; })) {
      throw new RangeError("Минимальный остов в этой главе определён для неориентированного графа.");
    }
    const edges = base.edges.map(function (edge) {
      const weight = parseWeight(
        edge.weight === null || edge.weight === "" ? "1" : edge.weight,
        "Вес ребра " + edge.id
      );
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        directed: false,
        label: weight.toString(),
        weight: weight.toString(),
        key: edge.key,
      };
    });
    return shared.deepFreeze({
      id: base.id || "mst-graph",
      label: base.label || "Взвешенный неориентированный граф",
      directed: false,
      nodes: base.nodes.map(function (node) {
        return { id: node.id, label: node.label, layer: node.layer, partition: node.partition };
      }),
      edges: edges,
    });
  }

  function graphFromPreset(rawPreset) {
    const id = String(rawPreset || "unique");
    const preset = PRESETS[id];
    if (!preset) throw new RangeError("Неизвестный сценарий: " + id + ".");
    return normalizeGraph({
      id: id,
      label: preset.label,
      directed: false,
      nodes: preset.vertices.map(function (vertex) { return { id: vertex, label: vertex }; }),
      edges: preset.edges.map(function (edge, index) {
        return {
          id: "e" + String(index + 1),
          source: edge[0],
          target: edge[1],
          weight: edge[2],
          directed: false,
        };
      }),
    });
  }

  function parseGraphText(rawVertices, rawEdges) {
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
        throw new RangeError("Ребро " + String(index + 1) + ": формат «конец конец вес».");
      }
      return {
        id: "e" + String(index + 1),
        source: parts[0],
        target: parts[1],
        weight: parseWeight(parts[2], "Вес ребра " + String(index + 1)).toString(),
        directed: false,
      };
    });
    return normalizeGraph({ directed: false, nodes: nodes, edges: edges });
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

  function compareEdges(left, right) {
    const difference = BigInt(left.weight) - BigInt(right.weight);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
    return left.id.localeCompare(right.id);
  }

  function edgeById(graph) {
    return Object.fromEntries(graph.edges.map(function (edge) { return [edge.id, edge]; }));
  }

  function otherEndpoint(edge, vertexId) {
    if (edge.source === vertexId) return edge.target;
    if (edge.target === vertexId) return edge.source;
    throw new RangeError("Вершина " + vertexId + " не инцидентна ребру " + edge.id + ".");
  }

  function incidentEdges(graph) {
    const adjacency = Object.create(null);
    graph.nodes.forEach(function (node) { adjacency[node.id] = []; });
    graph.edges.forEach(function (edge) {
      adjacency[edge.source].push(edge);
      if (edge.target !== edge.source) adjacency[edge.target].push(edge);
    });
    Object.keys(adjacency).forEach(function (id) { adjacency[id].sort(compareEdges); });
    return adjacency;
  }

  function groupsSnapshot(dsu) {
    return dsu.groups().map(function (members) {
      return members.slice().sort();
    }).sort(function (left, right) {
      return left[0].localeCompare(right[0]);
    });
  }

  function dsuSnapshot(dsu) {
    return dsu.snapshot().entries.map(function (entry) {
      return {
        id: entry.id,
        parent: entry.parent,
        root: entry.root,
        rank: entry.rank,
        size: entry.size,
      };
    });
  }

  function forestWeight(graph, selectedEdgeIds) {
    const selected = new Set(selectedEdgeIds);
    return graph.edges.reduce(function (sum, edge) {
      return selected.has(edge.id) ? sum + BigInt(edge.weight) : sum;
    }, 0n);
  }

  function graphComponents(graph) {
    if (graph.nodes.length === 0) return [];
    const dsu = new shared.DisjointSet(graph.nodes.map(function (node) { return node.id; }));
    graph.edges.forEach(function (edge) {
      if (edge.source !== edge.target) dsu.union(edge.source, edge.target);
    });
    return groupsSnapshot(dsu);
  }

  function makeFrame(graph, dsu, details) {
    const result = Object.assign({
      phase: "inspect",
      round: 0,
      message: "",
      activeEdgeId: null,
      activeVertexId: null,
      safeEdgeId: null,
      selectedEdgeIds: [],
      rejectedEdgeIds: [],
      candidateEdgeIds: [],
      cutLeft: [],
      cutRight: [],
      components: groupsSnapshot(dsu),
      dsu: dsuSnapshot(dsu),
      totalWeight: "0",
    }, details);
    result.selectedEdgeIds = (details.selectedEdgeIds || []).slice();
    result.rejectedEdgeIds = (details.rejectedEdgeIds || []).slice();
    result.candidateEdgeIds = (details.candidateEdgeIds || []).slice();
    result.cutLeft = (details.cutLeft || []).slice();
    result.cutRight = (details.cutRight || []).slice();
    result.components = result.components.map(function (group) { return group.slice(); });
    result.dsu = result.dsu.map(function (entry) { return Object.assign({}, entry); });
    result.totalWeight = forestWeight(graph, result.selectedEdgeIds).toString();
    return result;
  }

  function componentOf(groups, vertexId) {
    return groups.find(function (group) { return group.includes(vertexId); }) || [];
  }

  function crossingEdges(graph, leftIds) {
    const left = new Set(leftIds);
    return graph.edges.filter(function (edge) {
      return edge.source !== edge.target && left.has(edge.source) !== left.has(edge.target);
    }).sort(compareEdges);
  }

  function buildKruskal(graph) {
    const ids = graph.nodes.map(function (node) { return node.id; });
    const dsu = new shared.DisjointSet(ids);
    const selected = [];
    const rejected = [];
    const frames = [makeFrame(graph, dsu, {
      phase: "start",
      message: "Каждая вершина начинает отдельной компонентой; рёбра упорядочены по весу.",
    })];
    graph.edges.slice().sort(compareEdges).forEach(function (edge, index) {
      if (edge.source === edge.target) {
        rejected.push(edge.id);
        frames.push(makeFrame(graph, dsu, {
          phase: "reject-loop",
          round: index + 1,
          activeEdgeId: edge.id,
          selectedEdgeIds: selected,
          rejectedEdgeIds: rejected,
          message: "Петля " + edge.id + " не соединяет разные вершины и не может войти в остов.",
        }));
        return;
      }
      if (dsu.connected(edge.source, edge.target)) {
        rejected.push(edge.id);
        frames.push(makeFrame(graph, dsu, {
          phase: "reject-cycle",
          round: index + 1,
          activeEdgeId: edge.id,
          selectedEdgeIds: selected,
          rejectedEdgeIds: rejected,
          message: "Концы " + edge.id + " уже связаны лесом; добавление замкнуло бы цикл.",
        }));
        return;
      }
      const beforeGroups = groupsSnapshot(dsu);
      const left = componentOf(beforeGroups, edge.source).slice();
      const right = ids.filter(function (id) { return !left.includes(id); });
      const candidates = crossingEdges(graph, left).map(function (candidate) { return candidate.id; });
      dsu.union(edge.source, edge.target);
      selected.push(edge.id);
      frames.push(makeFrame(graph, dsu, {
        phase: "safe-edge",
        round: index + 1,
        activeEdgeId: edge.id,
        safeEdgeId: edge.id,
        selectedEdgeIds: selected,
        rejectedEdgeIds: rejected,
        candidateEdgeIds: candidates,
        cutLeft: left,
        cutRight: right,
        message: "Ребро " + edge.id + " минимально среди ещё допустимых и безопасно объединяет две компоненты.",
      }));
    });
    frames.push(makeFrame(graph, dsu, {
      phase: "finish",
      round: graph.edges.length,
      selectedEdgeIds: selected,
      rejectedEdgeIds: rejected,
      message: dsu.componentCount() === 1 || graph.nodes.length === 0
        ? "Kruskal завершён: построено минимальное остовное дерево."
        : "Kruskal завершён: граф несвязен, поэтому построен минимальный остовный лес.",
    }));
    return frames;
  }

  function buildPrim(graph, rawRoot) {
    const ids = graph.nodes.map(function (node) { return node.id; });
    const root = String(rawRoot || (ids[0] || "")).trim();
    if (ids.length && !ids.includes(root)) {
      throw new RangeError("Стартовая вершина Prim отсутствует в графе: " + root + ".");
    }
    const adjacency = incidentEdges(graph);
    const dsu = new shared.DisjointSet(ids);
    const reached = new Set();
    const selected = [];
    const rejected = [];
    const frames = [makeFrame(graph, dsu, {
      phase: "start",
      activeVertexId: ids.length ? root : null,
      message: ids.length
        ? "Prim начнёт с вершины " + root + " и будет расширять один компонент дерева."
        : "Пустой граф не содержит остовных рёбер.",
    })];
    let preferredRoot = root;
    let round = 0;
    while (reached.size < ids.length) {
      const nextRoot = !reached.size && preferredRoot
        ? preferredRoot
        : ids.filter(function (id) { return !reached.has(id); }).sort()[0];
      if (!reached.size || crossingEdges(graph, Array.from(reached)).length === 0) {
        reached.add(nextRoot);
        round += 1;
        frames.push(makeFrame(graph, dsu, {
          phase: "component-start",
          round: round,
          activeVertexId: nextRoot,
          selectedEdgeIds: selected,
          rejectedEdgeIds: rejected,
          cutLeft: Array.from(reached).sort(),
          cutRight: ids.filter(function (id) { return !reached.has(id); }),
          message: selected.length === 0
            ? "Вершина " + nextRoot + " образует начальный фрагмент дерева."
            : "Разрез больше не имеет рёбер: начинается новая компонента леса с вершины " + nextRoot + ".",
        }));
      }
      const candidates = [];
      reached.forEach(function (id) {
        adjacency[id].forEach(function (edge) {
          if (edge.source === edge.target) return;
          const other = otherEndpoint(edge, id);
          if (!reached.has(other) && !candidates.some(function (item) { return item.id === edge.id; })) {
            candidates.push(edge);
          }
        });
      });
      candidates.sort(compareEdges);
      if (!candidates.length) continue;
      const edge = candidates[0];
      const next = reached.has(edge.source) ? edge.target : edge.source;
      const left = Array.from(reached).sort();
      const right = ids.filter(function (id) { return !reached.has(id); });
      reached.add(next);
      dsu.union(edge.source, edge.target);
      selected.push(edge.id);
      round += 1;
      frames.push(makeFrame(graph, dsu, {
        phase: "safe-edge",
        round: round,
        activeEdgeId: edge.id,
        activeVertexId: next,
        safeEdgeId: edge.id,
        selectedEdgeIds: selected,
        rejectedEdgeIds: rejected,
        candidateEdgeIds: candidates.map(function (candidate) { return candidate.id; }),
        cutLeft: left,
        cutRight: right,
        message: "Минимальное ребро разреза " + edge.id + " присоединяет вершину " + next + ".",
      }));
    }
    frames.push(makeFrame(graph, dsu, {
      phase: "finish",
      round: round,
      selectedEdgeIds: selected,
      rejectedEdgeIds: rejected,
      cutLeft: ids.slice(),
      message: graphComponents(graph).length <= 1
        ? "Prim завершён: все вершины включены в минимальное остовное дерево."
        : "Prim завершён: для каждой компоненты построено своё минимальное дерево.",
    }));
    return frames;
  }

  function buildBoruvka(graph) {
    const ids = graph.nodes.map(function (node) { return node.id; });
    const dsu = new shared.DisjointSet(ids);
    const selected = [];
    const rejected = graph.edges.filter(function (edge) {
      return edge.source === edge.target;
    }).map(function (edge) { return edge.id; });
    const frames = [makeFrame(graph, dsu, {
      phase: "start",
      rejectedEdgeIds: rejected,
      message: "Каждая компонента независимо ищет своё самое лёгкое исходящее ребро.",
    })];
    let phase = 0;
    while (true) {
      const groups = groupsSnapshot(dsu);
      const rootByVertex = Object.create(null);
      dsu.snapshot().entries.forEach(function (entry) { rootByVertex[entry.id] = entry.root; });
      const cheapest = new Map();
      graph.edges.slice().sort(compareEdges).forEach(function (edge) {
        if (edge.source === edge.target || dsu.connected(edge.source, edge.target)) return;
        const leftRoot = rootByVertex[edge.source];
        const rightRoot = rootByVertex[edge.target];
        if (!cheapest.has(leftRoot)) cheapest.set(leftRoot, edge);
        if (!cheapest.has(rightRoot)) cheapest.set(rightRoot, edge);
      });
      const cutForEdge = new Map();
      groups.forEach(function (group) {
        const chosen = cheapest.get(rootByVertex[group[0]]);
        if (chosen && !cutForEdge.has(chosen.id)) cutForEdge.set(chosen.id, group.slice());
      });
      const candidates = Array.from(new Set(Array.from(cheapest.values()).map(function (edge) {
        return edge.id;
      }))).map(function (id) {
        return graph.edges.find(function (edge) { return edge.id === id; });
      }).sort(compareEdges);
      if (!candidates.length) break;
      phase += 1;
      frames.push(makeFrame(graph, dsu, {
        phase: "boruvka-choices",
        round: phase,
        selectedEdgeIds: selected,
        rejectedEdgeIds: rejected,
        candidateEdgeIds: candidates.map(function (edge) { return edge.id; }),
        message: "Фаза " + phase + ": компоненты выбрали " + candidates.length + " различных безопасных рёбер.",
      }));
      let merges = 0;
      candidates.forEach(function (edge) {
        if (dsu.connected(edge.source, edge.target)) return;
        const left = cutForEdge.get(edge.id).slice();
        const right = ids.filter(function (id) { return !left.includes(id); });
        dsu.union(edge.source, edge.target);
        selected.push(edge.id);
        merges += 1;
        frames.push(makeFrame(graph, dsu, {
          phase: "safe-edge",
          round: phase,
          activeEdgeId: edge.id,
          safeEdgeId: edge.id,
          selectedEdgeIds: selected,
          rejectedEdgeIds: rejected,
          candidateEdgeIds: candidates.map(function (candidate) { return candidate.id; }),
          cutLeft: left,
          cutRight: right,
          message: "Компонента добавляет безопасное ребро " + edge.id + "; объединения одной фазы совместимы.",
        }));
      });
      if (!merges) break;
    }
    frames.push(makeFrame(graph, dsu, {
      phase: "finish",
      round: phase,
      selectedEdgeIds: selected,
      rejectedEdgeIds: rejected,
      message: graphComponents(graph).length <= 1
        ? "Borůvka завершён: компоненты слились в минимальное остовное дерево."
        : "Borůvka завершён: между оставшимися компонентами нет рёбер, получен минимальный лес.",
    }));
    return frames;
  }

  function verifyForest(rawGraph, rawSelectedEdgeIds) {
    const graph = normalizeGraph(rawGraph);
    const selected = Array.isArray(rawSelectedEdgeIds) ? rawSelectedEdgeIds.slice() : [];
    const edges = edgeById(graph);
    if (graph.nodes.length === 0) {
      return selected.length
        ? shared.deepFreeze({ valid: false, reason: "Пустой граф не содержит рёбер." })
        : shared.deepFreeze({
          valid: true,
          reason: "Пустой остовный лес.",
          weight: "0",
          componentCount: 0,
        });
    }
    const seen = new Set();
    const dsu = new shared.DisjointSet(graph.nodes.map(function (node) { return node.id; }));
    let weight = 0n;
    for (const id of selected) {
      if (!edges[id]) return shared.deepFreeze({ valid: false, reason: "Неизвестное ребро " + id + "." });
      if (seen.has(id)) return shared.deepFreeze({ valid: false, reason: "Ребро " + id + " повторено." });
      seen.add(id);
      const edge = edges[id];
      if (edge.source === edge.target) return shared.deepFreeze({ valid: false, reason: "Лес содержит петлю." });
      if (dsu.connected(edge.source, edge.target)) return shared.deepFreeze({ valid: false, reason: "Лес содержит цикл." });
      dsu.union(edge.source, edge.target);
      weight += BigInt(edge.weight);
    }
    const original = graphComponents(graph);
    const actual = groupsSnapshot(dsu);
    const originalByVertex = Object.create(null);
    const actualByVertex = Object.create(null);
    original.forEach(function (group, index) { group.forEach(function (id) { originalByVertex[id] = index; }); });
    actual.forEach(function (group, index) { group.forEach(function (id) { actualByVertex[id] = index; }); });
    const spans = graph.edges.every(function (edge) {
      return originalByVertex[edge.source] !== originalByVertex[edge.target] ||
        actualByVertex[edge.source] === actualByVertex[edge.target];
    });
    if (!spans || selected.length !== graph.nodes.length - original.length) {
      return shared.deepFreeze({ valid: false, reason: "Лес не охватывает связные компоненты графа." });
    }
    return shared.deepFreeze({
      valid: true,
      reason: "Это остовный лес исходного графа.",
      weight: weight.toString(),
      componentCount: original.length,
    });
  }

  function pathEdges(adjacency, source, target) {
    const queue = [source];
    const parent = Object.create(null);
    parent[source] = null;
    let cursor = 0;
    while (cursor < queue.length) {
      const id = queue[cursor];
      cursor += 1;
      if (id === target) break;
      (adjacency[id] || []).forEach(function (entry) {
        if (Object.prototype.hasOwnProperty.call(parent, entry.nodeId)) return;
        parent[entry.nodeId] = { nodeId: id, edge: entry.edge };
        queue.push(entry.nodeId);
      });
    }
    if (!Object.prototype.hasOwnProperty.call(parent, target)) return null;
    const result = [];
    let current = target;
    while (current !== source) {
      result.push(parent[current].edge);
      current = parent[current].nodeId;
    }
    return result;
  }

  function analyzeOptimality(rawGraph, rawSelectedEdgeIds) {
    const graph = normalizeGraph(rawGraph);
    const selected = new Set(rawSelectedEdgeIds || []);
    const verification = verifyForest(graph, Array.from(selected));
    if (!verification.valid) {
      return shared.deepFreeze({ optimal: false, unique: false, reason: verification.reason, witness: null });
    }
    const adjacency = Object.create(null);
    graph.nodes.forEach(function (node) { adjacency[node.id] = []; });
    graph.edges.forEach(function (edge) {
      if (!selected.has(edge.id)) return;
      adjacency[edge.source].push({ nodeId: edge.target, edge: edge });
      adjacency[edge.target].push({ nodeId: edge.source, edge: edge });
    });
    let equalityWitness = null;
    for (const edge of graph.edges) {
      if (selected.has(edge.id) || edge.source === edge.target) continue;
      const path = pathEdges(adjacency, edge.source, edge.target);
      if (!path || !path.length) continue;
      let maximum = path[0];
      path.slice(1).forEach(function (candidate) {
        if (compareEdges(candidate, maximum) > 0 && BigInt(candidate.weight) > BigInt(maximum.weight)) {
          maximum = candidate;
        }
      });
      if (BigInt(edge.weight) < BigInt(maximum.weight)) {
        return shared.deepFreeze({
          optimal: false,
          unique: false,
          reason: "Неостовное ребро легче максимального ребра на своём фундаментальном цикле.",
          witness: { addEdgeId: edge.id, removeEdgeId: maximum.id },
        });
      }
      if (!equalityWitness && BigInt(edge.weight) === BigInt(maximum.weight)) {
        equalityWitness = { addEdgeId: edge.id, removeEdgeId: maximum.id, weight: edge.weight };
      }
    }
    return shared.deepFreeze({
      optimal: true,
      unique: equalityWitness === null,
      reason: equalityWitness
        ? "Равный обмен даёт другой минимальный остовный лес."
        : "Каждое неостовное ребро строго тяжелее максимума на пути в лесу.",
      witness: equalityWitness,
      weight: verification.weight,
      componentCount: verification.componentCount,
    });
  }

  function wrapState(meta, playback) {
    return Object.freeze({
      mode: meta.mode,
      graph: meta.graph,
      root: meta.root,
      frames: playback.frames,
      cursor: playback.cursor,
      current: playback.current,
      atStart: playback.atStart,
      finished: playback.finished,
      optimality: meta.optimality,
    });
  }

  function createState(options) {
    const settings = options || {};
    const mode = modeName(settings.mode || "kruskal");
    const graph = settings.graph
      ? normalizeGraph(settings.graph)
      : graphFromPreset(settings.preset || "unique");
    const fallbackRoot = settings.preset && PRESETS[settings.preset]
      ? PRESETS[settings.preset].root
      : graph.nodes.length ? graph.nodes[0].id : "";
    const root = String(settings.root === undefined ? fallbackRoot : settings.root).trim();
    let frames;
    if (graph.nodes.length === 0) {
      frames = [{
        phase: "finish",
        round: 0,
        message: "Пустой граф не содержит остовных рёбер.",
        activeEdgeId: null,
        activeVertexId: null,
        safeEdgeId: null,
        selectedEdgeIds: [],
        rejectedEdgeIds: [],
        candidateEdgeIds: [],
        cutLeft: [],
        cutRight: [],
        components: [],
        dsu: [],
        totalWeight: "0",
      }];
    } else if (mode === "kruskal") frames = buildKruskal(graph);
    else if (mode === "prim") frames = buildPrim(graph, root);
    else frames = buildBoruvka(graph);
    const finalFrame = frames[frames.length - 1];
    const meta = {
      mode: mode,
      graph: graph,
      root: root,
      optimality: analyzeOptimality(graph, finalFrame.selectedEdgeIds),
    };
    return wrapState(meta, shared.createPlayback(frames, { maxFrames: MAX_FRAMES }));
  }

  function step(state) {
    return wrapState(state, shared.playbackStep(state));
  }

  function runToEnd(state) {
    let current = state;
    let count = 0;
    while (!current.finished) {
      current = step(current);
      count += 1;
      if (count > MAX_FRAMES) throw new Error("Превышен предел кадров выполнения.");
    }
    return current;
  }

  return Object.freeze({
    MODES: MODES,
    PRESETS: PRESETS,
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_WEIGHT_DIGITS: MAX_WEIGHT_DIGITS,
    modeName: modeName,
    parseWeight: parseWeight,
    normalizeGraph: normalizeGraph,
    graphFromPreset: graphFromPreset,
    parseGraphText: parseGraphText,
    graphText: graphText,
    compareEdges: compareEdges,
    crossingEdges: crossingEdges,
    graphComponents: graphComponents,
    forestWeight: forestWeight,
    verifyForest: verifyForest,
    analyzeOptimality: analyzeOptimality,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
  });
});
