(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasGraphLabCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_NODES = 96;
  const MAX_EDGES = 768;
  const MAX_PLAYBACK_FRAMES = 4096;
  const MAX_DSU_ITEMS = 4096;
  const MAX_TEXT_LENGTH = 160;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function boundedInteger(rawValue, label, minimum, maximum) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(
        (label || "Значение") + ": требуется целое число от " +
        minimum + " до " + maximum + "."
      );
    }
    return value;
  }

  function boundedNumber(rawValue, label, minimum, maximum) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(
        (label || "Значение") + ": требуется конечное число от " +
        minimum + " до " + maximum + "."
      );
    }
    return value;
  }

  function boundedString(rawValue, label, maximumLength, allowEmpty) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      throw new TypeError((label || "Строка") + ": требуется строка или число.");
    }
    const value = String(rawValue).trim();
    const limit = maximumLength === undefined ? MAX_TEXT_LENGTH : maximumLength;
    if ((!allowEmpty && value.length === 0) || value.length > limit) {
      throw new RangeError(
        (label || "Строка") + ": длина должна быть " +
        (allowEmpty ? "не больше " : "от 1 до ") + limit + "."
      );
    }
    return value;
  }

  function normalizeId(rawValue, label) {
    if (typeof rawValue === "number" && !Number.isSafeInteger(rawValue)) {
      throw new RangeError((label || "Идентификатор") + ": число должно быть безопасным целым.");
    }
    return boundedString(rawValue, label || "Идентификатор", 64, false);
  }

  function cloneFiniteValue(value, state, depth) {
    const currentDepth = depth || 0;
    const tracker = state || { seen: new WeakSet(), entries: 0 };
    if (currentDepth > 16) {
      throw new RangeError("Данные состояния вложены глубже безопасного предела.");
    }
    if (value === null || typeof value === "string" || typeof value === "boolean" ||
        typeof value === "undefined" || typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new RangeError("Данные состояния содержат бесконечное или неопределённое число.");
      }
      return value;
    }
    if (typeof value !== "object") {
      throw new TypeError("Данные состояния должны состоять из обычных значений, массивов и объектов.");
    }
    if (tracker.seen.has(value)) {
      throw new TypeError("Данные состояния не должны содержать циклические ссылки.");
    }
    tracker.seen.add(value);
    const output = Array.isArray(value) ? [] : {};
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Данные состояния должны использовать обычные объекты.");
      }
    }
    Object.keys(value).forEach(function (key) {
      tracker.entries += 1;
      if (tracker.entries > 20000) {
        throw new RangeError("Данные состояния превышают безопасный размер.");
      }
      output[key] = cloneFiniteValue(value[key], tracker, currentDepth + 1);
    });
    tracker.seen.delete(value);
    return output;
  }

  function edgeKey(rawSource, rawTarget, directed) {
    const source = normalizeId(rawSource, "Начало ребра");
    const target = normalizeId(rawTarget, "Конец ребра");
    const endpoints = directed || source <= target
      ? [source, target]
      : [target, source];
    return JSON.stringify([directed ? "directed" : "undirected", endpoints[0], endpoints[1]]);
  }

  function normalizeNode(rawNode, index) {
    const source = rawNode && typeof rawNode === "object" && !Array.isArray(rawNode)
      ? rawNode
      : { id: rawNode };
    const id = normalizeId(source.id, "nodes[" + index + "].id");
    const node = {
      id: id,
      label: source.label === undefined
        ? id
        : boundedString(source.label, "nodes[" + index + "].label", MAX_TEXT_LENGTH, false),
      layer: source.layer === undefined || source.layer === null
        ? null
        : boundedInteger(source.layer, "nodes[" + index + "].layer", -1000, 1000),
      partition: source.partition === undefined || source.partition === null
        ? null
        : boundedString(source.partition, "nodes[" + index + "].partition", 64, false),
    };
    if (source.data !== undefined) {
      node.data = cloneFiniteValue(source.data);
    }
    return node;
  }

  function normalizeEdge(rawEdge, index, graphDirected, nodeIds, edgeIds) {
    if (!rawEdge || typeof rawEdge !== "object" || Array.isArray(rawEdge)) {
      throw new TypeError("edges[" + index + "] должно быть объектом.");
    }
    const source = normalizeId(rawEdge.source, "edges[" + index + "].source");
    const target = normalizeId(rawEdge.target, "edges[" + index + "].target");
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new RangeError("edges[" + index + "] ссылается на неизвестную вершину.");
    }
    const directed = rawEdge.directed === undefined
      ? graphDirected
      : Boolean(rawEdge.directed);
    const id = rawEdge.id === undefined
      ? "edge-" + String(index + 1)
      : normalizeId(rawEdge.id, "edges[" + index + "].id");
    if (edgeIds.has(id)) {
      throw new RangeError("Идентификатор ребра повторяется: " + id + ".");
    }
    edgeIds.add(id);
    const edge = {
      id: id,
      source: source,
      target: target,
      directed: directed,
      key: edgeKey(source, target, directed),
      label: rawEdge.label === undefined || rawEdge.label === null
        ? ""
        : boundedString(rawEdge.label, "edges[" + index + "].label", MAX_TEXT_LENGTH, true),
      weight: null,
    };
    if (rawEdge.weight !== undefined && rawEdge.weight !== null) {
      edge.weight = typeof rawEdge.weight === "number"
        ? boundedNumber(rawEdge.weight, "edges[" + index + "].weight", -1e15, 1e15)
        : boundedString(rawEdge.weight, "edges[" + index + "].weight", 64, false);
    }
    if (rawEdge.data !== undefined) {
      edge.data = cloneFiniteValue(rawEdge.data);
    }
    return edge;
  }

  function normalizeGraph(rawGraph, options) {
    const settings = options || {};
    if (!rawGraph || typeof rawGraph !== "object" || Array.isArray(rawGraph)) {
      throw new TypeError("Граф должен быть объектом с массивами nodes и edges.");
    }
    if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
      throw new TypeError("Граф должен содержать массивы nodes и edges.");
    }
    const maxNodes = boundedInteger(
      settings.maxNodes === undefined ? MAX_NODES : settings.maxNodes,
      "maxNodes", 1, 10000
    );
    const maxEdges = boundedInteger(
      settings.maxEdges === undefined ? MAX_EDGES : settings.maxEdges,
      "maxEdges", 0, 50000
    );
    if (rawGraph.nodes.length > maxNodes) {
      throw new RangeError("Граф должен содержать от 0 до " + maxNodes + " вершин.");
    }
    if (rawGraph.edges.length > maxEdges) {
      throw new RangeError("Граф должен содержать не больше " + maxEdges + " рёбер.");
    }
    const nodes = rawGraph.nodes.map(normalizeNode);
    const nodeIds = new Set();
    nodes.forEach(function (node) {
      if (nodeIds.has(node.id)) {
        throw new RangeError("Идентификатор вершины повторяется: " + node.id + ".");
      }
      nodeIds.add(node.id);
    });
    const directed = Boolean(rawGraph.directed);
    const edgeIds = new Set();
    const edges = rawGraph.edges.map(function (edge, index) {
      return normalizeEdge(edge, index, directed, nodeIds, edgeIds);
    });
    const graph = {
      directed: directed,
      nodes: nodes,
      edges: edges,
    };
    if (rawGraph.id !== undefined) {
      graph.id = normalizeId(rawGraph.id, "graph.id");
    }
    if (rawGraph.label !== undefined) {
      graph.label = boundedString(rawGraph.label, "graph.label", MAX_TEXT_LENGTH, false);
    }
    return deepFreeze(graph);
  }

  function buildAdjacency(rawGraph, mode) {
    const graph = normalizeGraph(rawGraph);
    const direction = mode === undefined ? "all" : mode;
    if (direction !== "all" && direction !== "out" && direction !== "in") {
      throw new RangeError("Режим смежности должен быть all, out или in.");
    }
    const result = Object.create(null);
    graph.nodes.forEach(function (node) {
      result[node.id] = [];
    });
    function add(from, to, edge, relation) {
      result[from].push({ nodeId: to, edgeId: edge.id, relation: relation });
    }
    graph.edges.forEach(function (edge) {
      if (!edge.directed) {
        add(edge.source, edge.target, edge, "undirected");
        if (edge.source !== edge.target) {
          add(edge.target, edge.source, edge, "undirected");
        }
      } else if (direction === "out") {
        add(edge.source, edge.target, edge, "out");
      } else if (direction === "in") {
        add(edge.target, edge.source, edge, "in");
      } else {
        add(edge.source, edge.target, edge, "out");
        if (edge.source !== edge.target) {
          add(edge.target, edge.source, edge, "in");
        }
      }
    });
    Object.keys(result).forEach(function (id) {
      result[id].sort(function (left, right) {
        return left.nodeId.localeCompare(right.nodeId) || left.edgeId.localeCompare(right.edgeId);
      });
    });
    return deepFreeze(result);
  }

  function hashSeed(rawSeed) {
    if (typeof rawSeed === "number") {
      if (!Number.isSafeInteger(rawSeed)) {
        throw new RangeError("Seed должен быть безопасным целым числом.");
      }
      return (rawSeed >>> 0) || 0x9e3779b9;
    }
    const text = boundedString(rawSeed, "Seed", 256, false);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 0x9e3779b9;
  }

  function randomStep(rawState) {
    let state = hashSeed(rawState);
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    if (state === 0) state = 0x9e3779b9;
    return deepFreeze({ state: state, value: state / 4294967296 });
  }

  function createSeededRandom(rawSeed) {
    let state = hashSeed(rawSeed);
    function next() {
      const step = randomStep(state);
      state = step.state;
      return step.value;
    }
    function integer(minimum, maximum) {
      const min = boundedInteger(minimum, "minimum", -1000000000, 1000000000);
      const max = boundedInteger(maximum, "maximum", min, 1000000000);
      return min + Math.floor(next() * (max - min + 1));
    }
    function shuffle(rawItems) {
      if (!Array.isArray(rawItems) || rawItems.length > 10000) {
        throw new RangeError("Для перемешивания нужен массив длиной не больше 10000.");
      }
      const items = rawItems.slice();
      for (let index = items.length - 1; index > 0; index -= 1) {
        const replacement = integer(0, index);
        const temporary = items[index];
        items[index] = items[replacement];
        items[replacement] = temporary;
      }
      return items;
    }
    return Object.freeze({
      next: next,
      integer: integer,
      pick: function (items) {
        if (!Array.isArray(items) || items.length === 0 || items.length > 10000) {
          throw new RangeError("Для выбора нужен непустой ограниченный массив.");
        }
        return items[integer(0, items.length - 1)];
      },
      shuffle: shuffle,
      getState: function () { return state; },
    });
  }

  function DisjointSet(rawItems) {
    if (!(this instanceof DisjointSet)) {
      return new DisjointSet(rawItems);
    }
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_DSU_ITEMS) {
      throw new RangeError("DSU должен содержать от 1 до " + MAX_DSU_ITEMS + " элементов.");
    }
    this._ids = rawItems.map(function (item, index) {
      return normalizeId(item, "items[" + index + "]");
    });
    this._index = new Map();
    this._ids.forEach(function (id, index) {
      if (this._index.has(id)) throw new RangeError("Элемент DSU повторяется: " + id + ".");
      this._index.set(id, index);
    }, this);
    this._parent = this._ids.map(function (_, index) { return index; });
    this._rank = this._ids.map(function () { return 0; });
    this._size = this._ids.map(function () { return 1; });
    this._count = this._ids.length;
  }

  DisjointSet.prototype._knownIndex = function (rawItem) {
    const id = normalizeId(rawItem, "Элемент DSU");
    if (!this._index.has(id)) throw new RangeError("Неизвестный элемент DSU: " + id + ".");
    return this._index.get(id);
  };

  DisjointSet.prototype._rootIndex = function (index) {
    let root = index;
    while (this._parent[root] !== root) root = this._parent[root];
    while (this._parent[index] !== index) {
      const next = this._parent[index];
      this._parent[index] = root;
      index = next;
    }
    return root;
  };

  DisjointSet.prototype.find = function (rawItem) {
    return this._ids[this._rootIndex(this._knownIndex(rawItem))];
  };

  DisjointSet.prototype.union = function (rawLeft, rawRight) {
    let left = this._rootIndex(this._knownIndex(rawLeft));
    let right = this._rootIndex(this._knownIndex(rawRight));
    if (left === right) return false;
    if (this._rank[left] < this._rank[right]) {
      const temporary = left;
      left = right;
      right = temporary;
    }
    this._parent[right] = left;
    this._size[left] += this._size[right];
    this._size[right] = 0;
    if (this._rank[left] === this._rank[right]) this._rank[left] += 1;
    this._count -= 1;
    return true;
  };

  DisjointSet.prototype.connected = function (left, right) {
    return this._rootIndex(this._knownIndex(left)) === this._rootIndex(this._knownIndex(right));
  };

  DisjointSet.prototype.componentSize = function (item) {
    return this._size[this._rootIndex(this._knownIndex(item))];
  };

  DisjointSet.prototype.componentCount = function () {
    return this._count;
  };

  DisjointSet.prototype.groups = function () {
    const groups = new Map();
    this._ids.forEach(function (id, index) {
      const root = this._rootIndex(index);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(id);
    }, this);
    return deepFreeze(Array.from(groups.values(), function (group) { return group.slice(); }));
  };

  DisjointSet.prototype.snapshot = function () {
    const entries = this._ids.map(function (id, index) {
      const root = this._rootIndex(index);
      return {
        id: id,
        parent: this._ids[this._parent[index]],
        root: this._ids[root],
        rank: this._rank[index],
        size: this._size[root],
      };
    }, this);
    return deepFreeze({ componentCount: this._count, entries: entries });
  };

  function playbackState(frames, cursor) {
    return deepFreeze({
      frames: frames,
      cursor: cursor,
      current: frames[cursor],
      atStart: cursor === 0,
      finished: cursor === frames.length - 1,
    });
  }

  function createPlayback(rawFrames, options) {
    const settings = options || {};
    const maximum = boundedInteger(
      settings.maxFrames === undefined ? MAX_PLAYBACK_FRAMES : settings.maxFrames,
      "maxFrames", 1, 20000
    );
    if (!Array.isArray(rawFrames) || rawFrames.length < 1 || rawFrames.length > maximum) {
      throw new RangeError("Playback должен содержать от 1 до " + maximum + " кадров.");
    }
    const frames = deepFreeze(cloneFiniteValue(rawFrames));
    const cursor = boundedInteger(
      settings.cursor === undefined ? 0 : settings.cursor,
      "cursor", 0, frames.length - 1
    );
    return playbackState(frames, cursor);
  }

  function playbackSeek(state, rawCursor) {
    if (!state || !Array.isArray(state.frames) || state.frames.length < 1) {
      throw new TypeError("Передано некорректное состояние playback.");
    }
    const cursor = boundedInteger(rawCursor, "cursor", 0, state.frames.length - 1);
    return playbackState(state.frames, cursor);
  }

  function playbackStep(state) {
    if (state.finished) return state;
    return playbackSeek(state, state.cursor + 1);
  }

  function playbackReset(state) {
    return playbackSeek(state, 0);
  }

  return Object.freeze({
    MAX_NODES: MAX_NODES,
    MAX_EDGES: MAX_EDGES,
    MAX_PLAYBACK_FRAMES: MAX_PLAYBACK_FRAMES,
    MAX_DSU_ITEMS: MAX_DSU_ITEMS,
    deepFreeze: deepFreeze,
    boundedInteger: boundedInteger,
    boundedNumber: boundedNumber,
    boundedString: boundedString,
    normalizeId: normalizeId,
    edgeKey: edgeKey,
    normalizeGraph: normalizeGraph,
    buildAdjacency: buildAdjacency,
    hashSeed: hashSeed,
    randomStep: randomStep,
    createSeededRandom: createSeededRandom,
    DisjointSet: DisjointSet,
    createPlayback: createPlayback,
    playbackSeek: playbackSeek,
    playbackStep: playbackStep,
    playbackReset: playbackReset,
    playbackIsFinished: function (state) { return Boolean(state && state.finished); },
  });
});
