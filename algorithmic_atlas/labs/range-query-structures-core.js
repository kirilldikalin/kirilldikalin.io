(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RangeQueryStructuresCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_ITEMS = 16;

  function parseArray(rawValue) {
    const parts = Array.isArray(rawValue) ? rawValue : String(rawValue).trim().split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new Error("Введите непустой массив.");
    if (parts.length > MAX_ITEMS) throw new RangeError("Для наглядной схемы разрешено не более 16 элементов.");
    return Object.freeze(parts.map(function (part) {
      const value = Number(part);
      if (!Number.isSafeInteger(value)) throw new Error("Массив принимает только безопасные целые числа.");
      return value;
    }));
  }

  function lowbit(index) {
    const value = shared.boundedInteger(index, "Индекс", 1, 1 << 29);
    return value & -value;
  }

  function buildFenwick(values) {
    const array = parseArray(values);
    const bit = Array(array.length + 1).fill(0);
    array.forEach(function (value, zeroIndex) {
      let index = zeroIndex + 1;
      while (index <= array.length) {
        bit[index] += value;
        index += lowbit(index);
      }
    });
    return Object.freeze(bit);
  }

  function prefixTrace(bit, index, sign, label) {
    const frames = [];
    let cursor = index;
    let sum = 0;
    while (cursor > 0) {
      sum += sign * bit[cursor];
      frames.push(shared.deepFreeze({
        action: "fenwick-take",
        index: cursor,
        blockStart: cursor - lowbit(cursor) + 1,
        blockEnd: cursor,
        contribution: sign * bit[cursor],
        sum: sum,
        label: label,
      }));
      cursor -= lowbit(cursor);
    }
    return frames;
  }

  function fenwickFrames(rawValues, rawLeft, rawRight) {
    const values = parseArray(rawValues);
    const left = shared.boundedInteger(rawLeft, "Левая граница", 1, values.length);
    const right = shared.boundedInteger(rawRight, "Правая граница", left, values.length);
    const bit = buildFenwick(values);
    const rightFrames = prefixTrace(bit, right, 1, "prefix(" + right + ")");
    const leftFrames = prefixTrace(bit, left - 1, -1, "−prefix(" + (left - 1) + ")");
    let total = 0;
    const selected = [];
    const frames = [shared.deepFreeze({ action: "start", message: "Разлагаем [" + left + ", " + right + "] на двоичные блоки.", total: 0, selected: [] })];
    rightFrames.concat(leftFrames).forEach(function (frame) {
      total += frame.contribution;
      selected.push(frame);
      frames.push(shared.deepFreeze({ action: frame.action, message: frame.label + ": берём [" + frame.blockStart + ", " + frame.blockEnd + "]", total: total, selected: selected.slice() }));
    });
    frames.push(shared.deepFreeze({ action: "done", message: "Сумма диапазона равна " + total + ".", total: total, selected: [] }));
    return shared.deepFreeze({ values: values, bit: bit, left: left, right: right, frames: frames });
  }

  function makeSegment(values, left, right, index, nodes) {
    const node = { index: index, left: left, right: right, sum: 0, lazy: 0, depth: Math.floor(Math.log2(index)) };
    nodes[index] = node;
    if (right - left === 1) {
      node.sum = values[left];
    } else {
      const middle = Math.floor((left + right) / 2);
      makeSegment(values, left, middle, index * 2, nodes);
      makeSegment(values, middle, right, index * 2 + 1, nodes);
      node.sum = nodes[index * 2].sum + nodes[index * 2 + 1].sum;
    }
    return node;
  }

  function buildSegmentTree(rawValues) {
    const values = parseArray(rawValues);
    const nodes = [];
    makeSegment(values, 0, values.length, 1, nodes);
    return nodes;
  }

  function cloneNodes(nodes) {
    return nodes.map(function (node) { return node ? Object.assign({}, node) : null; });
  }

  function querySegment(nodes, index, queryLeft, queryRight, frames) {
    const node = nodes[index];
    if (queryRight <= node.left || node.right <= queryLeft) {
      frames.push({ action: "skip", node: index, contribution: 0, message: "[" + node.left + ", " + node.right + ") не пересекается с запросом." });
      return 0;
    }
    if (queryLeft <= node.left && node.right <= queryRight) {
      frames.push({ action: "take", node: index, contribution: node.sum, message: "[" + node.left + ", " + node.right + ") целиком покрыт: берём сумму " + node.sum + "." });
      return node.sum;
    }
    frames.push({ action: "split", node: index, contribution: 0, message: "[" + node.left + ", " + node.right + ") пересекается частично: спускаемся к детям." });
    return querySegment(nodes, index * 2, queryLeft, queryRight, frames) + querySegment(nodes, index * 2 + 1, queryLeft, queryRight, frames);
  }

  function segmentQueryFrames(rawValues, rawLeft, rawRight) {
    const values = parseArray(rawValues);
    const left = shared.boundedInteger(rawLeft, "Левая граница", 0, values.length - 1);
    const right = shared.boundedInteger(rawRight, "Правая граница", left + 1, values.length);
    const nodes = buildSegmentTree(values);
    const events = [];
    const answer = querySegment(nodes, 1, left, right, events);
    let total = 0;
    const frames = [{ action: "start", node: null, total: 0, message: "Разлагаем [" + left + ", " + right + ") на непересекающиеся вершины." }];
    events.forEach(function (event) {
      total += event.contribution;
      frames.push(Object.assign({ total: total }, event));
    });
    frames.push({ action: "done", node: null, total: answer, message: "Сумма покрывающих вершин равна " + answer + "." });
    return shared.deepFreeze({ values: values, nodes: cloneNodes(nodes), left: left, right: right, frames: frames });
  }

  function applyToNode(nodes, index, delta) {
    const node = nodes[index];
    node.sum += delta * (node.right - node.left);
    node.lazy += delta;
  }

  function push(nodes, index, events) {
    const node = nodes[index];
    if (!node.lazy || node.right - node.left === 1) return;
    const pending = node.lazy;
    applyToNode(nodes, index * 2, pending);
    applyToNode(nodes, index * 2 + 1, pending);
    node.lazy = 0;
    events.push({ action: "push", node: index, message: "Перед спуском передаём lazy=" + pending + " обоим детям.", nodes: cloneNodes(nodes) });
  }

  function updateSegment(nodes, index, queryLeft, queryRight, delta, events) {
    const node = nodes[index];
    if (queryRight <= node.left || node.right <= queryLeft) {
      events.push({ action: "skip", node: index, message: "Этот сегмент не меняется.", nodes: cloneNodes(nodes) });
      return;
    }
    if (queryLeft <= node.left && node.right <= queryRight) {
      applyToNode(nodes, index, delta);
      events.push({ action: "mark", node: index, message: "Сегмент покрыт целиком: сохраняем lazy=" + node.lazy + ".", nodes: cloneNodes(nodes) });
      return;
    }
    push(nodes, index, events);
    updateSegment(nodes, index * 2, queryLeft, queryRight, delta, events);
    updateSegment(nodes, index * 2 + 1, queryLeft, queryRight, delta, events);
    node.sum = nodes[index * 2].sum + nodes[index * 2 + 1].sum;
    events.push({ action: "pull", node: index, message: "Пересчитываем сумму родителя из двух детей.", nodes: cloneNodes(nodes) });
  }

  function lazyUpdateFrames(rawValues, rawLeft, rawRight, rawDelta) {
    const values = parseArray(rawValues);
    const left = shared.boundedInteger(rawLeft, "Левая граница", 0, values.length - 1);
    const right = shared.boundedInteger(rawRight, "Правая граница", left + 1, values.length);
    const delta = shared.boundedInteger(rawDelta, "Прибавка", -1000, 1000);
    const nodes = buildSegmentTree(values);
    const events = [];
    updateSegment(nodes, 1, left, right, delta, events);
    const frames = [{ action: "start", node: null, message: "Прибавляем " + delta + " на [" + left + ", " + right + "), не заходя в каждый лист.", nodes: buildSegmentTree(values) }].concat(events);
    frames.push({ action: "done", node: null, message: "Корень хранит новую сумму, а отложенные метки останутся до нужного спуска.", nodes: cloneNodes(nodes) });
    return shared.deepFreeze({ values: values, left: left, right: right, delta: delta, frames: frames });
  }

  function createState(mode, rawValues, left, right, delta) {
    let scenario;
    if (mode === "fenwick") scenario = fenwickFrames(rawValues, left, right);
    else if (mode === "segment") scenario = segmentQueryFrames(rawValues, left, right);
    else if (mode === "lazy") scenario = lazyUpdateFrames(rawValues, left, right, delta);
    else throw new Error("Неизвестная структура диапазонного запроса.");
    return shared.deepFreeze({ mode: mode, scenario: scenario, frameIndex: 0, finished: false });
  }

  function step(state) {
    if (state.finished) return state;
    const next = Math.min(state.frameIndex + 1, state.scenario.frames.length - 1);
    return shared.deepFreeze({ mode: state.mode, scenario: state.scenario, frameIndex: next, finished: next === state.scenario.frames.length - 1 });
  }

  function visualModel(state) {
    return shared.deepFreeze({ mode: state.mode, scenario: state.scenario, frame: state.scenario.frames[state.frameIndex], exact: true });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    parseArray: parseArray,
    lowbit: lowbit,
    buildFenwick: buildFenwick,
    fenwickFrames: fenwickFrames,
    buildSegmentTree: buildSegmentTree,
    segmentQueryFrames: segmentQueryFrames,
    lazyUpdateFrames: lazyUpdateFrames,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
