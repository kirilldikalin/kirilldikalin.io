(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DisjointSetUnionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_ITEMS = 24;
  const FIND_METHODS = Object.freeze(["compression", "splitting", "halving"]);

  function normalizeParent(rawParent) {
    if (!Array.isArray(rawParent) || rawParent.length < 1 || rawParent.length > MAX_ITEMS) {
      throw new RangeError("parent должен содержать от 1 до " + MAX_ITEMS + " элементов");
    }
    const parent = rawParent.map(function (value, index) {
      return shared.boundedInteger(value, "parent[" + index + "]", 0, rawParent.length - 1);
    });
    for (let start = 0; start < parent.length; start += 1) {
      const seen = new Set();
      let current = start;
      while (parent[current] !== current) {
        if (seen.has(current)) throw new RangeError("parent содержит цикл без корня");
        seen.add(current);
        current = parent[current];
      }
    }
    return parent;
  }

  function rootOf(parent, node) {
    let current = node;
    while (parent[current] !== current) current = parent[current];
    return current;
  }

  function depthOf(parent, node) {
    let current = node;
    let depth = 0;
    while (parent[current] !== current) {
      current = parent[current];
      depth += 1;
    }
    return depth;
  }

  function representatives(rawParent) {
    const parent = normalizeParent(rawParent);
    return Object.freeze(parent.map(function (_, node) { return rootOf(parent, node); }));
  }

  function samePartition(leftParent, rightParent) {
    const left = representatives(leftParent);
    const right = representatives(rightParent);
    if (left.length !== right.length) return false;
    for (let first = 0; first < left.length; first += 1) {
      for (let second = 0; second < left.length; second += 1) {
        if ((left[first] === left[second]) !== (right[first] === right[second])) return false;
      }
    }
    return true;
  }

  function metadata(parent) {
    const size = Array(parent.length).fill(0);
    const rank = Array(parent.length).fill(0);
    for (let node = 0; node < parent.length; node += 1) {
      const root = rootOf(parent, node);
      size[root] += 1;
      rank[root] = Math.max(rank[root], depthOf(parent, node));
    }
    return { size: size, rank: rank };
  }

  function makeForest(shape, rawSize) {
    const size = shared.boundedInteger(rawSize === undefined ? 12 : rawSize, "size", 4, MAX_ITEMS);
    const parent = Array.from({ length: size }, function (_, index) {
      if (index === 0) return 0;
      if (shape === "balanced") {
        const lowestBit = index & -index;
        return index - lowestBit;
      }
      return index - 1;
    });
    return Object.freeze(parent);
  }

  function findFrame(phase, parent, details) {
    const data = details || {};
    const info = metadata(parent);
    return shared.deepFreeze({
      phase: phase,
      parent: parent.slice(),
      rank: (data.rank || info.rank).slice(),
      size: (data.size || info.size).slice(),
      focus: data.focus === undefined ? null : data.focus,
      comparedParent: data.comparedParent === undefined ? null : data.comparedParent,
      rewritten: data.rewritten ? data.rewritten.slice() : null,
      path: (data.path || []).slice(),
      reads: data.reads || 0,
      writes: data.writes || 0,
      root: data.root === undefined ? null : data.root,
      message: data.message || "",
      finished: Boolean(data.finished),
    });
  }

  function traceFind(rawParent, rawNode, method) {
    if (!FIND_METHODS.includes(method)) throw new RangeError("неизвестный вариант FIND");
    const parent = normalizeParent(rawParent);
    const original = parent.slice();
    const historical = metadata(parent);
    const node = shared.boundedInteger(rawNode, "node", 0, parent.length - 1);
    function snapshot(phase, details) {
      return findFrame(phase, parent, Object.assign({}, details || {}, {
        rank: historical.rank,
        size: historical.size,
      }));
    }
    const frames = [snapshot("initial", {
      focus: node, message: "Начинаем FIND из выбранной вершины",
    })];
    let reads = 0;
    let writes = 0;
    const path = [];

    if (method === "compression") {
      let current = node;
      while (parent[current] !== current) {
        const next = parent[current];
        reads += 1;
        path.push(current);
        frames.push(snapshot("walk", {
          focus: current, comparedParent: next, path: path,
          reads: reads, writes: writes,
          message: "Поднимаемся к родителю и запоминаем вершину пути",
        }));
        current = next;
      }
      reads += 1;
      const root = current;
      path.push(root);
      frames.push(snapshot("root", {
        focus: root, path: path, reads: reads, writes: writes, root: root,
        message: "Корень найден; начинается обратный проход сжатия",
      }));
      for (let index = 0; index < path.length - 1; index += 1) {
        const rewritten = path[index];
        if (parent[rewritten] !== root) {
          const before = parent[rewritten];
          parent[rewritten] = root;
          writes += 1;
          frames.push(snapshot("compress", {
            focus: rewritten, rewritten: [rewritten, before, root], path: path,
            reads: reads, writes: writes, root: root,
            message: "Перенаправляем вершину непосредственно к корню",
          }));
        }
      }
      frames.push(snapshot("done", {
        focus: node, path: path, reads: reads, writes: writes, root: root,
        finished: true, message: "Полное сжатие пути завершено",
      }));
    } else if (method === "splitting") {
      let current = node;
      const path = [current];
      while (parent[current] !== current) {
        const before = parent[current];
        const grandparent = parent[before];
        reads += 2;
        if (parent[current] !== grandparent) {
          parent[current] = grandparent;
          writes += 1;
        }
        frames.push(snapshot("split", {
          focus: current, rewritten: [current, before, grandparent], path: path,
          reads: reads, writes: writes,
          message: "Текущая вершина перепрыгивает через родителя",
        }));
        current = before;
        path.push(current);
      }
      frames.push(snapshot("done", {
        focus: current, path: path, reads: reads + 1, writes: writes, root: current,
        finished: true, message: "Path splitting дошёл до корня",
      }));
    } else {
      let current = node;
      const path = [current];
      while (parent[current] !== current) {
        const before = parent[current];
        const grandparent = parent[before];
        reads += 2;
        if (parent[current] !== grandparent) {
          parent[current] = grandparent;
          writes += 1;
        }
        frames.push(snapshot("halve", {
          focus: current, rewritten: [current, before, grandparent], path: path,
          reads: reads, writes: writes,
          message: "Перепрыгиваем через одну вершину и продолжаем с нового родителя",
        }));
        current = grandparent;
        path.push(current);
      }
      frames.push(snapshot("done", {
        focus: current, path: path, reads: reads + 1, writes: writes, root: current,
        finished: true, message: "Path halving дошёл до корня",
      }));
    }

    if (!samePartition(original, parent)) throw new Error("FIND изменил разбиение множеств");
    return shared.deepFreeze(frames);
  }

  function unionFrame(phase, parent, rank, size, details) {
    return findFrame(phase, parent, Object.assign({}, details || {}, { rank: rank, size: size }));
  }

  function twoSetForest(rawSize) {
    const size = shared.boundedInteger(rawSize === undefined ? 12 : rawSize, "size", 4, MAX_ITEMS);
    const split = Math.floor(size / 2);
    const parent = Array.from({ length: size }, function (_, index) { return index < split ? 0 : split; });
    const rank = Array(size).fill(0);
    const sizes = Array(size).fill(0);
    sizes[0] = split;
    sizes[split] = size - split;
    rank[0] = Math.floor(Math.log2(sizes[0]));
    rank[split] = Math.floor(Math.log2(sizes[split]));
    return { parent: parent, rank: rank, size: sizes, roots: [0, split] };
  }

  function traceUnion(policy, rawSize) {
    if (policy !== "rank" && policy !== "size") throw new RangeError("неизвестная политика UNION");
    const data = twoSetForest(rawSize);
    const parent = data.parent.slice();
    const rank = data.rank.slice();
    const size = data.size.slice();
    let first = data.roots[0];
    let second = data.roots[1];
    const frames = [unionFrame("initial", parent, rank, size, {
      activeIndices: [first, second], message: "Два дерева представляют два непересекающихся множества",
    })];
    const firstWeight = policy === "rank" ? rank[first] : size[first];
    const secondWeight = policy === "rank" ? rank[second] : size[second];
    if (firstWeight < secondWeight) {
      const temporary = first;
      first = second;
      second = temporary;
    }
    frames.push(unionFrame("compare-roots", parent, rank, size, {
      focus: first, comparedParent: second,
      message: policy === "rank" ? "Сравниваем ранги корней" : "Сравниваем размеры множеств",
    }));
    const equalRank = rank[first] === rank[second];
    parent[second] = first;
    size[first] += size[second];
    size[second] = 0;
    if (policy === "rank" && equalRank) rank[first] += 1;
    frames.push(unionFrame("done", parent, rank, size, {
      focus: first, rewritten: [second, second, first], root: first, writes: 1,
      finished: true,
      message: policy === "rank"
        ? (equalRank
          ? "При равных рангах один корень присоединён к другому; ранг победителя увеличен"
          : "Корень меньшего ранга присоединён к корню большего ранга")
        : "Корень меньшего множества присоединён к корню большего",
    }));
    return shared.deepFreeze(frames);
  }

  function createFindState(options) {
    const settings = options || {};
    const parent = makeForest(settings.shape === "balanced" ? "balanced" : "chain", settings.size);
    const node = settings.node === undefined ? parent.length - 1 : settings.node;
    const method = FIND_METHODS.includes(settings.method) ? settings.method : "compression";
    const frames = traceFind(parent, node, method);
    return shared.deepFreeze({
      operation: "find", method: method, originalParent: parent,
      frames: frames, cursor: 0, finished: frames.length === 1,
    });
  }

  function createUnionState(options) {
    const settings = options || {};
    const policy = settings.policy === "size" ? "size" : "rank";
    const frames = traceUnion(policy, settings.size);
    return shared.deepFreeze({
      operation: "union", method: policy, originalParent: frames[0].parent,
      frames: frames, cursor: 0, finished: frames.length === 1,
    });
  }

  function createState(operation, options) {
    return operation === "union" ? createUnionState(options) : createFindState(options);
  }

  function step(state) {
    if (state.finished) return state;
    const cursor = Math.min(state.frames.length - 1, state.cursor + 1);
    return shared.deepFreeze({
      operation: state.operation, method: state.method, originalParent: state.originalParent,
      frames: state.frames, cursor: cursor, finished: cursor >= state.frames.length - 1,
    });
  }

  function practicalInverseAckermannLevel(rawValue) {
    const value = shared.boundedInteger(rawValue, "n", 1, Number.MAX_SAFE_INTEGER);
    if (value <= 1) return 0;
    if (value <= 2) return 1;
    if (value <= 4) return 2;
    if (value <= 65536) return 3;
    return 4;
  }

  function visualModel(state) {
    const current = state.frames[state.cursor];
    const beforeDepths = state.originalParent.map(function (_, node) { return depthOf(state.originalParent, node); });
    const currentDepths = current.parent.map(function (_, node) { return depthOf(current.parent, node); });
    const componentCount = new Set(representatives(current.parent)).size;
    const semanticsValid = state.operation === "union"
      ? componentCount === (current.finished ? 1 : 2)
      : samePartition(state.originalParent, current.parent);
    return shared.deepFreeze({
      operation: state.operation, method: state.method,
      cursor: state.cursor, frameCount: state.frames.length,
      current: current, beforeDepths: beforeDepths, currentDepths: currentDepths,
      maxDepthBefore: Math.max.apply(null, beforeDepths),
      maxDepthNow: Math.max.apply(null, currentDepths),
      componentCount: componentCount,
      semanticsValid: semanticsValid,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    FIND_METHODS: FIND_METHODS,
    normalizeParent: normalizeParent,
    rootOf: rootOf,
    depthOf: depthOf,
    representatives: representatives,
    samePartition: samePartition,
    makeForest: makeForest,
    traceFind: traceFind,
    traceUnion: traceUnion,
    createFindState: createFindState,
    createUnionState: createUnionState,
    createState: createState,
    step: step,
    practicalInverseAckermannLevel: practicalInverseAckermannLevel,
    visualModel: visualModel,
  };
});
