(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BalancedSearchTreesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_KEYS = 18;

  function normalizeKeys(rawKeys) {
    const keys = rawKeys === undefined ? [30, 20, 10, 25, 28, 40, 50, 45] : rawKeys;
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_KEYS) {
      throw new RangeError("keys: требуется от 1 до " + MAX_KEYS + " ключей");
    }
    const normalized = keys.map(function (value) {
      return shared.boundedInteger(value, "key", -999, 999);
    });
    if (new Set(normalized).size !== normalized.length) {
      throw new RangeError("keys: повторяющиеся ключи не поддерживаются");
    }
    return Object.freeze(normalized);
  }

  function cloneNodes(nodes) {
    const copy = {};
    Object.keys(nodes).forEach(function (id) { copy[id] = Object.assign({}, nodes[id]); });
    return copy;
  }

  function nodeHeight(nodes, id) {
    return id === null ? 0 : nodes[id].height;
  }

  function updateHeight(nodes, id) {
    if (id !== null) nodes[id].height = 1 + Math.max(nodeHeight(nodes, nodes[id].left), nodeHeight(nodes, nodes[id].right));
  }

  function balanceFactor(nodes, id) {
    return id === null ? 0 : nodeHeight(nodes, nodes[id].left) - nodeHeight(nodes, nodes[id].right);
  }

  function replaceAtParent(nodes, rootId, oldId, newId) {
    const parentId = nodes[oldId].parent;
    if (parentId === null) {
      rootId = newId;
    } else if (nodes[parentId].left === oldId) {
      nodes[parentId].left = newId;
    } else {
      nodes[parentId].right = newId;
    }
    if (newId !== null) nodes[newId].parent = parentId;
    return rootId;
  }

  function rotateLeft(nodes, rootId, pivotId) {
    const childId = nodes[pivotId].right;
    if (childId === null) throw new RangeError("left rotation requires a right child");
    const middleId = nodes[childId].left;
    rootId = replaceAtParent(nodes, rootId, pivotId, childId);
    nodes[childId].left = pivotId;
    nodes[pivotId].parent = childId;
    nodes[pivotId].right = middleId;
    if (middleId !== null) nodes[middleId].parent = pivotId;
    updateHeight(nodes, pivotId);
    updateHeight(nodes, childId);
    return rootId;
  }

  function rotateRight(nodes, rootId, pivotId) {
    const childId = nodes[pivotId].left;
    if (childId === null) throw new RangeError("right rotation requires a left child");
    const middleId = nodes[childId].right;
    rootId = replaceAtParent(nodes, rootId, pivotId, childId);
    nodes[childId].right = pivotId;
    nodes[pivotId].parent = childId;
    nodes[pivotId].left = middleId;
    if (middleId !== null) nodes[middleId].parent = pivotId;
    updateHeight(nodes, pivotId);
    updateHeight(nodes, childId);
    return rootId;
  }

  function recomputeAllHeights(nodes, id) {
    if (id === null) return 0;
    const left = recomputeAllHeights(nodes, nodes[id].left);
    const right = recomputeAllHeights(nodes, nodes[id].right);
    nodes[id].height = 1 + Math.max(left, right);
    return nodes[id].height;
  }

  function bstInsert(nodes, rootId, key, color) {
    const id = "n" + Object.keys(nodes).length;
    const node = { id: id, key: key, left: null, right: null, parent: null, height: 1, color: color || "black" };
    if (rootId === null) {
      nodes[id] = node;
      return { rootId: id, id: id, path: [id] };
    }
    let cursor = rootId;
    const path = [];
    while (true) {
      path.push(cursor);
      if (key < nodes[cursor].key) {
        if (nodes[cursor].left === null) {
          nodes[cursor].left = id;
          node.parent = cursor;
          break;
        }
        cursor = nodes[cursor].left;
      } else {
        if (nodes[cursor].right === null) {
          nodes[cursor].right = id;
          node.parent = cursor;
          break;
        }
        cursor = nodes[cursor].right;
      }
    }
    nodes[id] = node;
    path.push(id);
    return { rootId: rootId, id: id, path: path };
  }

  function makeFrame(mode, nodes, rootId, event, activeIds, path, violationId, insertedCount) {
    recomputeAllHeights(nodes, rootId);
    const validation = mode === "avl" ? validateAVL(nodes, rootId) : validateRedBlack(nodes, rootId);
    return shared.deepFreeze({
      mode: mode,
      nodes: cloneNodes(nodes),
      rootId: rootId,
      event: event,
      activeIds: (activeIds || []).slice(),
      path: (path || []).slice(),
      violationId: violationId || null,
      insertedCount: insertedCount,
      invariantValid: validation.valid,
      validation: validation,
    });
  }

  function buildAVLTrace(rawKeys) {
    const keys = normalizeKeys(rawKeys);
    const nodes = {};
    let rootId = null;
    const frames = [shared.deepFreeze({
      mode: "avl", nodes: {}, rootId: null, event: "Пустое AVL-дерево", activeIds: [], path: [],
      violationId: null, insertedCount: 0, invariantValid: true,
      validation: { valid: true, height: 0, size: 0 },
    })];

    keys.forEach(function (key, keyIndex) {
      const inserted = bstInsert(nodes, rootId, key, "black");
      rootId = inserted.rootId;
      recomputeAllHeights(nodes, rootId);
      let cursor = nodes[inserted.id].parent;
      let violationId = null;
      while (cursor !== null) {
        updateHeight(nodes, cursor);
        if (Math.abs(balanceFactor(nodes, cursor)) > 1 && violationId === null) violationId = cursor;
        cursor = nodes[cursor].parent;
      }
      frames.push(makeFrame("avl", nodes, rootId, "Вставлен ключ " + key + "; показан путь поиска", [inserted.id], inserted.path, violationId, keyIndex + 1));

      cursor = nodes[inserted.id].parent;
      while (cursor !== null) {
        updateHeight(nodes, cursor);
        const balance = balanceFactor(nodes, cursor);
        const parentAfter = nodes[cursor].parent;
        if (balance > 1) {
          const leftId = nodes[cursor].left;
          if (balanceFactor(nodes, leftId) < 0) {
            rootId = rotateLeft(nodes, rootId, leftId);
            frames.push(makeFrame("avl", nodes, rootId, "Левое вращение превращает LR-случай в LL", [leftId, nodes[leftId].parent], [], cursor, keyIndex + 1));
          }
          const pivot = cursor;
          rootId = rotateRight(nodes, rootId, pivot);
          frames.push(makeFrame("avl", nodes, rootId, "Правое вращение восстанавливает разность высот не более единицы", [pivot, nodes[pivot].parent], [], null, keyIndex + 1));
          break;
        }
        if (balance < -1) {
          const rightId = nodes[cursor].right;
          if (balanceFactor(nodes, rightId) > 0) {
            rootId = rotateRight(nodes, rootId, rightId);
            frames.push(makeFrame("avl", nodes, rootId, "Правое вращение превращает RL-случай в RR", [rightId, nodes[rightId].parent], [], cursor, keyIndex + 1));
          }
          const pivot = cursor;
          rootId = rotateLeft(nodes, rootId, pivot);
          frames.push(makeFrame("avl", nodes, rootId, "Левое вращение восстанавливает разность высот не более единицы", [pivot, nodes[pivot].parent], [], null, keyIndex + 1));
          break;
        }
        cursor = parentAfter;
      }
      recomputeAllHeights(nodes, rootId);
      if (!validateAVL(nodes, rootId).valid) throw new Error("internal AVL invariant failure");
      frames.push(makeFrame("avl", nodes, rootId, "AVL-инвариант восстановлен", [inserted.id], [], null, keyIndex + 1));
    });
    return shared.deepFreeze({ mode: "avl", keys: keys, frames: frames });
  }

  function colorOf(nodes, id) {
    return id === null ? "black" : nodes[id].color;
  }

  function buildRedBlackTrace(rawKeys) {
    const keys = normalizeKeys(rawKeys);
    const nodes = {};
    let rootId = null;
    const frames = [shared.deepFreeze({
      mode: "red-black", nodes: {}, rootId: null, event: "Пустое красно-чёрное дерево", activeIds: [], path: [],
      violationId: null, insertedCount: 0, invariantValid: true,
      validation: { valid: true, height: 0, blackHeight: 1, size: 0 },
    })];

    keys.forEach(function (key, keyIndex) {
      const inserted = bstInsert(nodes, rootId, key, "red");
      rootId = inserted.rootId;
      let z = inserted.id;
      frames.push(makeFrame("red-black", nodes, rootId, "Новый ключ " + key + " вставлен красным", [z], inserted.path, colorOf(nodes, nodes[z].parent) === "red" ? nodes[z].parent : null, keyIndex + 1));

      while (z !== rootId && colorOf(nodes, nodes[z].parent) === "red") {
        let parentId = nodes[z].parent;
        let grandId = nodes[parentId].parent;
        if (parentId === nodes[grandId].left) {
          const uncleId = nodes[grandId].right;
          if (colorOf(nodes, uncleId) === "red") {
            nodes[parentId].color = "black";
            nodes[uncleId].color = "black";
            nodes[grandId].color = "red";
            frames.push(makeFrame("red-black", nodes, rootId, "Красный дядя: родитель и дядя чернеют, нарушение поднимается к деду", [parentId, uncleId, grandId], [], grandId, keyIndex + 1));
            z = grandId;
          } else {
            if (z === nodes[parentId].right) {
              z = parentId;
              rootId = rotateLeft(nodes, rootId, z);
              frames.push(makeFrame("red-black", nodes, rootId, "Треугольник преобразован левым вращением", [z, nodes[z].parent], [], grandId, keyIndex + 1));
            }
            parentId = nodes[z].parent;
            grandId = nodes[parentId].parent;
            nodes[parentId].color = "black";
            nodes[grandId].color = "red";
            rootId = rotateRight(nodes, rootId, grandId);
            frames.push(makeFrame("red-black", nodes, rootId, "Линия исправлена перекраской и правым вращением", [parentId, grandId], [], null, keyIndex + 1));
          }
        } else {
          const uncleId = nodes[grandId].left;
          if (colorOf(nodes, uncleId) === "red") {
            nodes[parentId].color = "black";
            nodes[uncleId].color = "black";
            nodes[grandId].color = "red";
            frames.push(makeFrame("red-black", nodes, rootId, "Красный дядя: цвета меняются симметрично", [parentId, uncleId, grandId], [], grandId, keyIndex + 1));
            z = grandId;
          } else {
            if (z === nodes[parentId].left) {
              z = parentId;
              rootId = rotateRight(nodes, rootId, z);
              frames.push(makeFrame("red-black", nodes, rootId, "Обратный треугольник преобразован правым вращением", [z, nodes[z].parent], [], grandId, keyIndex + 1));
            }
            parentId = nodes[z].parent;
            grandId = nodes[parentId].parent;
            nodes[parentId].color = "black";
            nodes[grandId].color = "red";
            rootId = rotateLeft(nodes, rootId, grandId);
            frames.push(makeFrame("red-black", nodes, rootId, "Линия исправлена перекраской и левым вращением", [parentId, grandId], [], null, keyIndex + 1));
          }
        }
      }
      nodes[rootId].color = "black";
      recomputeAllHeights(nodes, rootId);
      if (!validateRedBlack(nodes, rootId).valid) throw new Error("internal red-black invariant failure");
      frames.push(makeFrame("red-black", nodes, rootId, "Корень чёрный, чёрная высота одинакова на всех путях", [inserted.id], [], null, keyIndex + 1));
    });
    return shared.deepFreeze({ mode: "red-black", keys: keys, frames: frames });
  }

  function validateBST(nodes, id, minimum, maximum) {
    if (id === null) return true;
    const key = nodes[id].key;
    return key > minimum && key < maximum &&
      validateBST(nodes, nodes[id].left, minimum, key) &&
      validateBST(nodes, nodes[id].right, key, maximum);
  }

  function validateAVL(nodes, rootId) {
    let valid = validateBST(nodes, rootId, -Infinity, Infinity);
    let size = 0;
    function visit(id) {
      if (id === null) return 0;
      size += 1;
      const left = visit(nodes[id].left);
      const right = visit(nodes[id].right);
      if (Math.abs(left - right) > 1 || nodes[id].height !== 1 + Math.max(left, right)) valid = false;
      return 1 + Math.max(left, right);
    }
    const height = visit(rootId);
    return Object.freeze({ valid: valid, height: height, size: size });
  }

  function validateRedBlack(nodes, rootId) {
    let valid = validateBST(nodes, rootId, -Infinity, Infinity);
    let size = 0;
    if (rootId !== null && nodes[rootId].color !== "black") valid = false;
    function visit(id) {
      if (id === null) return { height: 0, blackHeight: 1 };
      size += 1;
      const node = nodes[id];
      if (node.color === "red" && (colorOf(nodes, node.left) === "red" || colorOf(nodes, node.right) === "red")) valid = false;
      const left = visit(node.left);
      const right = visit(node.right);
      if (left.blackHeight !== right.blackHeight) valid = false;
      return {
        height: 1 + Math.max(left.height, right.height),
        blackHeight: Math.min(left.blackHeight, right.blackHeight) + (node.color === "black" ? 1 : 0),
      };
    }
    const result = visit(rootId);
    return Object.freeze({ valid: valid, height: result.height, blackHeight: result.blackHeight, size: size });
  }

  function createState(mode, rawKeys) {
    const trace = mode === "red-black" ? buildRedBlackTrace(rawKeys) : buildAVLTrace(rawKeys);
    return Object.freeze({ trace: trace, frameIndex: 0, frame: trace.frames[0], finished: trace.frames.length <= 1 });
  }

  function step(state) {
    if (state.finished) return state;
    const frameIndex = state.frameIndex + 1;
    return Object.freeze({ trace: state.trace, frameIndex: frameIndex, frame: state.trace.frames[frameIndex], finished: frameIndex >= state.trace.frames.length - 1 });
  }

  function visualModel(state) {
    const frame = state.frame;
    const positions = {};
    let inorderIndex = 0;
    function locate(id, depth) {
      if (id === null) return;
      locate(frame.nodes[id].left, depth + 1);
      positions[id] = { order: inorderIndex, depth: depth };
      inorderIndex += 1;
      locate(frame.nodes[id].right, depth + 1);
    }
    locate(frame.rootId, 0);
    const count = Math.max(1, inorderIndex);
    const nodes = Object.keys(frame.nodes).map(function (id) {
      const node = frame.nodes[id];
      return {
        id: id, key: node.key, color: node.color, height: node.height,
        balance: nodeHeight(frame.nodes, node.left) - nodeHeight(frame.nodes, node.right),
        xShare: (positions[id].order + 1) / (count + 1), depth: positions[id].depth,
        active: frame.activeIds.includes(id), onPath: frame.path.includes(id), violation: frame.violationId === id,
      };
    });
    const edges = [];
    Object.keys(frame.nodes).forEach(function (id) {
      [frame.nodes[id].left, frame.nodes[id].right].forEach(function (childId) {
        if (childId !== null) edges.push({ from: id, to: childId });
      });
    });
    return shared.deepFreeze({
      mode: frame.mode, event: frame.event, nodes: nodes, edges: edges,
      invariantValid: frame.invariantValid, validation: frame.validation,
      insertedCount: frame.insertedCount, schematic: nodes.length > 14,
    });
  }

  return {
    MAX_KEYS: MAX_KEYS,
    normalizeKeys: normalizeKeys,
    rotateLeft: rotateLeft,
    rotateRight: rotateRight,
    buildAVLTrace: buildAVLTrace,
    buildRedBlackTrace: buildRedBlackTrace,
    validateAVL: validateAVL,
    validateRedBlack: validateRedBlack,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
