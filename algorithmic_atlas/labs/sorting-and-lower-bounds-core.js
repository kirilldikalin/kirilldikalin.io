(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SortingAndLowerBoundsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ITEMS = 10;
  const MAX_DECISION_N = 4;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return value;
  }

  function parseArray(raw) {
    const parts = String(raw).split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 2 || parts.length > MAX_ITEMS) {
      throw new Error("Введите от 2 до " + MAX_ITEMS + " целых чисел.");
    }
    return parts.map(function (part) {
      if (!/^-?\d+$/.test(part)) throw new Error("Массив содержит нецелое значение.");
      const value = Number(part);
      if (!Number.isSafeInteger(value) || Math.abs(value) > 999) {
        throw new Error("Используйте целые числа от −999 до 999.");
      }
      return value;
    });
  }

  function seededRandom(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function items(values) {
    return values.map(function (value, index) { return { value: value, id: index }; });
  }

  function cloneItems(array) {
    return array.map(function (item) { return { value: item.value, id: item.id }; });
  }

  function metrics() {
    return { comparisons: 0, writes: 0, swaps: 0, maxDepth: 1, auxiliarySlots: 0 };
  }

  function copyMetrics(value) {
    return {
      comparisons: value.comparisons,
      writes: value.writes,
      swaps: value.swaps,
      maxDepth: value.maxDepth,
      auxiliarySlots: value.auxiliarySlots,
    };
  }

  function recorder(array, values) {
    const frames = [];
    function add(action, message, marks, depth) {
      frames.push({
        action: action,
        message: message,
        array: cloneItems(array),
        marks: Object.assign({}, marks || {}),
        depth: depth || 1,
        metrics: copyMetrics(values),
      });
    }
    return { frames: frames, add: add };
  }

  function swap(array, left, right, values) {
    if (left === right) return;
    const temporary = array[left];
    array[left] = array[right];
    array[right] = temporary;
    values.swaps += 1;
    values.writes += 2;
  }

  function insertionScenario(input) {
    const array = items(input);
    const value = metrics();
    const record = recorder(array, value);
    record.add("start", "Начинаем с одноэлементного отсортированного префикса.", {
      sortedEnd: 0,
    });
    for (let index = 1; index < array.length; index += 1) {
      const key = array[index];
      let position = index - 1;
      record.add("key", "Запоминаем следующий элемент и ищем ему место в префиксе.", {
        active: index,
        sortedEnd: index - 1,
      });
      while (position >= 0) {
        value.comparisons += 1;
        record.add("compare", "Сравниваем ключ с элементом слева.", {
          compared: [position, position + 1],
          sortedEnd: index - 1,
        });
        if (array[position].value <= key.value) break;
        array[position + 1] = array[position];
        value.writes += 1;
        position -= 1;
        record.add("shift", "Больший элемент сдвинут вправо.", {
          active: position + 1,
          sortedEnd: index,
        });
      }
      array[position + 1] = key;
      value.writes += 1;
      record.add("insert", "Ключ вставлен после последнего не большего элемента.", {
        active: position + 1,
        sortedEnd: index,
      });
    }
    record.add("done", "Весь массив стал неубывающим; равные ключи сохранили порядок.", {
      sortedEnd: array.length - 1,
    });
    return { algorithm: "insertion", frames: record.frames, stable: true, inPlace: true };
  }

  function mergeScenario(input) {
    const array = items(input);
    const value = metrics();
    value.auxiliarySlots = array.length;
    const record = recorder(array, value);
    const auxiliary = new Array(array.length);
    record.add("start", "Делим диапазон, пока каждая подзадача не станет одноэлементной.", {});

    function sort(left, right, depth) {
      value.maxDepth = Math.max(value.maxDepth, depth);
      if (right - left <= 1) return;
      const middle = Math.floor((left + right) / 2);
      record.add("split", "Разрезаем [" + left + ", " + right + ") в точке " + middle + ".", {
        range: [left, right],
        split: middle,
      }, depth);
      sort(left, middle, depth + 1);
      sort(middle, right, depth + 1);
      let first = left;
      let second = middle;
      let target = left;
      while (first < middle && second < right) {
        value.comparisons += 1;
        const takeLeft = array[first].value <= array[second].value;
        auxiliary[target] = takeLeft ? array[first++] : array[second++];
        value.writes += 1;
        record.add("merge-compare", "Берём меньшую голову двух отсортированных половин.", {
          range: [left, right],
          compared: [first - (takeLeft ? 1 : 0), second - (takeLeft ? 0 : 1)],
          output: target,
        }, depth);
        target += 1;
      }
      while (first < middle) {
        auxiliary[target++] = array[first++];
        value.writes += 1;
      }
      while (second < right) {
        auxiliary[target++] = array[second++];
        value.writes += 1;
      }
      for (let index = left; index < right; index += 1) {
        array[index] = auxiliary[index];
        value.writes += 1;
      }
      record.add("merge", "Слили две половины обратно в исходный диапазон.", {
        range: [left, right],
        sortedRange: [left, right],
      }, depth);
    }

    sort(0, array.length, 1);
    record.add("done", "Все слияния завершены; выбор левого элемента при равенстве сохранил устойчивость.", {
      sortedRange: [0, array.length],
    });
    return { algorithm: "merge", frames: record.frames, stable: true, inPlace: false };
  }

  function heapScenario(input) {
    const array = items(input);
    const value = metrics();
    const record = recorder(array, value);
    record.add("start", "Строим max-heap в том же массиве.", { heapEnd: array.length });

    function siftDown(root, end) {
      while (2 * root + 1 < end) {
        let child = 2 * root + 1;
        if (child + 1 < end) {
          value.comparisons += 1;
          if (array[child].value < array[child + 1].value) child += 1;
        }
        value.comparisons += 1;
        record.add("heap-compare", "Сравниваем родителя с большим ребёнком.", {
          compared: [root, child],
          heapEnd: end,
        });
        if (array[root].value >= array[child].value) return;
        swap(array, root, child, value);
        record.add("heap-swap", "Поднимаем больший элемент и продолжаем просеивание.", {
          swapped: [root, child],
          heapEnd: end,
        });
        root = child;
      }
    }

    for (let root = Math.floor(array.length / 2) - 1; root >= 0; root -= 1) {
      siftDown(root, array.length);
    }
    record.add("heap-built", "Куча построена снизу вверх за линейное число просеиваний.", {
      heapEnd: array.length,
    });
    for (let end = array.length - 1; end > 0; end -= 1) {
      swap(array, 0, end, value);
      record.add("extract", "Максимум перенесён в окончательную позицию.", {
        swapped: [0, end],
        heapEnd: end,
        sortedRange: [end, array.length],
      });
      siftDown(0, end);
    }
    record.add("done", "Куча исчерпана; массив отсортирован на месте.", {
      sortedRange: [0, array.length],
      heapEnd: 0,
    });
    return { algorithm: "heap", frames: record.frames, stable: false, inPlace: true };
  }

  function quickScenario(input, pivotPolicy, seed) {
    const array = items(input);
    const value = metrics();
    const random = seededRandom(seed);
    const record = recorder(array, value);
    record.add("start", "Разбиваем диапазоны вокруг опорного элемента.", {});

    function pivotIndex(left, right) {
      if (pivotPolicy === "random") {
        return left + Math.floor(random() * (right - left));
      }
      if (pivotPolicy === "median3" && right - left >= 3) {
        const candidates = [left, Math.floor((left + right - 1) / 2), right - 1];
        candidates.sort(function (a, b) { return array[a].value - array[b].value; });
        value.comparisons += 3;
        return candidates[1];
      }
      return right - 1;
    }

    function partition(left, right, depth) {
      const chosen = pivotIndex(left, right);
      swap(array, chosen, right - 1, value);
      const pivot = array[right - 1];
      record.add("pivot", "Выбран pivot " + pivot.value + ".", {
        range: [left, right],
        pivot: right - 1,
      }, depth);
      let boundary = left;
      for (let scan = left; scan < right - 1; scan += 1) {
        value.comparisons += 1;
        record.add("partition-compare", "Проверяем, относится ли элемент к левой части.", {
          range: [left, right],
          pivot: right - 1,
          compared: [scan, right - 1],
          boundary: boundary,
        }, depth);
        if (array[scan].value <= pivot.value) {
          swap(array, boundary, scan, value);
          boundary += 1;
        }
      }
      swap(array, boundary, right - 1, value);
      record.add("partition", "Pivot занял окончательное место; подзадачи независимы.", {
        range: [left, right],
        pivot: boundary,
        boundary: boundary,
      }, depth);
      return boundary;
    }

    function sort(left, right, depth) {
      value.maxDepth = Math.max(value.maxDepth, depth);
      if (right - left <= 1) return;
      const pivot = partition(left, right, depth);
      sort(left, pivot, depth + 1);
      sort(pivot + 1, right, depth + 1);
    }

    sort(0, array.length, 1);
    record.add("done", "Все поддиапазоны имеют длину не больше одного.", {
      sortedRange: [0, array.length],
    });
    return { algorithm: "quick", frames: record.frames, stable: false, inPlace: true };
  }

  function sortingScenario(raw, algorithm, pivotPolicy, seed) {
    const input = parseArray(raw);
    let scenario;
    if (algorithm === "insertion") scenario = insertionScenario(input);
    else if (algorithm === "merge") scenario = mergeScenario(input);
    else if (algorithm === "heap") scenario = heapScenario(input);
    else if (algorithm === "quick") scenario = quickScenario(input, pivotPolicy || "median3", seed);
    else throw new Error("Неизвестный алгоритм сортировки.");
    scenario.input = input.slice();
    scenario.pivotPolicy = pivotPolicy || null;
    return deepFreeze(scenario);
  }

  function factorialBigInt(n) {
    let result = 1n;
    for (let value = 2n; value <= BigInt(n); value += 1n) result *= value;
    return result;
  }

  function ceilLog2BigInt(value) {
    if (value <= 1n) return 0;
    let power = 1n;
    let exponent = 0;
    while (power < value) {
      power <<= 1n;
      exponent += 1;
    }
    return exponent;
  }

  function permutations(values) {
    if (values.length <= 1) return [values.slice()];
    const result = [];
    values.forEach(function (value, index) {
      const rest = values.slice(0, index).concat(values.slice(index + 1));
      permutations(rest).forEach(function (suffix) {
        result.push([value].concat(suffix));
      });
    });
    return result;
  }

  function insertionDecisionTrace(permutation) {
    const array = permutation.map(function (value, id) { return { value: value, id: id }; });
    const trace = [];
    for (let index = 1; index < array.length; index += 1) {
      const key = array[index];
      let position = index - 1;
      while (position >= 0) {
        const answer = array[position].value <= key.value;
        trace.push({
          label: "x" + array[position].id + " ≤ x" + key.id + "?",
          answer: answer,
        });
        if (answer) break;
        array[position + 1] = array[position];
        position -= 1;
      }
      array[position + 1] = key;
    }
    return trace;
  }

  function decisionTree(rawN) {
    const n = Number(rawN);
    if (!Number.isInteger(n) || n < 2 || n > MAX_DECISION_N) {
      throw new Error("Для дерева решений выберите n от 2 до " + MAX_DECISION_N + ".");
    }
    let nextId = 0;
    const root = { id: nextId++, label: null, yes: null, no: null, terminal: false, depth: 0 };
    permutations(Array.from({ length: n }, function (_, index) { return index; }))
      .forEach(function (permutation) {
        let node = root;
        insertionDecisionTrace(permutation).forEach(function (step) {
          if (!node.label) node.label = step.label;
          const edge = step.answer ? "yes" : "no";
          if (!node[edge]) {
            node[edge] = {
              id: nextId++,
              label: null,
              yes: null,
              no: null,
              terminal: false,
              depth: node.depth + 1,
            };
          }
          node = node[edge];
        });
        node.terminal = true;
        node.permutation = permutation.slice();
      });

    const nodes = [];
    let leaves = 0;
    let height = 0;
    (function collect(node) {
      nodes.push(node);
      height = Math.max(height, node.depth);
      if (node.terminal) leaves += 1;
      if (node.no) collect(node.no);
      if (node.yes) collect(node.yes);
    })(root);
    return deepFreeze({
      n: n,
      root: root,
      nodes: nodes,
      leaves: leaves,
      factorial: factorialBigInt(n).toString(),
      lowerBound: ceilLog2BigInt(factorialBigInt(n)),
      height: height,
    });
  }

  function createState(mode, raw, algorithm, pivotPolicy, seed) {
    if (mode === "decision") {
      const tree = decisionTree(raw);
      return deepFreeze({ mode: mode, scenario: tree, frameIndex: 0, finished: false });
    }
    const scenario = sortingScenario(raw, algorithm, pivotPolicy, seed);
    return deepFreeze({ mode: "sorting", scenario: scenario, frameIndex: 0, finished: false });
  }

  function step(state) {
    if (state.finished) return state;
    const last = state.mode === "decision"
      ? state.scenario.height
      : state.scenario.frames.length - 1;
    const next = Math.min(state.frameIndex + 1, last);
    return deepFreeze({
      mode: state.mode,
      scenario: state.scenario,
      frameIndex: next,
      finished: next === last,
    });
  }

  function visualModel(state) {
    return deepFreeze({
      mode: state.mode,
      scenario: state.scenario,
      frameIndex: state.frameIndex,
      frame: state.mode === "sorting" ? state.scenario.frames[state.frameIndex] : null,
      exact: true,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    MAX_DECISION_N: MAX_DECISION_N,
    parseArray: parseArray,
    seededRandom: seededRandom,
    sortingScenario: sortingScenario,
    factorialBigInt: factorialBigInt,
    ceilLog2BigInt: ceilLog2BigInt,
    decisionTree: decisionTree,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
