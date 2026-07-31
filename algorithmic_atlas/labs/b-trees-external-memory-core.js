(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BTreesExternalMemoryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_KEYS = 12;
  const PAGE_CAPACITY = 3;

  function parseKeys(rawValue) {
    const parts = Array.isArray(rawValue) ? rawValue : String(rawValue).trim().split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new Error("Нужен хотя бы один ключ.");
    if (parts.length > MAX_KEYS) throw new RangeError("Для наглядной двухуровневой схемы разрешено не более 12 ключей.");
    const values = parts.map(function (part) {
      const value = Number(part);
      if (!Number.isSafeInteger(value)) throw new Error("Ключи должны быть безопасными целыми числами.");
      return value;
    });
    const unique = Array.from(new Set(values)).sort(function (a, b) { return a - b; });
    if (unique.length !== values.length) throw new Error("Повторяющиеся ключи в этой модели не поддерживаются.");
    return Object.freeze(unique);
  }

  function partitionBalanced(keys, capacity) {
    const max = capacity || PAGE_CAPACITY;
    if (keys.length <= max) return [keys.slice()];
    const pageCount = Math.ceil(keys.length / max);
    const base = Math.floor(keys.length / pageCount);
    const extra = keys.length % pageCount;
    const pages = [];
    let offset = 0;
    for (let index = 0; index < pageCount; index += 1) {
      const size = base + (index < extra ? 1 : 0);
      pages.push(keys.slice(offset, offset + size));
      offset += size;
    }
    return pages;
  }

  function treeFromLeafArrays(rawLeafArrays) {
    if (!Array.isArray(rawLeafArrays) || !rawLeafArrays.length) throw new Error("Нужна хотя бы одна листовая страница.");
    const leafArrays = rawLeafArrays.map(function (items) { return items.slice(); });
    const flatKeys = leafArrays.flat();
    const keys = flatKeys.length ? parseKeys(flatKeys) : Object.freeze([]);
    const leaves = leafArrays.map(function (items, index) {
      return Object.freeze({ id: "L" + index, kind: "leaf", keys: Object.freeze(items), next: index + 1 < leafArrays.length ? index + 1 : null });
    });
    const rootKeys = leaves.slice(1).map(function (leaf) { return leaf.keys[0]; });
    const root = Object.freeze({ id: "R", kind: "root", keys: Object.freeze(rootKeys), children: Object.freeze(leaves.map(function (leaf) { return leaf.id; })) });
    return shared.deepFreeze({ keys: keys, root: root, leaves: leaves });
  }

  function buildTree(rawKeys) {
    const keys = parseKeys(rawKeys);
    return treeFromLeafArrays(partitionBalanced(keys, PAGE_CAPACITY));
  }

  function locateLeaf(tree, key) {
    let index = 0;
    while (index < tree.root.keys.length && key >= tree.root.keys[index]) index += 1;
    return Math.min(index, tree.leaves.length - 1);
  }

  function snapshot(action, message, tree, io, highlight, details) {
    return shared.deepFreeze({
      action: action,
      message: message,
      tree: tree,
      io: io,
      highlight: highlight || null,
      details: details || {},
    });
  }

  function insertFrames(rawKeys, rawKey) {
    const keys = parseKeys(rawKeys);
    const key = shared.boundedInteger(rawKey, "Ключ вставки", -999, 999);
    if (keys.includes(key)) throw new Error("Такой ключ уже есть.");
    const before = buildTree(keys);
    const leafIndex = locateLeaf(before, key);
    const target = before.leaves[leafIndex];
    const overflowKeys = target.keys.concat(key).sort(function (a, b) { return a - b; });
    let after = buildTree(keys.concat(key));
    const frames = [
      snapshot("start", "Индекс находится во внешней памяти; пока ни одна страница не прочитана.", before, 0),
      snapshot("read-root", "Читаем корневую страницу и выбираем нужный диапазон ключей.", before, 1, "R"),
      snapshot("read-leaf", "Читаем лист " + target.id + ".", before, 2, target.id),
      snapshot("insert", "Вставляем ключ " + key + " в отсортированную позицию листа.", before, 2, target.id, { previewKeys: overflowKeys }),
    ];
    if (overflowKeys.length > PAGE_CAPACITY) {
      const splitAt = Math.ceil(overflowKeys.length / 2);
      const leafArrays = before.leaves.map(function (leaf) { return leaf.keys.slice(); });
      leafArrays.splice(leafIndex, 1, overflowKeys.slice(0, splitAt), overflowKeys.slice(splitAt));
      after = treeFromLeafArrays(leafArrays);
      frames.push(snapshot("split", "Лист переполнен: делим его на страницы " + overflowKeys.slice(0, splitAt).join(", ") + " и " + overflowKeys.slice(splitAt).join(", ") + ".", after, 3, "split", { promoted: overflowKeys[splitAt] }));
      frames.push(snapshot("promote", "Копируем первый ключ правого листа в родителя; при необходимости тот тоже мог бы разделиться.", after, 4, "R", { promoted: overflowKeys[splitAt] }));
    }
    frames.push(snapshot("done", "Вставка завершена, порядок листьев и глубина всех листьев сохранены.", after, frames[frames.length - 1].io, "done"));
    return Object.freeze(frames);
  }

  function deleteFrames(rawKeys, rawKey) {
    const keys = parseKeys(rawKeys);
    const key = shared.boundedInteger(rawKey, "Ключ удаления", -999, 999);
    if (!keys.includes(key)) throw new Error("Удаляемого ключа нет в дереве.");
    const before = buildTree(keys);
    const leafIndex = locateLeaf(before, key);
    const target = before.leaves[leafIndex];
    const remainingLeaf = target.keys.filter(function (value) { return value !== key; });
    const leafArrays = before.leaves.map(function (leaf) { return leaf.keys.slice(); });
    leafArrays[leafIndex] = remainingLeaf.slice();
    let after = treeFromLeafArrays(leafArrays);
    const minKeys = 2;
    const frames = [
      snapshot("start", "Начинаем удаление ключа " + key + ".", before, 0),
      snapshot("read-root", "Читаем корень и находим лист.", before, 1, "R"),
      snapshot("read-leaf", "Читаем лист " + target.id + ".", before, 2, target.id),
      snapshot("delete", "Удаляем ключ из листа; остаётся: " + (remainingLeaf.join(", ") || "пусто") + ".", before, 2, target.id, { previewKeys: remainingLeaf }),
    ];
    if (before.leaves.length > 1 && remainingLeaf.length < minKeys) {
      const leftSiblingIndex = leafIndex - 1;
      const rightSiblingIndex = leafIndex + 1;
      const lendingIndex = leftSiblingIndex >= 0 && leafArrays[leftSiblingIndex].length > minKeys
        ? leftSiblingIndex
        : (rightSiblingIndex < leafArrays.length && leafArrays[rightSiblingIndex].length > minKeys ? rightSiblingIndex : null);
      const siblingIndex = lendingIndex === null ? (leftSiblingIndex >= 0 ? leftSiblingIndex : rightSiblingIndex) : lendingIndex;
      const sibling = before.leaves[siblingIndex];
      frames.push(snapshot("read-sibling", "Для восстановления заполнения читаем соседний лист " + sibling.id + ".", before, 3, sibling.id));
      if (lendingIndex !== null) {
        if (lendingIndex < leafIndex) leafArrays[leafIndex].unshift(leafArrays[lendingIndex].pop());
        else leafArrays[leafIndex].push(leafArrays[lendingIndex].shift());
        after = treeFromLeafArrays(leafArrays);
        frames.push(snapshot("borrow", "У соседа есть запас: переносим крайний ключ и сохраняем обе страницы.", after, 4, "borrow"));
        frames.push(snapshot("repair-root", "Обновляем разделитель корня после перераспределения.", after, 5, "R"));
      } else {
        const firstIndex = Math.min(leafIndex, siblingIndex);
        const secondIndex = Math.max(leafIndex, siblingIndex);
        const merged = leafArrays[firstIndex].concat(leafArrays[secondIndex]).sort(function (a, b) { return a - b; });
        leafArrays.splice(firstIndex, 2, merged);
        after = treeFromLeafArrays(leafArrays);
        frames.push(snapshot("merge", "Занять ключ нельзя без недополнения соседа, поэтому сливаем две страницы и удаляем разделитель из родителя.", after, 4, "merge"));
        frames.push(snapshot("repair-root", "Обновляем разделители корня после merge.", after, 5, "R"));
      }
    }
    frames.push(snapshot("done", "Удаление завершено, ограничения заполнения восстановлены.", after, frames[frames.length - 1].io, "done"));
    return Object.freeze(frames);
  }

  function rangeFrames(rawKeys, rawLeft, rawRight) {
    const keys = parseKeys(rawKeys);
    const left = shared.boundedInteger(rawLeft, "Левая граница", -999, 999);
    const right = shared.boundedInteger(rawRight, "Правая граница", -999, 999);
    if (left > right) throw new Error("Левая граница должна быть не больше правой.");
    const tree = buildTree(keys);
    const startLeaf = locateLeaf(tree, left);
    const frames = [
      snapshot("start", "Ищем диапазон [" + left + ", " + right + "].", tree, 0, null, { result: [] }),
      snapshot("read-root", "Один спуск по корню приводит к первому подходящему листу.", tree, 1, "R", { result: [] }),
    ];
    const result = [];
    let io = 1;
    for (let index = startLeaf; index < tree.leaves.length; index += 1) {
      const leaf = tree.leaves[index];
      io += 1;
      leaf.keys.forEach(function (key) { if (key >= left && key <= right) result.push(key); });
      frames.push(snapshot("scan-leaf", "Читаем " + leaf.id + " по sibling-ссылке; найдено: " + (result.join(", ") || "пока ничего") + ".", tree, io, leaf.id, { result: result.slice() }));
      if (leaf.keys[leaf.keys.length - 1] >= right) break;
    }
    frames.push(snapshot("done", "Range scan завершён: после первого поиска листья читались последовательно.", tree, io, "done", { result: result.slice() }));
    return Object.freeze(frames);
  }

  function createState(mode, rawKeys, first, second) {
    let frames;
    if (mode === "insert") frames = insertFrames(rawKeys, first);
    else if (mode === "delete") frames = deleteFrames(rawKeys, first);
    else if (mode === "range") frames = rangeFrames(rawKeys, first, second);
    else throw new Error("Неизвестный сценарий B+‑дерева.");
    return shared.deepFreeze({ mode: mode, frames: frames, frameIndex: 0, finished: frames.length === 1 });
  }

  function step(state) {
    if (state.finished) return state;
    const next = Math.min(state.frameIndex + 1, state.frames.length - 1);
    return shared.deepFreeze({ mode: state.mode, frames: state.frames, frameIndex: next, finished: next === state.frames.length - 1 });
  }

  function visualModel(state) {
    const frame = state.frames[state.frameIndex];
    return shared.deepFreeze({
      mode: state.mode,
      frameIndex: state.frameIndex,
      frameCount: state.frames.length,
      frame: frame,
      exact: true,
    });
  }

  return {
    MAX_KEYS: MAX_KEYS,
    PAGE_CAPACITY: PAGE_CAPACITY,
    parseKeys: parseKeys,
    partitionBalanced: partitionBalanced,
    treeFromLeafArrays: treeFromLeafArrays,
    buildTree: buildTree,
    locateLeaf: locateLeaf,
    insertFrames: insertFrames,
    deleteFrames: deleteFrames,
    rangeFrames: rangeFrames,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
