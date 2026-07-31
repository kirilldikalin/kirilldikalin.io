(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RandomizedDataStructuresCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_KEYS = 24;
  const MAX_LEVEL = 8;

  function parseKeys(rawValue) {
    const parts = Array.isArray(rawValue) ? rawValue : String(rawValue).trim().split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new Error("Введите хотя бы один ключ.");
    if (parts.length > MAX_KEYS) throw new RangeError("Для схемы разрешено не более 24 ключей.");
    const keys = parts.map(function (part) {
      const value = Number(part);
      if (!Number.isSafeInteger(value)) throw new Error("Ключи должны быть безопасными целыми числами.");
      return value;
    });
    if (new Set(keys).size !== keys.length) throw new Error("Ключи должны быть уникальны.");
    return Object.freeze(keys.slice());
  }

  function randomSequence(seed, count) {
    let state = shared.normalizeSeed(seed);
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const next = shared.randomStep(state);
      state = next.state;
      values.push(next.value);
    }
    return Object.freeze({ state: state, values: Object.freeze(values) });
  }

  function heightFromRandom(randomValues, offset) {
    let level = 1;
    let index = offset;
    while (level < MAX_LEVEL && randomValues[index % randomValues.length] < 0.5) {
      level += 1;
      index += 1;
    }
    return level;
  }

  function buildSkipList(rawKeys, seed) {
    const keys = parseKeys(rawKeys).slice().sort(function (a, b) { return a - b; });
    const random = randomSequence(seed, keys.length * (MAX_LEVEL + 1) + 1).values;
    const nodes = keys.map(function (key, index) {
      return Object.freeze({ key: key, level: heightFromRandom(random, index * (MAX_LEVEL + 1)) });
    });
    const height = Math.max.apply(null, nodes.map(function (node) { return node.level; }));
    const levels = [];
    for (let level = height; level >= 1; level -= 1) {
      levels.push(Object.freeze(nodes.filter(function (node) { return node.level >= level; }).map(function (node) { return node.key; })));
    }
    return shared.deepFreeze({ nodes: nodes, levels: levels, height: height, seed: shared.normalizeSeed(seed) });
  }

  function insertTreap(rootNode, node) {
    if (!rootNode) return node;
    if (node.key < rootNode.key) {
      const left = insertTreap(rootNode.left, node);
      let root = { key: rootNode.key, priority: rootNode.priority, left: left, right: rootNode.right };
      if (left.priority < root.priority) {
        root = { key: left.key, priority: left.priority, left: left.left, right: { key: root.key, priority: root.priority, left: left.right, right: root.right } };
      }
      return root;
    }
    const right = insertTreap(rootNode.right, node);
    let root = { key: rootNode.key, priority: rootNode.priority, left: rootNode.left, right: right };
    if (right.priority < root.priority) {
      root = { key: right.key, priority: right.priority, left: { key: root.key, priority: root.priority, left: root.left, right: right.left }, right: right.right };
    }
    return root;
  }

  function annotateTreap(node, depth, items, edges, parentKey) {
    if (!node) return 0;
    items.push({ key: node.key, priority: node.priority, depth: depth, parentKey: parentKey });
    if (parentKey !== null) edges.push({ from: parentKey, to: node.key });
    const leftHeight = annotateTreap(node.left, depth + 1, items, edges, node.key);
    const rightHeight = annotateTreap(node.right, depth + 1, items, edges, node.key);
    return 1 + Math.max(leftHeight, rightHeight);
  }

  function buildTreap(rawKeys, seed) {
    const keys = parseKeys(rawKeys);
    const random = randomSequence(seed, keys.length + 1).values;
    let rootNode = null;
    keys.forEach(function (key, index) {
      rootNode = insertTreap(rootNode, { key: key, priority: Math.floor(random[index] * 1000000), left: null, right: null });
    });
    const nodes = [];
    const edges = [];
    const height = annotateTreap(rootNode, 0, nodes, edges, null);
    return shared.deepFreeze({ root: rootNode, nodes: nodes, edges: edges, height: height, seed: shared.normalizeSeed(seed) });
  }

  function validateTreap(node, minimum, maximum, parentPriority) {
    if (!node) return true;
    if (!(node.key > minimum && node.key < maximum)) return false;
    if (parentPriority !== null && node.priority < parentPriority) return false;
    return validateTreap(node.left, minimum, node.key, node.priority) && validateTreap(node.right, node.key, maximum, node.priority);
  }

  function observedHeights(rawKeys, seed, trials) {
    const keys = parseKeys(rawKeys);
    const count = shared.boundedInteger(trials, "Число опытов", 1, 64);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      result.push({
        seed: (shared.normalizeSeed(seed) + index * 2654435761) >>> 0,
        skip: buildSkipList(keys, (shared.normalizeSeed(seed) + index * 2654435761) >>> 0).height,
        treap: buildTreap(keys, (shared.normalizeSeed(seed) + index * 2654435761) >>> 0).height,
      });
    }
    return shared.deepFreeze(result);
  }

  function createState(mode, rawKeys, seed) {
    const keys = parseKeys(rawKeys);
    if (mode !== "skip" && mode !== "treap") throw new Error("Неизвестная рандомизированная структура.");
    return shared.deepFreeze({ mode: mode, keys: keys, seed: shared.normalizeSeed(seed), inserted: 1, finished: keys.length === 1 });
  }

  function step(state) {
    if (state.finished) return state;
    const inserted = Math.min(state.keys.length, state.inserted + 1);
    return shared.deepFreeze({ mode: state.mode, keys: state.keys, seed: state.seed, inserted: inserted, finished: inserted === state.keys.length });
  }

  function visualModel(state) {
    const active = state.keys.slice(0, state.inserted);
    const structure = state.mode === "skip" ? buildSkipList(active, state.seed) : buildTreap(active, state.seed);
    return shared.deepFreeze({
      mode: state.mode,
      structure: structure,
      inserted: state.inserted,
      total: state.keys.length,
      samples: observedHeights(state.keys, state.seed, 16),
      exact: true,
    });
  }

  return {
    MAX_KEYS: MAX_KEYS,
    MAX_LEVEL: MAX_LEVEL,
    parseKeys: parseKeys,
    randomSequence: randomSequence,
    buildSkipList: buildSkipList,
    buildTreap: buildTreap,
    validateTreap: validateTreap,
    observedHeights: observedHeights,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
