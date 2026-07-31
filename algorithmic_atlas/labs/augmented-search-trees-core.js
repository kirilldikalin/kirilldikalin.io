(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AugmentedSearchTreesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_ITEMS = 15;

  function normalizeValues(rawValues) {
    const values = rawValues === undefined ? [4, 8, 13, 19, 23, 31, 37, 44, 52] : rawValues;
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_ITEMS) {
      throw new RangeError("values: требуется от 1 до " + MAX_ITEMS + " ключей");
    }
    const normalized = values.map(function (value) { return shared.boundedInteger(value, "key", -999, 999); });
    if (new Set(normalized).size !== normalized.length) throw new RangeError("values: ключи должны быть уникальны");
    return Object.freeze(normalized.sort(function (a, b) { return a - b; }));
  }

  function normalizeIntervals(rawIntervals) {
    const intervals = rawIntervals === undefined
      ? [[2, 6], [5, 11], [9, 14], [13, 18], [17, 24], [21, 23], [26, 31]]
      : rawIntervals;
    if (!Array.isArray(intervals) || intervals.length < 1 || intervals.length > MAX_ITEMS) {
      throw new RangeError("intervals: требуется от 1 до " + MAX_ITEMS + " интервалов");
    }
    const normalized = intervals.map(function (interval) {
      if (!Array.isArray(interval) || interval.length !== 2) throw new RangeError("interval must have two endpoints");
      const low = shared.boundedInteger(interval[0], "low", -999, 999);
      const high = shared.boundedInteger(interval[1], "high", low, 999);
      return [low, high];
    }).sort(function (left, right) { return left[0] - right[0]; });
    if (new Set(normalized.map(function (interval) { return interval[0]; })).size !== normalized.length) {
      throw new RangeError("intervals: левые границы должны быть уникальны");
    }
    return shared.deepFreeze(normalized);
  }

  function cloneNodes(nodes) {
    const copy = {};
    Object.keys(nodes).forEach(function (id) {
      copy[id] = Object.assign({}, nodes[id], nodes[id].interval ? { interval: nodes[id].interval.slice() } : {});
    });
    return copy;
  }

  function buildBalanced(items, kind) {
    const nodes = {};
    let serial = 0;
    function build(left, right, parent) {
      if (left >= right) return null;
      const middle = Math.floor((left + right) / 2);
      const id = "n" + serial;
      serial += 1;
      const item = items[middle];
      nodes[id] = {
        id: id,
        key: kind === "interval" ? item[0] : item,
        interval: kind === "interval" ? item.slice() : null,
        left: null,
        right: null,
        parent: parent,
        size: 1,
        max: kind === "interval" ? item[1] : null,
      };
      nodes[id].left = build(left, middle, id);
      nodes[id].right = build(middle + 1, right, id);
      recomputeNode(nodes, id, kind);
      return id;
    }
    const rootId = build(0, items.length, null);
    return { nodes: nodes, rootId: rootId };
  }

  function recomputeNode(nodes, id, kind) {
    if (id === null) return;
    const node = nodes[id];
    if (kind === "order") {
      node.size = 1 + (node.left ? nodes[node.left].size : 0) + (node.right ? nodes[node.right].size : 0);
    } else {
      node.max = Math.max(
        node.interval[1],
        node.left ? nodes[node.left].max : -Infinity,
        node.right ? nodes[node.right].max : -Infinity
      );
    }
  }

  function frame(kind, nodes, rootId, event, activeId, path, recomputedIds, result) {
    return shared.deepFreeze({
      mode: kind,
      nodes: cloneNodes(nodes),
      rootId: rootId,
      event: event,
      activeId: activeId || null,
      path: (path || []).slice(),
      recomputedIds: (recomputedIds || []).slice(),
      result: result === undefined ? null : result,
    });
  }

  function orderTrace(rawValues, operation, rawTarget) {
    const values = normalizeValues(rawValues);
    const tree = buildBalanced(values, "order");
    const frames = [frame("order", tree.nodes, tree.rootId, "Каждый узел хранит размер своего поддерева", null, [], [], null)];
    if (operation === "insert") {
      const target = shared.boundedInteger(rawTarget === undefined ? 17 : rawTarget, "insert key", -999, 999);
      if (values.includes(target)) throw new RangeError("insert key already exists");
      let cursor = tree.rootId;
      let parent = null;
      const path = [];
      while (cursor !== null) {
        path.push(cursor);
        parent = cursor;
        cursor = target < tree.nodes[cursor].key ? tree.nodes[cursor].left : tree.nodes[cursor].right;
      }
      const id = "new";
      tree.nodes[id] = { id: id, key: target, interval: null, left: null, right: null, parent: parent, size: 1, max: null };
      if (target < tree.nodes[parent].key) tree.nodes[parent].left = id;
      else tree.nodes[parent].right = id;
      frames.push(frame("order", tree.nodes, tree.rootId, "Новый лист получает size=1", id, path.concat([id]), [id], null));
      const recomputed = [id];
      cursor = parent;
      while (cursor !== null) {
        recomputeNode(tree.nodes, cursor, "order");
        recomputed.push(cursor);
        frames.push(frame("order", tree.nodes, tree.rootId, "Пересчитан size узла " + tree.nodes[cursor].key, cursor, path, recomputed, null));
        cursor = tree.nodes[cursor].parent;
      }
      frames.push(frame("order", tree.nodes, tree.rootId, "Все агрегаты на пути к корню согласованы", id, path, recomputed, target));
      return shared.deepFreeze({ mode: "order", operation: operation, frames: frames });
    }

    if (operation === "rank") {
      const target = shared.boundedInteger(rawTarget === undefined ? values[Math.floor(values.length / 2)] : rawTarget, "rank key", -999, 999);
      if (!values.includes(target)) throw new RangeError("rank key must exist");
      let rank = 0;
      let cursor = tree.rootId;
      const path = [];
      while (cursor !== null) {
        path.push(cursor);
        const node = tree.nodes[cursor];
        const leftSize = node.left ? tree.nodes[node.left].size : 0;
        if (target < node.key) {
          frames.push(frame("order", tree.nodes, tree.rootId, target + " меньше " + node.key + ": идём влево", cursor, path, [], rank));
          cursor = node.left;
        } else {
          rank += leftSize + 1;
          frames.push(frame("order", tree.nodes, tree.rootId, "Пропускаем левое поддерево и сам узел: накоплено " + rank, cursor, path, [], rank));
          if (target === node.key) break;
          cursor = node.right;
        }
      }
      frames.push(frame("order", tree.nodes, tree.rootId, "Ранг ключа " + target + " равен " + rank, cursor, path, [], rank));
      return shared.deepFreeze({ mode: "order", operation: operation, frames: frames });
    }

    const targetRank = shared.boundedInteger(rawTarget === undefined ? Math.ceil(values.length / 2) : rawTarget, "rank", 1, values.length);
    let rank = targetRank;
    let cursor = tree.rootId;
    const path = [];
    while (cursor !== null) {
      path.push(cursor);
      const node = tree.nodes[cursor];
      const localRank = (node.left ? tree.nodes[node.left].size : 0) + 1;
      frames.push(frame("order", tree.nodes, tree.rootId, "В узле " + node.key + " локальный ранг равен " + localRank, cursor, path, [], null));
      if (rank === localRank) {
        frames.push(frame("order", tree.nodes, tree.rootId, "Найден элемент ранга " + targetRank + ": " + node.key, cursor, path, [], node.key));
        break;
      }
      if (rank < localRank) cursor = node.left;
      else {
        rank -= localRank;
        cursor = node.right;
      }
    }
    return shared.deepFreeze({ mode: "order", operation: "select", frames: frames });
  }

  function overlaps(left, right) {
    return left[0] <= right[1] && right[0] <= left[1];
  }

  function intervalTrace(rawIntervals, operation, rawTarget) {
    const intervals = normalizeIntervals(rawIntervals);
    const tree = buildBalanced(intervals, "interval");
    const frames = [frame("interval", tree.nodes, tree.rootId, "max хранит самую правую границу всего поддерева", null, [], [], null)];
    const target = rawTarget === undefined ? [12, 16] : rawTarget;
    if (!Array.isArray(target) || target.length !== 2) throw new RangeError("target interval must have two endpoints");
    const low = shared.boundedInteger(target[0], "query low", -999, 999);
    const high = shared.boundedInteger(target[1], "query high", low, 999);
    if (operation === "insert") {
      if (intervals.some(function (interval) { return interval[0] === low; })) throw new RangeError("interval low endpoint already exists");
      let cursor = tree.rootId;
      let parent = null;
      const path = [];
      while (cursor !== null) {
        path.push(cursor);
        parent = cursor;
        cursor = low < tree.nodes[cursor].key ? tree.nodes[cursor].left : tree.nodes[cursor].right;
      }
      const id = "new";
      tree.nodes[id] = { id: id, key: low, interval: [low, high], left: null, right: null, parent: parent, size: 1, max: high };
      if (low < tree.nodes[parent].key) tree.nodes[parent].left = id;
      else tree.nodes[parent].right = id;
      frames.push(frame("interval", tree.nodes, tree.rootId, "Новый лист начинает с max=" + high, id, path.concat([id]), [id], null));
      const recomputed = [id];
      cursor = parent;
      while (cursor !== null) {
        recomputeNode(tree.nodes, cursor, "interval");
        recomputed.push(cursor);
        frames.push(frame("interval", tree.nodes, tree.rootId, "Пересчитан max узла [" + tree.nodes[cursor].interval.join(", ") + "]", cursor, path, recomputed, null));
        cursor = tree.nodes[cursor].parent;
      }
      frames.push(frame("interval", tree.nodes, tree.rootId, "Агрегаты обновлены только на пути к корню", id, path, recomputed, [low, high]));
      return shared.deepFreeze({ mode: "interval", operation: operation, frames: frames });
    }

    let cursor = tree.rootId;
    const path = [];
    let result = null;
    while (cursor !== null) {
      path.push(cursor);
      const node = tree.nodes[cursor];
      if (overlaps(node.interval, [low, high])) {
        result = node.interval.slice();
        frames.push(frame("interval", tree.nodes, tree.rootId, "Интервал пересекается с запросом", cursor, path, [], result));
        break;
      }
      if (node.left !== null && tree.nodes[node.left].max >= low) {
        frames.push(frame("interval", tree.nodes, tree.rootId, "left.max ≥ query.low: пересечение ещё возможно слева", cursor, path, [], null));
        cursor = node.left;
      } else {
        frames.push(frame("interval", tree.nodes, tree.rootId, "Левое поддерево отсечено по max; идём вправо", cursor, path, [], null));
        cursor = node.right;
      }
    }
    if (result === null) frames.push(frame("interval", tree.nodes, tree.rootId, "Пересекающийся интервал не найден", null, path, [], null));
    return shared.deepFreeze({ mode: "interval", operation: "search", frames: frames });
  }

  function createState(mode, options) {
    const settings = options || {};
    const trace = mode === "interval"
      ? intervalTrace(settings.intervals, settings.operation, settings.target)
      : orderTrace(settings.values, settings.operation, settings.target);
    return Object.freeze({ trace: trace, frameIndex: 0, frame: trace.frames[0], finished: trace.frames.length <= 1 });
  }

  function step(state) {
    if (state.finished) return state;
    const frameIndex = state.frameIndex + 1;
    return Object.freeze({ trace: state.trace, frameIndex: frameIndex, frame: state.trace.frames[frameIndex], finished: frameIndex >= state.trace.frames.length - 1 });
  }

  function visualModel(state) {
    const snapshot = state.frame;
    const positions = {};
    let order = 0;
    function place(id, depth) {
      if (id === null) return;
      place(snapshot.nodes[id].left, depth + 1);
      positions[id] = { order: order, depth: depth };
      order += 1;
      place(snapshot.nodes[id].right, depth + 1);
    }
    place(snapshot.rootId, 0);
    const count = Math.max(1, order);
    const nodes = Object.keys(snapshot.nodes).map(function (id) {
      const node = snapshot.nodes[id];
      return {
        id: id, key: node.key, interval: node.interval, size: node.size, max: node.max,
        xShare: (positions[id].order + 1) / (count + 1), depth: positions[id].depth,
        active: snapshot.activeId === id, onPath: snapshot.path.includes(id), recomputed: snapshot.recomputedIds.includes(id),
      };
    });
    const edges = [];
    Object.keys(snapshot.nodes).forEach(function (id) {
      [snapshot.nodes[id].left, snapshot.nodes[id].right].forEach(function (child) { if (child !== null) edges.push({ from: id, to: child }); });
    });
    return shared.deepFreeze({
      mode: snapshot.mode, event: snapshot.event, result: snapshot.result,
      nodes: nodes, edges: edges, schematic: nodes.length > 12,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    normalizeValues: normalizeValues,
    normalizeIntervals: normalizeIntervals,
    orderTrace: orderTrace,
    intervalTrace: intervalTrace,
    overlaps: overlaps,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
