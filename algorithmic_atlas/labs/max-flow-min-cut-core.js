(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./graph-lab-core.js")
    : root.AtlasGraphLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaxFlowMinCutCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGraphLabCore is unavailable");

  const MODES = Object.freeze(["ford-fulkerson", "edmonds-karp", "dinic"]);
  const MAX_NODES = 18;
  const MAX_EDGES = 54;
  const MAX_CAPACITY_DIGITS = 40;
  const MAX_AUGMENTATIONS = 1024;
  const MAX_FRAMES = 4096;

  const PRESETS = shared.deepFreeze({
    classic: {
      label: "Классическая сеть",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "c", "d", "t"],
      edges: [
        ["s", "a", "10"], ["s", "c", "10"], ["a", "b", "4"],
        ["a", "c", "2"], ["a", "d", "8"], ["c", "d", "9"],
        ["d", "b", "6"], ["b", "t", "10"], ["d", "t", "10"],
      ],
    },
    cancellation: {
      label: "Обратное ребро исправляет выбор",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "t"],
      edges: [
        ["s", "a", "1"], ["s", "b", "1"], ["a", "b", "1"],
        ["a", "t", "1"], ["b", "t", "1"],
      ],
    },
    parallelZero: {
      label: "Параллельные и нулевые дуги",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "t"],
      edges: [
        ["s", "a", "4"], ["s", "a", "3"], ["s", "b", "0"],
        ["a", "b", "2"], ["a", "t", "5"], ["b", "t", "2"],
      ],
    },
    unreachable: {
      label: "Сток недостижим",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "t"],
      edges: [["s", "a", "7"], ["a", "b", "5"], ["t", "b", "9"]],
    },
    multiple: {
      label: "Несколько максимальных потоков",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "c", "t"],
      edges: [
        ["s", "a", "4"], ["s", "b", "4"], ["a", "c", "4"],
        ["b", "c", "4"], ["a", "b", "4"], ["c", "t", "6"],
      ],
    },
    huge: {
      label: "Точные большие ёмкости",
      source: "s",
      sink: "t",
      vertices: ["s", "a", "b", "t"],
      edges: [
        ["s", "a", "900719925474099312345678"],
        ["s", "b", "800000000000000000000000"],
        ["a", "t", "900719925474099312345678"],
        ["b", "t", "800000000000000000000000"],
      ],
    },
  });

  function modeName(raw) {
    const mode = String(raw || "edmonds-karp").trim().toLowerCase();
    if (!MODES.includes(mode)) {
      throw new RangeError("Режим должен быть ford-fulkerson, edmonds-karp или dinic.");
    }
    return mode;
  }

  function parseCapacity(raw, label) {
    if (typeof raw === "number") {
      if (!Number.isSafeInteger(raw)) {
        throw new RangeError((label || "Ёмкость") + ": большие целые вводите строкой.");
      }
      raw = String(raw);
    }
    if (typeof raw !== "string" || !/^\+?\d+$/.test(raw.trim())) {
      throw new RangeError((label || "Ёмкость") + ": требуется неотрицательное целое число.");
    }
    const text = raw.trim().replace(/^\+/, "");
    const digits = text.replace(/^0+(?=\d)/, "");
    if (digits.length > MAX_CAPACITY_DIGITS) {
      throw new RangeError((label || "Ёмкость") + ": не больше " + MAX_CAPACITY_DIGITS + " цифр.");
    }
    return BigInt(text);
  }

  function normalizeNetwork(rawNetwork) {
    const raw = rawNetwork || {};
    const preparedEdges = Array.isArray(raw.edges) ? raw.edges.map(function (edge) {
      const copy = Object.assign({}, edge);
      if (copy.capacity !== undefined && copy.capacity !== null) copy.weight = copy.capacity;
      return copy;
    }) : raw.edges;
    const base = shared.normalizeGraph({
      id: raw.id || "flow-network",
      label: raw.label || "Сеть потока",
      directed: true,
      nodes: raw.nodes,
      edges: preparedEdges,
    }, { maxNodes: MAX_NODES, maxEdges: MAX_EDGES });
    if (base.nodes.length < 2) throw new RangeError("Сеть должна содержать хотя бы две вершины.");
    const edges = base.edges.map(function (edge) {
      if (edge.source === edge.target) {
        throw new RangeError("Петля " + edge.id + " не используется в этой лаборатории.");
      }
      const rawCapacity = edge.weight;
      const capacity = parseCapacity(
        rawCapacity === null || rawCapacity === "" ? "0" : rawCapacity,
        "Ёмкость дуги " + edge.id
      );
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        capacity: capacity.toString(),
        weight: capacity.toString(),
        directed: true,
      };
    });
    return shared.deepFreeze({
      id: base.id,
      label: base.label,
      directed: true,
      nodes: base.nodes.map(function (node) {
        return { id: node.id, label: node.label, layer: node.layer, partition: node.partition };
      }),
      edges: edges,
    });
  }

  function networkFromPreset(rawPreset) {
    const id = String(rawPreset || "classic");
    const preset = PRESETS[id];
    if (!preset) throw new RangeError("Неизвестный сценарий: " + id + ".");
    return normalizeNetwork({
      id: id,
      label: preset.label,
      nodes: preset.vertices.map(function (vertex, index) {
        return { id: vertex, label: vertex, layer: vertex === preset.source ? 0 : vertex === preset.sink ? 3 : 1 + (index % 2) };
      }),
      edges: preset.edges.map(function (edge, index) {
        return { id: "e" + String(index + 1), source: edge[0], target: edge[1], capacity: edge[2] };
      }),
    });
  }

  function networkText(rawNetwork) {
    const network = normalizeNetwork(rawNetwork);
    return shared.deepFreeze({
      vertices: network.nodes.map(function (node) { return node.id; }).join(", "),
      edges: network.edges.map(function (edge) {
        return edge.source + " " + edge.target + " " + edge.capacity;
      }).join("; "),
    });
  }

  function parseNetworkText(rawVertices, rawEdges) {
    const vertices = String(rawVertices || "").split(/[\s,;]+/)
      .map(function (item) { return item.trim(); }).filter(Boolean);
    if (vertices.length > MAX_NODES) throw new RangeError("Допустимо не больше " + MAX_NODES + " вершин.");
    const lines = String(rawEdges || "").split(/[;\n]+/)
      .map(function (item) { return item.trim(); }).filter(Boolean);
    if (lines.length > MAX_EDGES) throw new RangeError("Допустимо не больше " + MAX_EDGES + " дуг.");
    return normalizeNetwork({
      nodes: vertices.map(function (id) { return { id: id, label: id }; }),
      edges: lines.map(function (line, index) {
        const parts = line.split(/[\s,]+/).filter(Boolean);
        if (parts.length !== 3) {
          throw new RangeError("Дуга " + String(index + 1) + ": формат «начало конец ёмкость».");
        }
        return {
          id: "e" + String(index + 1),
          source: parts[0], target: parts[1],
          capacity: parseCapacity(parts[2], "Ёмкость дуги " + String(index + 1)).toString(),
        };
      }),
    });
  }

  function endpoint(network, raw, fallback, label) {
    const value = String(raw === undefined ? fallback : raw).trim();
    if (!network.nodes.some(function (node) { return node.id === value; })) {
      throw new RangeError((label || "Вершина") + " «" + value + "» отсутствует в сети.");
    }
    return value;
  }

  function zeroFlow(network) {
    const result = {};
    network.edges.forEach(function (edge) { result[edge.id] = 0n; });
    return result;
  }

  function cloneFlow(flow) {
    const result = {};
    Object.keys(flow).forEach(function (id) { result[id] = BigInt(flow[id]); });
    return result;
  }

  function residualArcs(rawNetwork, rawFlow, includeZero) {
    const network = normalizeNetwork(rawNetwork);
    const flow = rawFlow || zeroFlow(network);
    const arcs = [];
    network.edges.forEach(function (edge, index) {
      const capacity = BigInt(edge.capacity);
      const value = flow[edge.id] === undefined ? 0n : BigInt(flow[edge.id]);
      if (value < 0n || value > capacity) {
        throw new RangeError("Поток на дуге " + edge.id + " нарушает ограничение ёмкости.");
      }
      const forward = capacity - value;
      const reverse = value;
      if (includeZero || forward > 0n) {
        arcs.push({
          id: edge.id + ":forward", edgeId: edge.id, source: edge.source,
          target: edge.target, kind: "forward", capacity: forward, order: index * 2,
        });
      }
      if (includeZero || reverse > 0n) {
        arcs.push({
          id: edge.id + ":reverse", edgeId: edge.id, source: edge.target,
          target: edge.source, kind: "reverse", capacity: reverse, order: index * 2 + 1,
        });
      }
    });
    return arcs;
  }

  function positiveResidual(network, flow, reverseOrder) {
    const arcs = residualArcs(network, flow, false);
    arcs.sort(function (a, b) { return reverseOrder ? b.order - a.order : a.order - b.order; });
    return arcs;
  }

  function adjacency(network, flow, reverseOrder, allowed) {
    const result = new Map();
    network.nodes.forEach(function (node) { result.set(node.id, []); });
    positiveResidual(network, flow, reverseOrder).forEach(function (arc) {
      if (!allowed || allowed(arc)) result.get(arc.source).push(arc);
    });
    return result;
  }

  function reconstruct(predecessor, source, sink) {
    if (!predecessor.has(sink)) return null;
    const arcs = [];
    let current = sink;
    while (current !== source) {
      const arc = predecessor.get(current);
      if (!arc) return null;
      arcs.push(arc);
      current = arc.source;
      if (arcs.length > predecessor.size + 1) throw new Error("Цикл в цепочке предшественников.");
    }
    arcs.reverse();
    return arcs;
  }

  function findPathBfs(network, flow, source, sink) {
    const graph = adjacency(network, flow, false);
    const queue = [source];
    const seen = new Set([source]);
    const predecessor = new Map();
    for (let index = 0; index < queue.length; index += 1) {
      const vertex = queue[index];
      const arcs = graph.get(vertex) || [];
      for (let i = 0; i < arcs.length; i += 1) {
        const arc = arcs[i];
        if (seen.has(arc.target)) continue;
        seen.add(arc.target);
        predecessor.set(arc.target, arc);
        queue.push(arc.target);
        if (arc.target === sink) return { arcs: reconstruct(predecessor, source, sink), visited: queue.slice() };
      }
    }
    return { arcs: null, visited: queue.slice() };
  }

  function findPathDfs(network, flow, source, sink, reverseOrder, levels) {
    const graph = adjacency(network, flow, reverseOrder, levels ? function (arc) {
      return levels[arc.source] !== null && levels[arc.target] === levels[arc.source] + 1;
    } : null);
    const seen = new Set();
    const path = [];
    function visit(vertex) {
      if (vertex === sink) return true;
      seen.add(vertex);
      const arcs = graph.get(vertex) || [];
      for (let index = 0; index < arcs.length; index += 1) {
        const arc = arcs[index];
        if (seen.has(arc.target)) continue;
        path.push(arc);
        if (visit(arc.target)) return true;
        path.pop();
      }
      return false;
    }
    return { arcs: visit(source) ? path.slice() : null, visited: Array.from(seen) };
  }

  function levelGraph(network, flow, source) {
    const graph = adjacency(network, flow, false);
    const levels = {};
    network.nodes.forEach(function (node) { levels[node.id] = null; });
    levels[source] = 0;
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const vertex = queue[index];
      (graph.get(vertex) || []).forEach(function (arc) {
        if (levels[arc.target] !== null) return;
        levels[arc.target] = levels[vertex] + 1;
        queue.push(arc.target);
      });
    }
    return { levels: levels, queue: queue };
  }

  function bottleneck(path) {
    if (!path || !path.length) throw new RangeError("Увеличивающий путь пуст.");
    return path.reduce(function (minimum, arc) {
      return minimum === null || arc.capacity < minimum ? arc.capacity : minimum;
    }, null);
  }

  function augment(flow, path, delta) {
    const result = cloneFlow(flow);
    path.forEach(function (arc) {
      if (arc.kind === "forward") result[arc.edgeId] += delta;
      else result[arc.edgeId] -= delta;
    });
    return result;
  }

  function flowValue(rawNetwork, rawFlow, source) {
    const network = normalizeNetwork(rawNetwork);
    const flow = rawFlow || zeroFlow(network);
    let value = 0n;
    network.edges.forEach(function (edge) {
      const amount = BigInt(flow[edge.id] || 0n);
      if (edge.source === source) value += amount;
      if (edge.target === source) value -= amount;
    });
    return value;
  }

  function validateFlow(rawNetwork, rawFlow, source, sink) {
    const network = normalizeNetwork(rawNetwork);
    const flow = rawFlow || zeroFlow(network);
    const balance = {};
    network.nodes.forEach(function (node) { balance[node.id] = 0n; });
    for (let index = 0; index < network.edges.length; index += 1) {
      const edge = network.edges[index];
      const amount = flow[edge.id] === undefined ? 0n : BigInt(flow[edge.id]);
      const capacity = BigInt(edge.capacity);
      if (amount < 0n || amount > capacity) {
        return { valid: false, reason: "Дуга " + edge.id + " нарушает 0 ≤ f(e) ≤ c(e)." };
      }
      balance[edge.source] -= amount;
      balance[edge.target] += amount;
    }
    const value = flowValue(network, flow, source);
    for (let index = 0; index < network.nodes.length; index += 1) {
      const vertex = network.nodes[index].id;
      if (vertex !== source && vertex !== sink && balance[vertex] !== 0n) {
        return { valid: false, reason: "В вершине " + vertex + " нарушено сохранение потока." };
      }
    }
    if (-balance[source] !== value || balance[sink] !== value) {
      return { valid: false, reason: "Значение у истока и стока не совпадает." };
    }
    return { valid: true, reason: "Ограничения ёмкости и сохранения выполнены.", value: value.toString() };
  }

  function reachableCut(rawNetwork, rawFlow, source, sink) {
    const network = normalizeNetwork(rawNetwork);
    const graph = adjacency(network, rawFlow || zeroFlow(network), false);
    const queue = [source];
    const reached = new Set([source]);
    for (let index = 0; index < queue.length; index += 1) {
      (graph.get(queue[index]) || []).forEach(function (arc) {
        if (!reached.has(arc.target)) {
          reached.add(arc.target);
          queue.push(arc.target);
        }
      });
    }
    const sourceSide = network.nodes.map(function (node) { return node.id; }).filter(function (id) { return reached.has(id); });
    const sinkSide = network.nodes.map(function (node) { return node.id; }).filter(function (id) { return !reached.has(id); });
    let capacity = 0n;
    network.edges.forEach(function (edge) {
      if (reached.has(edge.source) && !reached.has(edge.target)) capacity += BigInt(edge.capacity);
    });
    return {
      sourceSide: sourceSide,
      sinkSide: sinkSide,
      capacity: capacity.toString(),
      isSeparating: !reached.has(sink),
    };
  }

  function pathVertices(path, source) {
    if (!path || !path.length) return [source];
    return [source].concat(path.map(function (arc) { return arc.target; }));
  }

  function serializeFlow(flow) {
    const result = {};
    Object.keys(flow).forEach(function (id) { result[id] = BigInt(flow[id]).toString(); });
    return result;
  }

  function serializeArcs(network, flow) {
    return residualArcs(network, flow, true).map(function (arc) {
      return {
        id: arc.id, edgeId: arc.edgeId, source: arc.source, target: arc.target,
        kind: arc.kind, capacity: arc.capacity.toString(), order: arc.order,
      };
    });
  }

  function makeFrame(network, flow, source, sink, details) {
    const path = details.path || null;
    const cut = reachableCut(network, flow, source, sink);
    return shared.deepFreeze({
      phase: details.phase,
      algorithmPhase: details.algorithmPhase || details.phase,
      message: details.message,
      augmentation: details.augmentation || 0,
      value: flowValue(network, flow, source).toString(),
      flows: serializeFlow(flow),
      residual: serializeArcs(network, flow),
      activeArcIds: path ? path.map(function (arc) { return arc.id; }) : [],
      activeEdgeIds: path ? path.map(function (arc) { return arc.edgeId; }) : [],
      activePathVertices: pathVertices(path, source),
      usesReverseArc: Boolean(path && path.some(function (arc) { return arc.kind === "reverse"; })),
      bottleneck: details.bottleneck === undefined || details.bottleneck === null
        ? null : BigInt(details.bottleneck).toString(),
      queue: (details.queue || []).slice(),
      levels: details.levels ? Object.assign({}, details.levels) : null,
      cut: cut,
      stoppedByLimit: Boolean(details.stoppedByLimit),
    });
  }

  function buildFrames(network, source, sink, mode, options) {
    let flow = zeroFlow(network);
    const frames = [makeFrame(network, flow, source, sink, {
      phase: "start",
      message: "Поток равен нулю. Остаточная сеть сначала совпадает с положительными ёмкостями исходной сети.",
    })];
    let augmentation = 0;
    let phase = 0;
    const maxAugmentations = Math.min(
      MAX_AUGMENTATIONS,
      Number.isInteger(options.maxAugmentations) && options.maxAugmentations > 0
        ? options.maxAugmentations : MAX_AUGMENTATIONS
    );

    function appendPath(path, details) {
      const delta = bottleneck(path);
      flow = augment(flow, path, delta);
      augmentation += 1;
      frames.push(makeFrame(network, flow, source, sink, {
        phase: "augment",
        algorithmPhase: details.algorithmPhase,
        message: "По пути " + pathVertices(path, source).join(" → ") + " отправлено " + delta.toString() + "." +
          (path.some(function (arc) { return arc.kind === "reverse"; }) ? " Обратная дуга отменила часть прежнего выбора." : ""),
        augmentation: augmentation,
        path: path,
        bottleneck: delta,
        queue: details.queue,
        levels: details.levels,
      }));
    }

    while (augmentation < maxAugmentations && frames.length < MAX_FRAMES - 2) {
      if (mode === "dinic") {
        const level = levelGraph(network, flow, source);
        phase += 1;
        frames.push(makeFrame(network, flow, source, sink, {
          phase: "level",
          algorithmPhase: "level-graph",
          message: level.levels[sink] === null
            ? "Новая слоистая сеть не достигает стока. Увеличивающих путей больше нет."
            : "Построена слоистая сеть: разрешены только дуги, ведущие на следующий уровень.",
          augmentation: augmentation,
          queue: level.queue,
          levels: level.levels,
        }));
        if (level.levels[sink] === null) break;
        let inBlockingFlow = 0;
        while (augmentation < maxAugmentations && frames.length < MAX_FRAMES - 2) {
          const found = findPathDfs(network, flow, source, sink, false, level.levels);
          if (!found.arcs) break;
          appendPath(found.arcs, {
            algorithmPhase: "blocking-flow-" + String(phase),
            queue: found.visited,
            levels: level.levels,
          });
          inBlockingFlow += 1;
        }
        frames.push(makeFrame(network, flow, source, sink, {
          phase: "blocking",
          algorithmPhase: "blocking-flow-complete",
          message: "Блокирующий поток фазы " + String(phase) + " завершён: добавлений внутри слоя — " + String(inBlockingFlow) + ".",
          augmentation: augmentation,
          levels: level.levels,
        }));
        continue;
      }

      const found = mode === "edmonds-karp"
        ? findPathBfs(network, flow, source, sink)
        : findPathDfs(network, flow, source, sink, options.pathOrder === "reverse", null);
      if (!found.arcs) break;
      appendPath(found.arcs, {
        algorithmPhase: mode === "edmonds-karp" ? "shortest-residual-path" : "chosen-residual-path",
        queue: found.visited,
      });
    }

    const cut = reachableCut(network, flow, source, sink);
    const stoppedByLimit = augmentation >= maxAugmentations && !cut.isSeparating;
    frames.push(makeFrame(network, flow, source, sink, {
      phase: stoppedByLimit ? "limit" : "finish",
      message: stoppedByLimit
        ? "Выполнение остановлено безопасным пределом добавлений; это ещё не сертификат максимальности."
        : "Сток недостижим в остаточной сети. Достижимая сторона задаёт минимальный разрез и сертификат максимальности.",
      augmentation: augmentation,
      stoppedByLimit: stoppedByLimit,
    }));
    return frames;
  }

  function wrapState(meta, playback) {
    return Object.freeze({
      mode: meta.mode,
      network: meta.network,
      source: meta.source,
      sink: meta.sink,
      pathOrder: meta.pathOrder,
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
    const presetId = settings.preset || "classic";
    const network = settings.network ? normalizeNetwork(settings.network) : networkFromPreset(presetId);
    const preset = PRESETS[presetId] || {};
    const fallbackSource = preset.source || network.nodes[0].id;
    const fallbackSink = preset.sink || network.nodes[network.nodes.length - 1].id;
    const source = endpoint(network, settings.source, fallbackSource, "Источник");
    const sink = endpoint(network, settings.sink, fallbackSink, "Сток");
    if (source === sink) throw new RangeError("Источник и сток должны различаться.");
    const pathOrder = settings.pathOrder === "reverse" ? "reverse" : "input";
    const frames = buildFrames(network, source, sink, mode, {
      pathOrder: pathOrder,
      maxAugmentations: settings.maxAugmentations,
    });
    return wrapState({ mode: mode, network: network, source: source, sink: sink, pathOrder: pathOrder },
      shared.createPlayback(frames, { maxFrames: MAX_FRAMES }));
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
      if (guard > MAX_FRAMES) throw new Error("Превышен предел кадров выполнения.");
    }
    return result;
  }

  return Object.freeze({
    MODES: MODES,
    PRESETS: PRESETS,
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_CAPACITY_DIGITS: MAX_CAPACITY_DIGITS,
    MAX_AUGMENTATIONS: MAX_AUGMENTATIONS,
    parseCapacity: parseCapacity,
    normalizeNetwork: normalizeNetwork,
    networkFromPreset: networkFromPreset,
    networkText: networkText,
    parseNetworkText: parseNetworkText,
    residualArcs: residualArcs,
    findPathBfs: findPathBfs,
    levelGraph: levelGraph,
    bottleneck: bottleneck,
    augment: augment,
    flowValue: flowValue,
    validateFlow: validateFlow,
    reachableCut: reachableCut,
    createState: createState,
    step: step,
    runToEnd: runToEnd,
  });
});
