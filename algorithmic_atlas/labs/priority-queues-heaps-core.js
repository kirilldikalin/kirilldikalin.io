(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PriorityQueuesHeapsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_ITEMS = 31;

  function parentIndex(index) {
    return index <= 0 ? null : Math.floor((index - 1) / 2);
  }

  function leftIndex(index) {
    return 2 * index + 1;
  }

  function rightIndex(index) {
    return 2 * index + 2;
  }

  function normalizeValues(rawValues, allowEmpty) {
    if (!Array.isArray(rawValues)) throw new TypeError("values должны быть массивом");
    if ((!allowEmpty && rawValues.length === 0) || rawValues.length > MAX_ITEMS) {
      throw new RangeError("число элементов должно быть от " + (allowEmpty ? 0 : 1) + " до " + MAX_ITEMS);
    }
    return rawValues.map(function (value, index) {
      return shared.boundedInteger(value, "values[" + index + "]", -999, 999);
    });
  }

  function isMinHeap(values) {
    for (let index = 1; index < values.length; index += 1) {
      if (values[parentIndex(index)] > values[index]) return false;
    }
    return true;
  }

  function frame(phase, heap, details) {
    const data = details || {};
    return shared.deepFreeze({
      phase: phase,
      heap: heap.slice(),
      activeIndices: (data.activeIndices || []).slice(),
      swapped: data.swapped ? data.swapped.slice() : null,
      path: (data.path || []).slice(),
      comparisons: data.comparisons || 0,
      swaps: data.swaps || 0,
      extracted: data.extracted === undefined ? null : data.extracted,
      message: data.message || "",
      finished: Boolean(data.finished),
    });
  }

  function siftDown(heap, start, length, frames, counters, path) {
    let index = start;
    while (leftIndex(index) < length) {
      const left = leftIndex(index);
      const right = rightIndex(index);
      let smallest = left;
      counters.comparisons += 1;
      if (right < length) {
        counters.comparisons += 1;
        if (heap[right] < heap[left]) smallest = right;
      }
      frames.push(frame("compare", heap, {
        activeIndices: right < length ? [index, left, right] : [index, left],
        path: path,
        comparisons: counters.comparisons,
        swaps: counters.swaps,
        message: "Сравниваем родителя с меньшим из его детей",
      }));
      if (heap[index] <= heap[smallest]) break;
      const temporary = heap[index];
      heap[index] = heap[smallest];
      heap[smallest] = temporary;
      counters.swaps += 1;
      path.push(smallest);
      frames.push(frame("swap", heap, {
        activeIndices: [index, smallest],
        swapped: [index, smallest],
        path: path,
        comparisons: counters.comparisons,
        swaps: counters.swaps,
        message: "Меньший ключ поднимается, нарушение опускается вниз",
      }));
      index = smallest;
    }
  }

  function buildHeapFrames(rawValues) {
    const heap = normalizeValues(rawValues, false);
    const frames = [frame("initial", heap, { message: "Исходный массив ещё не обязан быть кучей" })];
    const counters = { comparisons: 0, swaps: 0 };
    for (let index = Math.floor(heap.length / 2) - 1; index >= 0; index -= 1) {
      frames.push(frame("subtree", heap, {
        activeIndices: [index], comparisons: counters.comparisons, swaps: counters.swaps,
        path: [index], message: "Восстанавливаем подкучу с корнем в позиции " + index,
      }));
      siftDown(heap, index, heap.length, frames, counters, [index]);
    }
    frames.push(frame("done", heap, {
      comparisons: counters.comparisons, swaps: counters.swaps, finished: true,
      message: "Все поддеревья удовлетворяют свойству min-heap",
    }));
    return shared.deepFreeze(frames);
  }

  function insertFrames(rawValues, rawValue) {
    const heap = normalizeValues(rawValues, true);
    if (!isMinHeap(heap)) throw new RangeError("исходный массив должен быть min-heap");
    if (heap.length >= MAX_ITEMS) throw new RangeError("куча достигла предела лаборатории");
    const value = shared.boundedInteger(rawValue, "value", -999, 999);
    const frames = [frame("initial", heap, { message: "Куча до вставки" })];
    heap.push(value);
    let index = heap.length - 1;
    const path = [index];
    let comparisons = 0;
    let swaps = 0;
    frames.push(frame("append", heap, {
      activeIndices: [index], path: path, message: "Новый ключ добавлен в первую свободную позицию",
    }));
    while (index > 0) {
      const parent = parentIndex(index);
      comparisons += 1;
      frames.push(frame("compare", heap, {
        activeIndices: [parent, index], path: path,
        comparisons: comparisons, swaps: swaps,
        message: "Сравниваем новый ключ с родителем",
      }));
      if (heap[parent] <= heap[index]) break;
      const temporary = heap[parent];
      heap[parent] = heap[index];
      heap[index] = temporary;
      swaps += 1;
      path.push(parent);
      frames.push(frame("swap", heap, {
        activeIndices: [parent, index], swapped: [parent, index], path: path,
        comparisons: comparisons, swaps: swaps,
        message: "Меняем ключи местами и продолжаем вверх",
      }));
      index = parent;
    }
    frames.push(frame("done", heap, {
      path: path, comparisons: comparisons, swaps: swaps, finished: true,
      message: "Вставка завершена: свойство кучи восстановлено",
    }));
    return shared.deepFreeze(frames);
  }

  function extractMinFrames(rawValues) {
    const heap = normalizeValues(rawValues, false);
    if (!isMinHeap(heap)) throw new RangeError("исходный массив должен быть min-heap");
    const extracted = heap[0];
    const frames = [frame("initial", heap, { extracted: extracted, message: "Минимум находится в корне" })];
    if (heap.length === 1) {
      frames.push(frame("done", [], { extracted: extracted, finished: true, message: "Единственный элемент удалён" }));
      return shared.deepFreeze(frames);
    }
    heap[0] = heap.pop();
    const counters = { comparisons: 0, swaps: 0 };
    frames.push(frame("replace-root", heap, {
      activeIndices: [0], extracted: extracted, path: [0],
      message: "Последний ключ перенесён в корень; нарушение будет опущено вниз",
    }));
    siftDown(heap, 0, heap.length, frames, counters, [0]);
    frames.push(frame("done", heap, {
      extracted: extracted, comparisons: counters.comparisons, swaps: counters.swaps,
      finished: true, message: "Минимум удалён, свойство кучи восстановлено",
    }));
    return shared.deepFreeze(frames);
  }

  function binaryState(operation, options) {
    const settings = options || {};
    const values = settings.values || [2, 5, 4, 11, 9, 8, 7, 18, 14];
    let frames;
    if (operation === "build") frames = buildHeapFrames(values);
    else if (operation === "extract") frames = extractMinFrames(values);
    else frames = insertFrames(values, settings.value === undefined ? 1 : settings.value);
    return shared.deepFreeze({ mode: "binary", operation: operation || "insert", frames: frames, cursor: 0, finished: frames.length === 1 });
  }

  function fibonacciPotential(roots, marked) {
    const rootCount = shared.boundedInteger(roots, "roots", 0, 1000);
    const markedCount = shared.boundedInteger(marked, "marked", 0, 1000);
    return rootCount + 2 * markedCount;
  }

  function fibFrame(phase, roots, marked, actual, initialPotential, message, finished) {
    const potential = fibonacciPotential(roots, marked);
    const deltaPotential = potential - initialPotential;
    return shared.deepFreeze({
      phase: phase, roots: roots, marked: marked, potential: potential,
      actual: actual, deltaPotential: deltaPotential,
      amortized: actual + deltaPotential, message: message, finished: Boolean(finished),
    });
  }

  function fibonacciFrames(operation, rawCuts) {
    const cuts = shared.boundedInteger(rawCuts === undefined ? 4 : rawCuts, "cuts", 1, 8);
    let roots = operation === "extract" ? 8 : 5;
    let marked = operation === "decrease" ? cuts - 1 : 2;
    const initialPotential = fibonacciPotential(roots, marked);
    const frames = [fibFrame("initial", roots, marked, 0, initialPotential, "Потенциал до операции", false)];
    if (operation === "insert") {
      roots += 1;
      frames.push(fibFrame("insert-root", roots, marked, 1, initialPotential, "Новый одноузловой корень добавлен в список", true));
    } else if (operation === "decrease") {
      let actual = 1;
      for (let index = 0; index < cuts; index += 1) {
        roots += 1;
        actual += 1;
        if (index > 0 && marked > 0) marked -= 1;
        frames.push(fibFrame("cut", roots, marked, actual, initialPotential, "Отрезаем нарушившее порядок дерево и продолжаем каскад", false));
      }
      marked += 1;
      frames.push(fibFrame("mark", roots, marked, actual, initialPotential, "Первый неотмеченный предок получает метку; каскад остановлен", true));
    } else {
      const links = 5;
      let actual = 2;
      roots -= 1;
      frames.push(fibFrame("remove-min", roots, marked, actual, initialPotential, "Минимальный корень удалён, его дети стали корнями", false));
      for (let index = 0; index < links; index += 1) {
        roots -= 1;
        actual += 2;
        frames.push(fibFrame("link", roots, marked, actual, initialPotential, "Два корня одинаковой степени связаны в одно дерево", index === links - 1));
      }
    }
    return shared.deepFreeze(frames);
  }

  function fibonacciState(operation, options) {
    const chosen = operation === "insert" || operation === "decrease" || operation === "extract" ? operation : "decrease";
    const frames = fibonacciFrames(chosen, options && options.cuts);
    return shared.deepFreeze({ mode: "fibonacci", operation: chosen, frames: frames, cursor: 0, finished: frames.length === 1 });
  }

  function createState(mode, operation, options) {
    return mode === "fibonacci" ? fibonacciState(operation, options) : binaryState(operation, options);
  }

  function step(state) {
    if (state.finished) return state;
    const cursor = Math.min(state.frames.length - 1, state.cursor + 1);
    return shared.deepFreeze({
      mode: state.mode, operation: state.operation, frames: state.frames,
      cursor: cursor, finished: cursor >= state.frames.length - 1,
    });
  }

  function nodeHeight(index, length) {
    let height = 0;
    let left = leftIndex(index);
    while (left < length) {
      height += 1;
      left = leftIndex(left);
    }
    return height;
  }

  function bottomUpHeightSum(rawLength) {
    const length = shared.boundedInteger(rawLength, "length", 1, 100000);
    let total = 0;
    for (let index = 0; index < Math.floor(length / 2); index += 1) {
      total += nodeHeight(index, length);
    }
    return total;
  }

  function visualModel(state) {
    const current = state.frames[state.cursor];
    if (state.mode === "fibonacci") {
      return shared.deepFreeze({
        mode: state.mode, operation: state.operation, cursor: state.cursor,
        frameCount: state.frames.length, current: current,
        identityHolds: current.amortized === current.actual + current.deltaPotential,
      });
    }
    return shared.deepFreeze({
      mode: state.mode, operation: state.operation, cursor: state.cursor,
      frameCount: state.frames.length, current: current,
      heapValid: isMinHeap(current.heap),
      visibleItems: current.heap.slice(0, MAX_ITEMS),
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    parentIndex: parentIndex,
    leftIndex: leftIndex,
    rightIndex: rightIndex,
    isMinHeap: isMinHeap,
    buildHeapFrames: buildHeapFrames,
    insertFrames: insertFrames,
    extractMinFrames: extractMinFrames,
    binaryState: binaryState,
    fibonacciPotential: fibonacciPotential,
    fibonacciFrames: fibonacciFrames,
    fibonacciState: fibonacciState,
    createState: createState,
    step: step,
    nodeHeight: nodeHeight,
    bottomUpHeightSum: bottomUpHeightSum,
    visualModel: visualModel,
  };
});
