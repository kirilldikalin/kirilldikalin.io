(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LinearDataStructuresCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_VALUES = 18;

  function normalizeValues(rawValues) {
    const values = rawValues === undefined ? [7, 12, 4, 19, 8, 3, 15] : rawValues;
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_VALUES) {
      throw new RangeError("values: требуется от 1 до " + MAX_VALUES + " элементов");
    }
    return Object.freeze(values.map(function (rawValue) {
      return shared.boundedInteger(rawValue, "value", -999, 999);
    }));
  }

  function freezeFrame(frame) {
    return shared.deepFreeze(frame);
  }

  function dynamicArrayTrace(rawValues, rawCapacity) {
    const values = normalizeValues(rawValues);
    const initialCapacity = shared.boundedInteger(
      rawCapacity === undefined ? 2 : rawCapacity,
      "initialCapacity",
      1,
      8
    );
    const frames = [];
    let capacity = initialCapacity;
    let memory = Array(capacity).fill(null);
    let size = 0;
    let actualCost = 0;
    let completedPushes = 0;

    frames.push(freezeFrame({
      mode: "dynamic",
      action: "initial",
      message: "Выделен начальный непрерывный блок на " + capacity + " ячейки",
      oldMemory: null,
      memory: memory.slice(),
      activeIndex: null,
      movedIndices: [],
      size: size,
      capacity: capacity,
      actualCost: actualCost,
      completedPushes: completedPushes,
      amortizedBudget: 0,
    }));

    values.forEach(function (value) {
      if (size === capacity) {
        const oldMemory = memory.slice();
        const nextCapacity = capacity * 2;
        const nextMemory = Array(nextCapacity).fill(null);
        frames.push(freezeFrame({
          mode: "dynamic",
          action: "allocate",
          message: "Свободных ячеек нет: выделяем новый блок ёмкости " + nextCapacity,
          oldMemory: oldMemory,
          memory: nextMemory.slice(),
          activeIndex: null,
          movedIndices: [],
          size: size,
          capacity: nextCapacity,
          actualCost: actualCost,
          completedPushes: completedPushes,
          amortizedBudget: 3 * completedPushes,
        }));
        for (let index = 0; index < size; index += 1) {
          nextMemory[index] = oldMemory[index];
          actualCost += 1;
          frames.push(freezeFrame({
            mode: "dynamic",
            action: "copy",
            message: "Копируем элемент " + oldMemory[index] + " из старой ячейки " + index,
            oldMemory: oldMemory,
            memory: nextMemory.slice(),
            activeIndex: index,
            movedIndices: Array.from({ length: index + 1 }, function (_, item) { return item; }),
            size: size,
            capacity: nextCapacity,
            actualCost: actualCost,
            completedPushes: completedPushes,
            amortizedBudget: 3 * completedPushes,
          }));
        }
        capacity = nextCapacity;
        memory = nextMemory;
      }
      memory[size] = value;
      actualCost += 1;
      size += 1;
      completedPushes += 1;
      frames.push(freezeFrame({
        mode: "dynamic",
        action: "write",
        message: "Записываем " + value + " в следующую свободную ячейку",
        oldMemory: null,
        memory: memory.slice(),
        activeIndex: size - 1,
        movedIndices: [],
        size: size,
        capacity: capacity,
        actualCost: actualCost,
        completedPushes: completedPushes,
        amortizedBudget: 3 * completedPushes,
      }));
    });
    return shared.deepFreeze({ mode: "dynamic", values: values, frames: frames });
  }

  function arrayInsertionTrace(rawValues, rawIndex, rawValue) {
    const values = normalizeValues(rawValues);
    const index = shared.boundedInteger(
      rawIndex === undefined ? Math.floor(values.length / 2) : rawIndex,
      "index",
      0,
      values.length
    );
    const value = shared.boundedInteger(rawValue === undefined ? 42 : rawValue, "value", -999, 999);
    const memory = values.concat([null]);
    const frames = [freezeFrame({
      mode: "array-insert", action: "initial", message: "Место вставки найдено, но ячейка занята",
      memory: memory.slice(), activeIndex: index, movedIndices: [], size: values.length,
      capacity: memory.length, actualCost: 0, completedPushes: 0, amortizedBudget: null,
    })];
    let cost = 0;
    const moved = [];
    for (let cursor = values.length; cursor > index; cursor -= 1) {
      memory[cursor] = memory[cursor - 1];
      cost += 1;
      moved.push(cursor);
      frames.push(freezeFrame({
        mode: "array-insert", action: "shift",
        message: "Сдвигаем " + memory[cursor] + " из ячейки " + (cursor - 1) + " в ячейку " + cursor,
        memory: memory.slice(), activeIndex: cursor, movedIndices: moved.slice(), size: values.length,
        capacity: memory.length, actualCost: cost, completedPushes: 0, amortizedBudget: null,
      }));
    }
    memory[index] = value;
    cost += 1;
    frames.push(freezeFrame({
      mode: "array-insert", action: "write", message: "Освободившуюся ячейку занимает " + value,
      memory: memory.slice(), activeIndex: index, movedIndices: moved.slice(), size: values.length + 1,
      capacity: memory.length, actualCost: cost, completedPushes: 0, amortizedBudget: null,
    }));
    return shared.deepFreeze({ mode: "array-insert", values: values, frames: frames });
  }

  function listAddress(index) {
    return 100 + ((index * 137 + 53) % 617);
  }

  function linkedListTrace(rawValues, rawIndex, rawValue) {
    const values = normalizeValues(rawValues);
    const index = shared.boundedInteger(
      rawIndex === undefined ? Math.floor(values.length / 2) : rawIndex,
      "index",
      0,
      values.length
    );
    const value = shared.boundedInteger(rawValue === undefined ? 42 : rawValue, "value", -999, 999);
    const nodes = values.map(function (item, position) {
      return { id: "n" + position, value: item, address: listAddress(position), next: position + 1 < values.length ? "n" + (position + 1) : null };
    });
    const frames = [freezeFrame({
      mode: "list-insert", action: "initial", message: "Узлы расположены независимо, порядок задают ссылки",
      nodes: nodes.map(function (node) { return Object.assign({}, node); }), activeNodeId: nodes.length ? nodes[0].id : null,
      traversedIds: [], actualCost: 0, pointerWrites: 0, insertedNodeId: null,
    })];
    const traversed = [];
    let cost = 0;
    const stop = Math.max(0, index - 1);
    for (let cursor = 0; cursor < stop; cursor += 1) {
      traversed.push(nodes[cursor].id);
      cost += 1;
      frames.push(freezeFrame({
        mode: "list-insert", action: "follow", message: "Читаем next и переходим к следующему узлу",
        nodes: nodes.map(function (node) { return Object.assign({}, node); }), activeNodeId: nodes[cursor + 1].id,
        traversedIds: traversed.slice(), actualCost: cost, pointerWrites: 0, insertedNodeId: null,
      }));
    }
    const inserted = { id: "new", value: value, address: listAddress(values.length + 4), next: index < nodes.length ? nodes[index].id : null };
    nodes.push(inserted);
    cost += 1;
    frames.push(freezeFrame({
      mode: "list-insert", action: "allocate", message: "Новый узел выделен отдельно; его next уже указывает на продолжение",
      nodes: nodes.map(function (node) { return Object.assign({}, node); }), activeNodeId: inserted.id,
      traversedIds: traversed.slice(), actualCost: cost, pointerWrites: 1, insertedNodeId: inserted.id,
    }));
    if (index > 0) {
      nodes[index - 1].next = inserted.id;
    }
    cost += 1;
    frames.push(freezeFrame({
      mode: "list-insert", action: "rewire", message: index === 0
        ? "Головной указатель перенаправлен на новый узел"
        : "Предыдущий узел перенаправлен на новый",
      nodes: nodes.map(function (node) { return Object.assign({}, node); }), activeNodeId: inserted.id,
      traversedIds: traversed.slice(), actualCost: cost, pointerWrites: 2, insertedNodeId: inserted.id,
      headId: index === 0 ? inserted.id : nodes[0].id,
    }));
    return shared.deepFreeze({ mode: "list-insert", values: values, frames: frames });
  }

  function createState(mode, options) {
    const settings = options || {};
    let trace;
    if (mode === "array-insert") {
      trace = arrayInsertionTrace(settings.values, settings.index, settings.value);
    } else if (mode === "list-insert") {
      trace = linkedListTrace(settings.values, settings.index, settings.value);
    } else {
      trace = dynamicArrayTrace(settings.values, settings.initialCapacity);
    }
    return Object.freeze({ trace: trace, frameIndex: 0, frame: trace.frames[0], finished: trace.frames.length <= 1 });
  }

  function step(state) {
    if (state.finished) return state;
    const frameIndex = state.frameIndex + 1;
    return Object.freeze({
      trace: state.trace,
      frameIndex: frameIndex,
      frame: state.trace.frames[frameIndex],
      finished: frameIndex >= state.trace.frames.length - 1,
    });
  }

  function visualModel(state) {
    const frame = state.frame;
    if (frame.mode === "list-insert") {
      return shared.deepFreeze(Object.assign({}, frame, {
        nodes: frame.nodes.slice(0, 18),
        omittedNodes: Math.max(0, frame.nodes.length - 18),
        schematic: frame.nodes.length > 18,
      }));
    }
    return shared.deepFreeze(Object.assign({}, frame, {
      memory: frame.memory.slice(0, 24),
      oldMemory: frame.oldMemory ? frame.oldMemory.slice(0, 24) : null,
      omittedCells: Math.max(0, frame.memory.length - 24),
      schematic: frame.memory.length > 24 || Boolean(frame.oldMemory && frame.oldMemory.length > 24),
    }));
  }

  return {
    MAX_VALUES: MAX_VALUES,
    normalizeValues: normalizeValues,
    dynamicArrayTrace: dynamicArrayTrace,
    arrayInsertionTrace: arrayInsertionTrace,
    linkedListTrace: linkedListTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
