(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PersistentSuccinctStructuresCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_VALUES = 16;
  const MAX_UPDATES = 8;
  const MAX_BITS = 64;
  const SUPERBLOCK_SIZE = 8;
  const BLOCK_SIZE = 4;

  function isPowerOfTwo(value) {
    return value > 0 && (value & (value - 1)) === 0;
  }

  function normalizeValues(rawValues) {
    const values = rawValues === undefined ? [2, 1, 3, 0, 4, 2, 1, 5] : rawValues;
    if (!Array.isArray(values) || values.length < 2 || values.length > MAX_VALUES || !isPowerOfTwo(values.length)) {
      throw new RangeError("values: длина должна быть степенью двойки от 2 до " + MAX_VALUES);
    }
    return Object.freeze(values.map(function (value) {
      return shared.boundedInteger(value, "value", -99, 99);
    }));
  }

  function normalizeUpdates(rawUpdates, length) {
    const updates = rawUpdates === undefined
      ? [{ base: 0, index: 3, value: 9 }, { base: 1, index: 6, value: 7 }, { base: 0, index: 1, value: 8 }]
      : rawUpdates;
    if (!Array.isArray(updates) || updates.length < 1 || updates.length > MAX_UPDATES) {
      throw new RangeError("updates: требуется от 1 до " + MAX_UPDATES + " обновлений");
    }
    return Object.freeze(updates.map(function (update, index) {
      if (!update || typeof update !== "object") throw new TypeError("update must be an object");
      const base = shared.boundedInteger(update.base, "base version", 0, index);
      const position = shared.boundedInteger(update.index, "index", 0, length - 1);
      const value = shared.boundedInteger(update.value, "value", -99, 99);
      return Object.freeze({ base: base, index: position, value: value });
    }));
  }

  function cloneNodes(nodes) {
    const result = {};
    Object.keys(nodes).forEach(function (id) { result[id] = Object.assign({}, nodes[id]); });
    return result;
  }

  function makeNodeFactory(nodes) {
    let serial = Object.keys(nodes).length;
    return function createNode(fields) {
      const id = "p" + serial;
      serial += 1;
      nodes[id] = Object.assign({ id: id }, fields);
      return id;
    };
  }

  function buildSegmentTree(values) {
    const nodes = {};
    const createNode = makeNodeFactory(nodes);
    function build(left, right) {
      if (right - left === 1) {
        return createNode({ left: null, right: null, lo: left, hi: right, value: values[left], sum: values[left] });
      }
      const middle = (left + right) / 2;
      const leftId = build(left, middle);
      const rightId = build(middle, right);
      return createNode({
        left: leftId, right: rightId, lo: left, hi: right, value: null,
        sum: nodes[leftId].sum + nodes[rightId].sum,
      });
    }
    return { nodes: nodes, rootId: build(0, values.length) };
  }

  function readValue(nodes, rootId, index) {
    let cursor = rootId;
    while (nodes[cursor].hi - nodes[cursor].lo > 1) {
      const middle = (nodes[cursor].lo + nodes[cursor].hi) / 2;
      cursor = index < middle ? nodes[cursor].left : nodes[cursor].right;
    }
    return nodes[cursor].value;
  }

  function materialize(nodes, rootId) {
    const values = [];
    function visit(id) {
      const node = nodes[id];
      if (node.hi - node.lo === 1) {
        values[node.lo] = node.value;
        return;
      }
      visit(node.left);
      visit(node.right);
    }
    visit(rootId);
    return values;
  }

  function reachableIds(nodes, rootId) {
    const result = [];
    function visit(id) {
      if (id === null) return;
      result.push(id);
      visit(nodes[id].left);
      visit(nodes[id].right);
    }
    visit(rootId);
    return result;
  }

  function referenceCounts(nodes, versions) {
    const counts = {};
    versions.forEach(function (version) {
      reachableIds(nodes, version.rootId).forEach(function (id) {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }

  function persistentFrame(nodes, versions, activeVersionId, event, options) {
    const settings = options || {};
    const counts = referenceCounts(nodes, versions);
    const sharedIds = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
    return shared.deepFreeze({
      mode: "persistent",
      nodes: cloneNodes(nodes),
      versions: versions.map(function (version) { return Object.assign({}, version); }),
      activeVersionId: activeVersionId,
      event: event,
      pathIds: (settings.pathIds || []).slice(),
      copiedIds: (settings.copiedIds || []).slice(),
      activeCopyId: settings.activeCopyId || null,
      sharedIds: sharedIds,
      baseVersionId: settings.baseVersionId === undefined ? null : settings.baseVersionId,
      result: settings.result ? settings.result.slice() : null,
    });
  }

  function buildPersistentTrace(rawValues, rawUpdates) {
    const values = normalizeValues(rawValues);
    const updates = normalizeUpdates(rawUpdates, values.length);
    const tree = buildSegmentTree(values);
    const nodes = tree.nodes;
    const createNode = makeNodeFactory(nodes);
    const versions = [{ id: "v0", rootId: tree.rootId, parentId: null, label: "исходная" }];
    const frames = [persistentFrame(nodes, versions, "v0", "Версия v0 владеет исходным корнем; других версий пока нет", {
      result: values,
    })];

    updates.forEach(function (update, updateIndex) {
      const baseVersion = versions[update.base];
      const oldValue = readValue(nodes, baseVersion.rootId, update.index);
      const versionId = "v" + (updateIndex + 1);
      if (oldValue === update.value) {
        versions.push({ id: versionId, rootId: baseVersion.rootId, parentId: baseVersion.id, label: update.index + " ← " + update.value });
        frames.push(persistentFrame(nodes, versions, versionId, "Значение уже равно " + update.value + ": новая версия делит даже корень", {
          baseVersionId: baseVersion.id,
          result: materialize(nodes, baseVersion.rootId),
        }));
        return;
      }

      const oldPath = [];
      const copySteps = [];
      function copyUpdate(oldId) {
        const oldNode = nodes[oldId];
        oldPath.push(oldId);
        if (oldNode.hi - oldNode.lo === 1) {
          const leafId = createNode({
            left: null, right: null, lo: oldNode.lo, hi: oldNode.hi,
            value: update.value, sum: update.value,
          });
          copySteps.push({ id: leafId, sourceId: oldId, kind: "leaf" });
          return leafId;
        }
        const middle = (oldNode.lo + oldNode.hi) / 2;
        let leftId = oldNode.left;
        let rightId = oldNode.right;
        if (update.index < middle) leftId = copyUpdate(oldNode.left);
        else rightId = copyUpdate(oldNode.right);
        const copiedId = createNode({
          left: leftId, right: rightId, lo: oldNode.lo, hi: oldNode.hi, value: null,
          sum: nodes[leftId].sum + nodes[rightId].sum,
        });
        copySteps.push({ id: copiedId, sourceId: oldId, kind: "internal" });
        return copiedId;
      }

      frames.push(persistentFrame(nodes, versions, baseVersion.id,
        "Из версии " + baseVersion.id + " найден путь к позиции " + update.index,
        { pathIds: (function () {
          let id = baseVersion.rootId;
          const path = [];
          while (true) {
            path.push(id);
            const node = nodes[id];
            if (node.hi - node.lo === 1) break;
            const middle = (node.lo + node.hi) / 2;
            id = update.index < middle ? node.left : node.right;
          }
          return path;
        })(), baseVersionId: baseVersion.id, result: materialize(nodes, baseVersion.rootId) }));

      oldPath.length = 0;
      const newRootId = copyUpdate(baseVersion.rootId);
      versions.push({ id: versionId, rootId: newRootId, parentId: baseVersion.id, label: update.index + " ← " + update.value });
      copySteps.forEach(function (copyStep, stepIndex) {
        const completed = copySteps.slice(0, stepIndex + 1).map(function (step) { return step.id; });
        const message = copyStep.kind === "leaf"
          ? "Скопирован лист позиции " + update.index + " и записано новое значение " + update.value
          : "Скопирован предок диапазона [" + nodes[copyStep.id].lo + ", " + nodes[copyStep.id].hi + ") и пересчитана сумма";
        frames.push(persistentFrame(nodes, versions, versionId, message, {
          pathIds: oldPath,
          copiedIds: completed,
          activeCopyId: copyStep.id,
          baseVersionId: baseVersion.id,
          result: materialize(nodes, newRootId),
        }));
      });
      frames.push(persistentFrame(nodes, versions, versionId,
        "Версия " + versionId + " готова: скопирован только путь, остальные поддеревья общие",
        {
          pathIds: oldPath,
          copiedIds: copySteps.map(function (step) { return step.id; }),
          baseVersionId: baseVersion.id,
          result: materialize(nodes, newRootId),
        }));
    });
    return shared.deepFreeze({ mode: "persistent", values: values, updates: updates, frames: frames });
  }

  function normalizeBitString(rawBits) {
    const text = rawBits === undefined ? "1011010010110101" : String(rawBits).replace(/\s+/g, "");
    if (!/^[01]+$/.test(text) || text.length < 1 || text.length > MAX_BITS) {
      throw new RangeError("bitvector: требуется от 1 до " + MAX_BITS + " нулей и единиц");
    }
    return text;
  }

  function buildRankIndex(bitString) {
    const length = bitString.length;
    const prefix = [0];
    for (let index = 0; index < length; index += 1) {
      prefix.push(prefix[index] + (bitString[index] === "1" ? 1 : 0));
    }
    const superRanks = [];
    for (let start = 0; start <= length; start += SUPERBLOCK_SIZE) superRanks.push(prefix[start]);
    if ((superRanks.length - 1) * SUPERBLOCK_SIZE < length) superRanks.push(prefix[length]);
    const blockRanks = [];
    for (let start = 0; start <= length; start += BLOCK_SIZE) {
      const superStart = Math.floor(start / SUPERBLOCK_SIZE) * SUPERBLOCK_SIZE;
      blockRanks.push(prefix[start] - prefix[superStart]);
    }
    if ((blockRanks.length - 1) * BLOCK_SIZE < length) {
      const superStart = Math.floor(length / SUPERBLOCK_SIZE) * SUPERBLOCK_SIZE;
      blockRanks.push(prefix[length] - prefix[superStart]);
    }
    return shared.deepFreeze({
      bitString: bitString,
      prefix: prefix,
      superRanks: superRanks,
      blockRanks: blockRanks,
      superblockSize: SUPERBLOCK_SIZE,
      blockSize: BLOCK_SIZE,
      ones: prefix[length],
    });
  }

  function rank1(bitString, rawPosition) {
    const bits = normalizeBitString(bitString);
    const position = shared.boundedInteger(rawPosition, "rank position", 0, bits.length);
    let count = 0;
    for (let index = 0; index < position; index += 1) if (bits[index] === "1") count += 1;
    return count;
  }

  function select1(bitString, rawRank) {
    const bits = normalizeBitString(bitString);
    const total = rank1(bits, bits.length);
    const rank = shared.boundedInteger(rawRank, "select rank", 1, total);
    let count = 0;
    for (let index = 0; index < bits.length; index += 1) {
      if (bits[index] === "1") count += 1;
      if (count === rank) return index;
    }
    throw new Error("internal select failure");
  }

  function bitFrame(index, operation, target, event, options) {
    const settings = options || {};
    return shared.deepFreeze({
      mode: "bitvector",
      index: index,
      operation: operation,
      target: target,
      event: event,
      activeSuper: settings.activeSuper === undefined ? null : settings.activeSuper,
      activeBlock: settings.activeBlock === undefined ? null : settings.activeBlock,
      scanIndex: settings.scanIndex === undefined ? null : settings.scanIndex,
      inspectedUntil: settings.inspectedUntil === undefined ? null : settings.inspectedUntil,
      count: settings.count === undefined ? 0 : settings.count,
      result: settings.result === undefined ? null : settings.result,
    });
  }

  function buildRankTrace(index, position) {
    const frames = [bitFrame(index, "rank", position, "Индекс хранит абсолютный rank на границе superblock и локальный rank на границе block")];
    const superIndex = Math.floor(position / SUPERBLOCK_SIZE);
    const superStart = superIndex * SUPERBLOCK_SIZE;
    const blockIndex = Math.floor(position / BLOCK_SIZE);
    const blockStart = blockIndex * BLOCK_SIZE;
    let count = index.superRanks[superIndex] || 0;
    frames.push(bitFrame(index, "rank", position, "Берём " + count + " единиц до superblock " + superIndex, {
      activeSuper: superIndex, count: count,
    }));
    const local = index.blockRanks[blockIndex] || 0;
    count += local;
    frames.push(bitFrame(index, "rank", position, "Добавляем " + local + " единиц от начала superblock до block", {
      activeSuper: superIndex, activeBlock: blockIndex, count: count,
    }));
    for (let cursor = blockStart; cursor < position; cursor += 1) {
      if (index.bitString[cursor] === "1") count += 1;
      frames.push(bitFrame(index, "rank", position, "Считываем бит " + cursor + " = " + index.bitString[cursor], {
        activeSuper: superIndex, activeBlock: blockIndex, scanIndex: cursor,
        inspectedUntil: cursor + 1, count: count,
      }));
    }
    frames.push(bitFrame(index, "rank", position, "rank₁(" + position + ") = " + count, {
      activeSuper: superIndex, activeBlock: blockIndex, inspectedUntil: position,
      count: count, result: count,
    }));
    return frames;
  }

  function buildSelectTrace(index, rank) {
    const frames = [bitFrame(index, "select", rank, "Select сначала находит superblock, затем block и только после этого сканирует короткий остаток")];
    const superCount = Math.ceil(index.bitString.length / SUPERBLOCK_SIZE);
    let chosenSuper = 0;
    for (let superIndex = 0; superIndex < superCount; superIndex += 1) {
      const nextStart = Math.min((superIndex + 1) * SUPERBLOCK_SIZE, index.bitString.length);
      const through = index.prefix[nextStart];
      frames.push(bitFrame(index, "select", rank, "После superblock " + superIndex + " накоплено " + through + " единиц", {
        activeSuper: superIndex, count: through,
      }));
      if (rank <= through) {
        chosenSuper = superIndex;
        break;
      }
    }
    const firstBlock = chosenSuper * (SUPERBLOCK_SIZE / BLOCK_SIZE);
    const lastBlockExclusive = Math.min(firstBlock + SUPERBLOCK_SIZE / BLOCK_SIZE, Math.ceil(index.bitString.length / BLOCK_SIZE));
    let chosenBlock = firstBlock;
    for (let blockIndex = firstBlock; blockIndex < lastBlockExclusive; blockIndex += 1) {
      const nextStart = Math.min((blockIndex + 1) * BLOCK_SIZE, index.bitString.length);
      const through = index.prefix[nextStart];
      frames.push(bitFrame(index, "select", rank, "После block " + blockIndex + " накоплено " + through + " единиц", {
        activeSuper: chosenSuper, activeBlock: blockIndex, count: through,
      }));
      if (rank <= through) {
        chosenBlock = blockIndex;
        break;
      }
    }
    const blockStart = chosenBlock * BLOCK_SIZE;
    let count = index.prefix[blockStart];
    let result = null;
    for (let cursor = blockStart; cursor < Math.min(blockStart + BLOCK_SIZE, index.bitString.length); cursor += 1) {
      if (index.bitString[cursor] === "1") count += 1;
      frames.push(bitFrame(index, "select", rank, "Проверяем позицию " + cursor + ": накоплено " + count + " единиц", {
        activeSuper: chosenSuper, activeBlock: chosenBlock, scanIndex: cursor,
        inspectedUntil: cursor + 1, count: count,
      }));
      if (count === rank) {
        result = cursor;
        break;
      }
    }
    frames.push(bitFrame(index, "select", rank, "select₁(" + rank + ") = " + result, {
      activeSuper: chosenSuper, activeBlock: chosenBlock, scanIndex: result,
      inspectedUntil: result + 1, count: rank, result: result,
    }));
    return frames;
  }

  function buildBitvectorTrace(rawBits, operation, rawTarget) {
    const bitString = normalizeBitString(rawBits);
    const index = buildRankIndex(bitString);
    const normalizedOperation = operation === undefined ? "rank" : operation;
    if (normalizedOperation !== "rank" && normalizedOperation !== "select") {
      throw new RangeError("operation: поддерживаются rank и select");
    }
    const target = normalizedOperation === "rank"
      ? shared.boundedInteger(rawTarget === undefined ? Math.min(11, bitString.length) : rawTarget, "rank position", 0, bitString.length)
      : shared.boundedInteger(rawTarget === undefined ? Math.min(5, index.ones) : rawTarget, "select rank", 1, index.ones);
    const frames = normalizedOperation === "rank"
      ? buildRankTrace(index, target) : buildSelectTrace(index, target);
    return shared.deepFreeze({ mode: "bitvector", bitString: bitString, operation: normalizedOperation, target: target, frames: frames });
  }

  function createState(mode, options) {
    const settings = options || {};
    let trace;
    if (mode === "persistent") trace = buildPersistentTrace(settings.values, settings.updates);
    else if (mode === "bitvector") trace = buildBitvectorTrace(settings.bitString, settings.operation, settings.target);
    else throw new RangeError("mode: поддерживаются persistent и bitvector");
    return shared.deepFreeze({
      mode: mode,
      trace: trace,
      frameIndex: 0,
      frame: trace.frames[0],
      finished: trace.frames.length === 1,
    });
  }

  function step(state) {
    if (!state || !state.trace || !Array.isArray(state.trace.frames)) throw new TypeError("invalid state");
    if (state.finished) return state;
    const frameIndex = Math.min(state.frameIndex + 1, state.trace.frames.length - 1);
    return shared.deepFreeze({
      mode: state.mode,
      trace: state.trace,
      frameIndex: frameIndex,
      frame: state.trace.frames[frameIndex],
      finished: frameIndex === state.trace.frames.length - 1,
    });
  }

  function treeLayout(nodes, rootId) {
    const result = [];
    let ordinal = 0;
    function visit(id, depth) {
      if (id === null) return;
      visit(nodes[id].left, depth + 1);
      result.push({ id: id, depth: depth, ordinal: ordinal });
      ordinal += 1;
      visit(nodes[id].right, depth + 1);
    }
    visit(rootId, 0);
    const denominator = Math.max(1, result.length - 1);
    return result.map(function (entry) {
      return { id: entry.id, depth: entry.depth, xShare: entry.ordinal / denominator };
    });
  }

  function persistentVisual(frame) {
    const activeVersion = frame.versions.find(function (version) { return version.id === frame.activeVersionId; });
    const layout = treeLayout(frame.nodes, activeVersion.rootId);
    const positions = {};
    layout.forEach(function (entry) { positions[entry.id] = entry; });
    const copied = new Set(frame.copiedIds);
    const sharedIds = new Set(frame.sharedIds);
    const pathIds = new Set(frame.pathIds);
    const nodes = layout.map(function (entry) {
      const node = frame.nodes[entry.id];
      return {
        id: entry.id, lo: node.lo, hi: node.hi, sum: node.sum, value: node.value,
        depth: entry.depth, xShare: entry.xShare,
        copied: copied.has(entry.id), shared: sharedIds.has(entry.id),
        onPath: pathIds.has(entry.id), active: frame.activeCopyId === entry.id,
      };
    });
    const edges = [];
    nodes.forEach(function (entry) {
      const node = frame.nodes[entry.id];
      [node.left, node.right].forEach(function (child) {
        if (child !== null && positions[child]) edges.push({ from: entry.id, to: child });
      });
    });
    const versionLevels = {};
    frame.versions.forEach(function (version) {
      versionLevels[version.id] = version.parentId === null ? 0 : versionLevels[version.parentId] + 1;
    });
    return shared.deepFreeze({
      mode: "persistent", event: frame.event, nodes: nodes, edges: edges,
      versions: frame.versions.map(function (version, index) {
        return Object.assign({}, version, {
          xShare: frame.versions.length === 1 ? 0.5 : index / (frame.versions.length - 1),
          level: versionLevels[version.id], active: version.id === frame.activeVersionId,
          base: version.id === frame.baseVersionId,
        });
      }),
      versionEdges: frame.versions.filter(function (version) { return version.parentId !== null; }).map(function (version) {
        return { from: version.parentId, to: version.id };
      }),
      result: frame.result,
      physicalNodes: Object.keys(frame.nodes).length,
      logicalNodes: frame.versions.length * (frame.result ? frame.result.length * 2 - 1 : 0),
      sharedCount: frame.sharedIds.length,
      copiedCount: frame.copiedIds.length,
    });
  }

  function bitvectorVisual(frame) {
    return shared.deepFreeze({
      mode: "bitvector", event: frame.event, operation: frame.operation, target: frame.target,
      bits: frame.index.bitString.split("").map(function (bit, position) {
        return {
          bit: Number(bit), position: position,
          superIndex: Math.floor(position / SUPERBLOCK_SIZE),
          blockIndex: Math.floor(position / BLOCK_SIZE),
          activeSuper: Math.floor(position / SUPERBLOCK_SIZE) === frame.activeSuper,
          activeBlock: Math.floor(position / BLOCK_SIZE) === frame.activeBlock,
          scanned: frame.inspectedUntil !== null && position < frame.inspectedUntil,
          active: position === frame.scanIndex,
        };
      }),
      superRanks: frame.index.superRanks,
      blockRanks: frame.index.blockRanks,
      superblockSize: SUPERBLOCK_SIZE,
      blockSize: BLOCK_SIZE,
      count: frame.count,
      result: frame.result,
      ones: frame.index.ones,
    });
  }

  function visualModel(state) {
    if (!state || !state.frame) throw new TypeError("invalid state");
    return state.mode === "persistent" ? persistentVisual(state.frame) : bitvectorVisual(state.frame);
  }

  return Object.freeze({
    MAX_VALUES: MAX_VALUES,
    MAX_UPDATES: MAX_UPDATES,
    MAX_BITS: MAX_BITS,
    SUPERBLOCK_SIZE: SUPERBLOCK_SIZE,
    BLOCK_SIZE: BLOCK_SIZE,
    normalizeBitString: normalizeBitString,
    buildRankIndex: buildRankIndex,
    rank1: rank1,
    select1: select1,
    materialize: materialize,
    reachableIds: reachableIds,
    buildPersistentTrace: buildPersistentTrace,
    buildBitvectorTrace: buildBitvectorTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
