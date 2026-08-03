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
    root.AtlasDagTopologicalSccCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) {
    throw new Error("AtlasGraphLabCore is unavailable");
  }

  const MAX_LAB_NODES = 24;
  const MAX_LAB_EDGES = 96;

  function sortedIds(values) {
    return values.slice().sort(function (left, right) {
      return String(left).localeCompare(String(right), "ru");
    });
  }

  function assertDirected(rawGraph) {
    const graph = shared.normalizeGraph(rawGraph, {
      maxNodes: MAX_LAB_NODES,
      maxEdges: MAX_LAB_EDGES,
    });
    if (!graph.directed) {
      throw new RangeError("Для топологической сортировки и SCC нужен ориентированный граф.");
    }
    return graph;
  }

  function snapshotMap(map, ids) {
    const result = {};
    ids.forEach(function (id) {
      result[id] = map[id];
    });
    return result;
  }

  function edgeText(rawGraph) {
    const graph = assertDirected(rawGraph);
    const incident = new Set();
    const edges = graph.edges.map(function (edge) {
      incident.add(edge.source);
      incident.add(edge.target);
      return edge.source + ">" + edge.target;
    });
    graph.nodes.forEach(function (node) {
      if (!incident.has(node.id)) edges.push(node.id);
    });
    return edges.join(", ");
  }

  function parseEdgeList(rawValue) {
    if (typeof rawValue !== "string") {
      throw new TypeError("Список рёбер должен быть строкой.");
    }
    if (rawValue.length > 1200) {
      throw new RangeError("Описание графа не должно быть длиннее 1200 символов.");
    }
    const tokens = rawValue.split(/[;,\n]+/).map(function (token) {
      return token.trim();
    }).filter(Boolean);
    if (tokens.length === 0) {
      throw new RangeError("Укажите хотя бы одну вершину или дугу.");
    }
    const nodeIds = new Set();
    const edges = [];
    const edgeKeys = new Set();
    function parseId(rawId) {
      const id = String(rawId).trim();
      if (!/^[\p{L}\p{N}_-]{1,16}$/u.test(id)) {
        throw new RangeError(
          "Имя вершины должно содержать 1–16 букв, цифр, дефисов или подчёркиваний."
        );
      }
      nodeIds.add(id);
      return id;
    }
    tokens.forEach(function (token) {
      const match = token.match(/^(.+?)\s*(?:->|→|>)\s*(.+)$/u);
      if (!match) {
        parseId(token);
        return;
      }
      const source = parseId(match[1]);
      const target = parseId(match[2]);
      const key = source + "\u0000" + target;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({
        id: "e" + String(edges.length + 1),
        source: source,
        target: target,
      });
    });
    if (nodeIds.size > MAX_LAB_NODES || edges.length > MAX_LAB_EDGES) {
      throw new RangeError(
        "Лаборатория поддерживает не больше " + MAX_LAB_NODES +
        " вершин и " + MAX_LAB_EDGES + " дуг."
      );
    }
    return assertDirected({
      directed: true,
      nodes: sortedIds(Array.from(nodeIds)).map(function (id) {
        return { id: id, label: id };
      }),
      edges: edges,
    });
  }

  const PRESETS = shared.deepFreeze({
    uniqueDag: {
      title: "Однозначный порядок",
      edgeList: "A>B, A>C, B>C, B>D, C>D, D>E",
    },
    ambiguousDag: {
      title: "Несколько порядков",
      edgeList: "A>C, B>C, B>D, C>E, D>E",
    },
    cycle: {
      title: "Цикл в зависимостях",
      edgeList: "A>B, B>C, C>A, C>D",
    },
    scc: {
      title: "Четыре компоненты",
      edgeList: "A>B, B>C, C>A, C>D, D>E, E>D, E>F, F>G, G>F, G>H",
    },
  });

  function outgoingMap(graph) {
    const outgoing = {};
    graph.nodes.forEach(function (node) { outgoing[node.id] = []; });
    graph.edges.forEach(function (edge) { outgoing[edge.source].push(edge); });
    Object.keys(outgoing).forEach(function (id) {
      outgoing[id].sort(function (left, right) {
        const byTarget = left.target.localeCompare(right.target, "ru");
        return byTarget || left.id.localeCompare(right.id, "ru");
      });
    });
    return outgoing;
  }

  function incomingMap(graph) {
    const incoming = {};
    graph.nodes.forEach(function (node) { incoming[node.id] = []; });
    graph.edges.forEach(function (edge) { incoming[edge.target].push(edge); });
    Object.keys(incoming).forEach(function (id) {
      incoming[id].sort(function (left, right) {
        return left.source.localeCompare(right.source, "ru");
      });
    });
    return incoming;
  }

  function kahnTrace(rawGraph) {
    const graph = assertDirected(rawGraph);
    const ids = graph.nodes.map(function (node) { return node.id; });
    const outgoing = outgoingMap(graph);
    const indegree = {};
    ids.forEach(function (id) { indegree[id] = 0; });
    graph.edges.forEach(function (edge) { indegree[edge.target] += 1; });
    const queue = sortedIds(ids.filter(function (id) { return indegree[id] === 0; }));
    const order = [];
    const removedEdges = [];
    const frames = [];
    let unique = true;

    function push(phase, message, activeNode, activeEdge) {
      frames.push({
        algorithm: "kahn",
        phase: phase,
        message: message,
        activeNode: activeNode || null,
        activeEdge: activeEdge || null,
        queue: queue.slice(),
        order: order.slice(),
        indegree: snapshotMap(indegree, ids),
        removedEdges: removedEdges.slice(),
        stack: [],
        indices: {},
        lowlink: {},
        components: [],
      });
    }

    push("ready", "Вычислены входящие степени; в очередь помещены все нулевые вершины.");
    while (queue.length > 0) {
      if (queue.length > 1) unique = false;
      const selected = queue.shift();
      order.push(selected);
      push(
        "select",
        "Из очереди выбрана вершина " + selected + " и добавлена в порядок.",
        selected
      );
      outgoing[selected].forEach(function (edge) {
        removedEdges.push(edge.id);
        indegree[edge.target] -= 1;
        if (indegree[edge.target] === 0) {
          queue.push(edge.target);
          queue.sort(function (left, right) { return left.localeCompare(right, "ru"); });
        }
        push(
          "remove-edge",
          "Удалена дуга " + edge.source + "→" + edge.target +
            "; входящая степень " + edge.target + " теперь " + indegree[edge.target] + ".",
          edge.target,
          edge.id
        );
      });
    }
    const residualNodes = ids.filter(function (id) { return indegree[id] > 0; });
    const hasCycle = order.length !== ids.length;
    if (hasCycle) {
      unique = false;
      push(
        "cycle",
        "Очередь пуста, но остались вершины: " + residualNodes.join(", ") +
          ". Их удерживает ориентированный цикл."
      );
    } else {
      push(
        "done",
        "Получен топологический порядок " + order.join(" → ") +
          (unique ? ". На каждом шаге выбор был единственным." : ". В одном из шагов был выбор.")
      );
    }
    return shared.deepFreeze({
      algorithm: "kahn",
      graph: graph,
      order: order,
      hasCycle: hasCycle,
      unique: hasCycle ? false : unique,
      residualNodes: residualNodes,
      frames: frames,
    });
  }

  function dfsTopologicalTrace(rawGraph) {
    const graph = assertDirected(rawGraph);
    const ids = graph.nodes.map(function (node) { return node.id; });
    const outgoing = outgoingMap(graph);
    const color = {};
    const parent = {};
    const finish = [];
    const stack = [];
    const frames = [];
    let cycleEdge = null;
    ids.forEach(function (id) { color[id] = "white"; });

    function push(phase, message, activeNode, activeEdge) {
      frames.push({
        algorithm: "dfs-topological",
        phase: phase,
        message: message,
        activeNode: activeNode || null,
        activeEdge: activeEdge || null,
        colors: snapshotMap(color, ids),
        finish: finish.slice(),
        order: finish.slice().reverse(),
        queue: [],
        stack: stack.slice(),
        components: [],
        indices: {},
        lowlink: {},
      });
    }

    function visit(id) {
      color[id] = "gray";
      stack.push(id);
      push("discover", "Вершина " + id + " вошла в активный стек DFS.", id);
      for (const edge of outgoing[id]) {
        push("examine-edge", "Проверяется дуга " + edge.source + "→" + edge.target + ".", id, edge.id);
        if (color[edge.target] === "white") {
          parent[edge.target] = id;
          if (!visit(edge.target)) return false;
        } else if (color[edge.target] === "gray") {
          cycleEdge = edge.id;
          push("cycle", "Дуга ведёт в серую вершину: найден ориентированный цикл.", edge.target, edge.id);
          return false;
        }
      }
      color[id] = "black";
      stack.pop();
      finish.push(id);
      push("finish", "Обход из " + id + " завершён; вершина добавлена в список выходов.", id);
      return true;
    }

    push("ready", "Все вершины белые; запускаем DFS в фиксированном порядке.");
    for (const id of sortedIds(ids)) {
      if (color[id] === "white" && !visit(id)) break;
    }
    const hasCycle = cycleEdge !== null;
    const order = hasCycle ? [] : finish.slice().reverse();
    push(
      hasCycle ? "failed" : "done",
      hasCycle
        ? "Обратная дуга запрещает топологический порядок."
        : "Обратный порядок времени выхода даёт " + order.join(" → ") + "."
    );
    return shared.deepFreeze({
      algorithm: "dfs-topological",
      graph: graph,
      order: order,
      finish: finish,
      hasCycle: hasCycle,
      cycleEdge: cycleEdge,
      parent: parent,
      frames: frames,
    });
  }

  function isTopologicalOrder(rawGraph, rawOrder) {
    const graph = assertDirected(rawGraph);
    if (!Array.isArray(rawOrder) || rawOrder.length !== graph.nodes.length) return false;
    const position = {};
    rawOrder.forEach(function (id, index) {
      if (position[id] !== undefined) return;
      position[id] = index;
    });
    if (Object.keys(position).length !== graph.nodes.length) return false;
    if (graph.nodes.some(function (node) { return position[node.id] === undefined; })) return false;
    return graph.edges.every(function (edge) {
      return position[edge.source] < position[edge.target];
    });
  }

  function transpose(rawGraph) {
    const graph = assertDirected(rawGraph);
    return assertDirected({
      directed: true,
      nodes: graph.nodes.map(function (node) {
        return { id: node.id, label: node.label, layer: node.layer };
      }),
      edges: graph.edges.map(function (edge, index) {
        return {
          id: "transpose-" + String(index + 1),
          source: edge.target,
          target: edge.source,
          label: edge.label,
        };
      }),
    });
  }

  function normalizeComponents(graph, rawComponents) {
    if (!Array.isArray(rawComponents)) {
      throw new TypeError("Компоненты должны быть массивом массивов вершин.");
    }
    const known = new Set(graph.nodes.map(function (node) { return node.id; }));
    const seen = new Set();
    const components = rawComponents.map(function (rawComponent) {
      if (!Array.isArray(rawComponent) || rawComponent.length === 0) {
        throw new RangeError("Каждая компонента должна содержать хотя бы одну вершину.");
      }
      const component = sortedIds(rawComponent.map(function (rawId) {
        const id = shared.normalizeId(rawId, "Вершина компоненты");
        if (!known.has(id)) throw new RangeError("Неизвестная вершина компоненты: " + id + ".");
        if (seen.has(id)) throw new RangeError("Вершина повторяется в компонентах: " + id + ".");
        seen.add(id);
        return id;
      }));
      return component;
    });
    if (seen.size !== graph.nodes.length) {
      throw new RangeError("Компоненты должны покрывать все вершины графа.");
    }
    return components;
  }

  function condensationGraph(rawGraph, rawComponents) {
    const graph = assertDirected(rawGraph);
    const components = normalizeComponents(graph, rawComponents);
    const componentByNode = {};
    components.forEach(function (component, index) {
      component.forEach(function (id) { componentByNode[id] = index; });
    });
    const edgeKeys = new Set();
    const edges = [];
    graph.edges.forEach(function (edge) {
      const sourceIndex = componentByNode[edge.source];
      const targetIndex = componentByNode[edge.target];
      if (sourceIndex === targetIndex) return;
      const key = sourceIndex + ">" + targetIndex;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({
        id: "condensation-" + String(edges.length + 1),
        source: "C" + String(sourceIndex + 1),
        target: "C" + String(targetIndex + 1),
      });
    });
    const condensation = assertDirected({
      directed: true,
      nodes: components.map(function (component, index) {
        return {
          id: "C" + String(index + 1),
          label: "{" + component.join(",") + "}",
        };
      }),
      edges: edges,
    });
    if (kahnTrace(condensation).hasCycle) {
      throw new Error("Конденсация сильных компонент не может содержать цикл.");
    }
    return condensation;
  }

  function kosarajuTrace(rawGraph) {
    const graph = assertDirected(rawGraph);
    const reversed = transpose(graph);
    const ids = sortedIds(graph.nodes.map(function (node) { return node.id; }));
    const outgoing = outgoingMap(graph);
    const reversedOutgoing = outgoingMap(reversed);
    const visited = new Set();
    const finish = [];
    const components = [];
    const stack = [];
    const frames = [];

    function push(phase, message, activeNode, activeEdge) {
      frames.push({
        algorithm: "kosaraju",
        phase: phase,
        message: message,
        activeNode: activeNode || null,
        activeEdge: activeEdge || null,
        visited: sortedIds(Array.from(visited)),
        finish: finish.slice(),
        stack: stack.slice(),
        components: components.map(function (component) { return component.slice(); }),
        indices: {},
        lowlink: {},
        queue: [],
        order: [],
        transposed: phase.indexOf("second") >= 0 || phase === "transpose",
      });
    }

    function first(id) {
      visited.add(id);
      stack.push(id);
      push("first-discover", "Первый DFS входит в " + id + ".", id);
      outgoing[id].forEach(function (edge) {
        push("first-edge", "Первый DFS проверяет дугу " + edge.source + "→" + edge.target + ".", id, edge.id);
        if (!visited.has(edge.target)) first(edge.target);
      });
      stack.pop();
      finish.push(id);
      push("first-finish", "Вершина " + id + " получила очередное время выхода.", id);
    }

    push("ready", "Первый проход вычислит порядок убывания времени выхода.");
    ids.forEach(function (id) {
      if (!visited.has(id)) first(id);
    });
    visited.clear();
    stack.length = 0;
    push("transpose", "Все дуги развёрнуты; начинаем второй проход в обратном порядке выхода.");

    function second(id, component) {
      visited.add(id);
      stack.push(id);
      component.push(id);
      push("second-discover", "Во втором проходе " + id + " добавлена в текущую компоненту.", id);
      reversedOutgoing[id].forEach(function (edge) {
        push("second-edge", "Во втором проходе проверяется обращённая дуга " + edge.source + "→" + edge.target + ".", id, edge.id);
        if (!visited.has(edge.target)) second(edge.target, component);
      });
      stack.pop();
    }

    finish.slice().reverse().forEach(function (id) {
      if (visited.has(id)) return;
      const component = [];
      second(id, component);
      components.push(sortedIds(component));
      push("component", "Замкнута компонента {" + sortedIds(component).join(", ") + "}.", id);
    });
    const condensation = condensationGraph(graph, components);
    push("done", "Все компоненты найдены; их конденсация является DAG.");
    return shared.deepFreeze({
      algorithm: "kosaraju",
      graph: graph,
      transpose: reversed,
      finish: finish,
      components: components,
      condensation: condensation,
      frames: frames,
    });
  }

  function tarjanTrace(rawGraph) {
    const graph = assertDirected(rawGraph);
    const ids = sortedIds(graph.nodes.map(function (node) { return node.id; }));
    const outgoing = outgoingMap(graph);
    const indices = {};
    const lowlink = {};
    const onStack = new Set();
    const stack = [];
    const components = [];
    const frames = [];
    let nextIndex = 0;

    function push(phase, message, activeNode, activeEdge) {
      frames.push({
        algorithm: "tarjan",
        phase: phase,
        message: message,
        activeNode: activeNode || null,
        activeEdge: activeEdge || null,
        indices: snapshotMap(indices, ids),
        lowlink: snapshotMap(lowlink, ids),
        stack: stack.slice(),
        onStack: sortedIds(Array.from(onStack)),
        components: components.map(function (component) { return component.slice(); }),
        queue: [],
        order: [],
      });
    }

    function visit(id) {
      indices[id] = nextIndex;
      lowlink[id] = nextIndex;
      nextIndex += 1;
      stack.push(id);
      onStack.add(id);
      push("discover", "Вершина " + id + " получила index=low=" + indices[id] + " и помещена в стек.", id);
      outgoing[id].forEach(function (edge) {
        push("examine-edge", "Проверяется дуга " + edge.source + "→" + edge.target + ".", id, edge.id);
        if (indices[edge.target] === undefined) {
          visit(edge.target);
          lowlink[id] = Math.min(lowlink[id], lowlink[edge.target]);
          push(
            "lowlink",
            "После возврата из " + edge.target + " значение low[" + id + "] стало " + lowlink[id] + ".",
            id,
            edge.id
          );
        } else if (onStack.has(edge.target)) {
          lowlink[id] = Math.min(lowlink[id], indices[edge.target]);
          push(
            "back-edge",
            "Дуга ведёт в активную вершину; low[" + id + "] стало " + lowlink[id] + ".",
            id,
            edge.id
          );
        }
      });
      if (lowlink[id] === indices[id]) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== id);
        components.push(sortedIds(component));
        push("component", "Корень " + id + " замкнул компоненту {" + sortedIds(component).join(", ") + "}.", id);
      }
    }

    push("ready", "Индексы не назначены; стек активных вершин пуст.");
    ids.forEach(function (id) {
      if (indices[id] === undefined) visit(id);
    });
    const condensation = condensationGraph(graph, components);
    push("done", "Стек пуст; конденсация найденных компонент является DAG.");
    return shared.deepFreeze({
      algorithm: "tarjan",
      graph: graph,
      components: components,
      indices: indices,
      lowlink: lowlink,
      condensation: condensation,
      frames: frames,
    });
  }

  function componentKey(components) {
    return components.map(function (component) {
      return sortedIds(component).join("|");
    }).sort().join(";");
  }

  function samePartition(left, right) {
    return componentKey(left) === componentKey(right);
  }

  function buildRun(rawGraph, mode, algorithm) {
    const graph = assertDirected(rawGraph);
    let result;
    if (mode === "topological") {
      if (algorithm === "kahn") result = kahnTrace(graph);
      else if (algorithm === "dfs") result = dfsTopologicalTrace(graph);
      else throw new RangeError("Для топологического режима выберите Kahn или DFS.");
    } else if (mode === "scc") {
      if (algorithm === "tarjan") result = tarjanTrace(graph);
      else if (algorithm === "kosaraju") result = kosarajuTrace(graph);
      else throw new RangeError("Для режима SCC выберите Tarjan или Kosaraju–Sharir.");
    } else {
      throw new RangeError("Режим должен быть topological или scc.");
    }
    return shared.deepFreeze({
      mode: mode,
      algorithm: algorithm,
      graph: graph,
      result: result,
      playback: shared.createPlayback(result.frames),
    });
  }

  return Object.freeze({
    MAX_LAB_NODES: MAX_LAB_NODES,
    MAX_LAB_EDGES: MAX_LAB_EDGES,
    PRESETS: PRESETS,
    parseEdgeList: parseEdgeList,
    edgeText: edgeText,
    kahnTrace: kahnTrace,
    dfsTopologicalTrace: dfsTopologicalTrace,
    isTopologicalOrder: isTopologicalOrder,
    transpose: transpose,
    condensationGraph: condensationGraph,
    kosarajuTrace: kosarajuTrace,
    tarjanTrace: tarjanTrace,
    samePartition: samePartition,
    buildRun: buildRun,
  });
});
