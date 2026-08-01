(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LocalSearchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WIDTH = 12;
  const HEIGHT = 8;
  const MAX_RESTARTS = 3;
  const MAX_TRACE_STEPS = 160;
  const STRATEGIES = Object.freeze(["first", "best", "anneal"]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function integer(value, minimum, maximum, name) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new RangeError(name + " вне допустимого диапазона");
    }
    return parsed;
  }

  function seededRandom(seedValue) {
    let state = integer(seedValue, 1, 0xffffffff, "Seed") >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  function key(x, y) {
    return x + ":" + y;
  }

  function peak(x, y, cx, cy, top, slope) {
    return top - slope * (Math.abs(x - cx) + Math.abs(y - cy));
  }

  function createLandscape(seedValue) {
    const seed = integer(seedValue, 1, 0xffffffff, "Seed");
    const random = seededRandom(seed);
    const cells = [];
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const globalPeak = peak(x, y, 9, 2, 64, 7);
        const localPeak = peak(x, y, 2, 6, 49, 6);
        const ridge = peak(x, y, 5, 2, 43, 5);
        const noise = Math.floor(random() * 3);
        cells.push(deepFreeze({
          x: x,
          y: y,
          value: Math.max(2, globalPeak, localPeak, ridge) + noise,
        }));
      }
    }
    const maximum = cells.reduce(function (best, cell) {
      return cell.value > best.value ? cell : best;
    }, cells[0]);
    return deepFreeze({
      width: WIDTH,
      height: HEIGHT,
      seed: seed,
      cells: cells,
      maximum: maximum,
    });
  }

  function cellAt(landscape, x, y) {
    if (x < 0 || x >= landscape.width || y < 0 || y >= landscape.height) return null;
    return landscape.cells[y * landscape.width + x];
  }

  function neighbors(landscape, cell) {
    return [
      cellAt(landscape, cell.x + 1, cell.y),
      cellAt(landscape, cell.x, cell.y + 1),
      cellAt(landscape, cell.x - 1, cell.y),
      cellAt(landscape, cell.x, cell.y - 1),
    ].filter(Boolean);
  }

  function localOptima(landscape) {
    return landscape.cells.filter(function (cell) {
      return neighbors(landscape, cell).every(function (candidate) {
        return candidate.value <= cell.value;
      });
    });
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const strategy = options.strategy || "first";
    if (!STRATEGIES.includes(strategy)) throw new RangeError("Неизвестная стратегия локального поиска");
    const seed = integer(options.seed === undefined ? 41 : options.seed, 1, 0xffffffff, "Seed");
    const restarts = integer(options.restarts === undefined ? 1 : options.restarts, 0, MAX_RESTARTS, "Число рестартов");
    const temperatureTenths = integer(
      options.temperatureTenths === undefined ? 35 : options.temperatureTenths,
      1,
      120,
      "Температура"
    );
    const startX = integer(options.startX === undefined ? 1 : options.startX, 0, WIDTH - 1, "Начальная координата x");
    const startY = integer(options.startY === undefined ? 1 : options.startY, 0, HEIGHT - 1, "Начальная координата y");
    return deepFreeze({
      strategy: strategy,
      seed: seed,
      restarts: restarts,
      temperatureTenths: temperatureTenths,
      startX: startX,
      startY: startY,
    });
  }

  function orderedNeighbors(landscape, current, offset) {
    const candidates = neighbors(landscape, current);
    if (!candidates.length) return candidates;
    const shift = offset % candidates.length;
    return candidates.slice(shift).concat(candidates.slice(0, shift));
  }

  function chooseHillMove(landscape, current, strategy, offset) {
    const candidates = orderedNeighbors(landscape, current, offset);
    if (strategy === "first") {
      return candidates.find(function (candidate) {
        return candidate.value > current.value;
      }) || null;
    }
    return candidates.reduce(function (best, candidate) {
      if (candidate.value <= current.value) return best;
      if (!best || candidate.value > best.value) return candidate;
      return best;
    }, null);
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const landscape = createLandscape(options.seed);
    const random = seededRandom((options.seed ^ 0x9e3779b9) >>> 0 || 1);
    const start = cellAt(landscape, options.startX, options.startY);
    let current = start;
    let best = start;
    let temperature = options.temperatureTenths / 10;
    let restartIndex = 0;
    let stageSteps = 0;
    const visitedStarts = new Set([key(start.x, start.y)]);
    const frames = [];
    const path = [];

    function append(action, candidate, accepted, delta, message) {
      path.push(deepFreeze({ x: current.x, y: current.y, value: current.value }));
      frames.push(deepFreeze({
        action: action,
        current: current,
        candidate: candidate,
        accepted: accepted,
        delta: delta,
        temperature: temperature,
        restartIndex: restartIndex,
        best: best,
        path: path.slice(),
        message: message,
      }));
    }

    append("start", null, true, 0, "Начальная точка задаёт первую вершину траектории");
    while (frames.length < MAX_TRACE_STEPS) {
      if (options.strategy === "anneal") {
        if (stageSteps >= 34) {
          if (restartIndex >= options.restarts) break;
          restartIndex += 1;
          stageSteps = 0;
          temperature = options.temperatureTenths / 10;
          let replacement;
          do {
            replacement = landscape.cells[Math.floor(random() * landscape.cells.length)];
          } while (visitedStarts.has(key(replacement.x, replacement.y)) && visitedStarts.size < landscape.cells.length);
          visitedStarts.add(key(replacement.x, replacement.y));
          current = replacement;
          if (current.value > best.value) best = current;
          append("restart", null, true, 0, "Рестарт переносит поиск в другую область ландшафта");
          continue;
        }
        const candidates = neighbors(landscape, current);
        const candidate = candidates[Math.floor(random() * candidates.length)];
        const delta = candidate.value - current.value;
        const probability = delta >= 0 ? 1 : Math.exp(delta / Math.max(temperature, 0.05));
        const accepted = delta >= 0 || random() < probability;
        if (accepted) current = candidate;
        if (current.value > best.value) best = current;
        append(
          accepted ? "move" : "reject",
          candidate,
          accepted,
          delta,
          accepted
            ? (delta < 0 ? "Температура разрешила временно ухудшающий ход" : "Ход улучшает значение")
            : "Ухудшающий ход отклонён при текущей температуре"
        );
        temperature = Math.max(0.05, temperature * 0.88);
        stageSteps += 1;
      } else {
        const candidate = chooseHillMove(
          landscape,
          current,
          options.strategy,
          options.seed + frames.length
        );
        if (candidate) {
          const delta = candidate.value - current.value;
          current = candidate;
          if (current.value > best.value) best = current;
          append(
            "move",
            candidate,
            true,
            delta,
            options.strategy === "first"
              ? "Принято первое найденное улучшение"
              : "Принято лучшее улучшение во всей окрестности"
          );
          stageSteps += 1;
          continue;
        }
        append(
          "local-optimum",
          null,
          false,
          0,
          current.value === landscape.maximum.value
            ? "Достигнут глобальный максимум этого ландшафта"
            : "Улучшения в окрестности нет: найден только локальный максимум"
        );
        if (restartIndex >= options.restarts) break;
        restartIndex += 1;
        stageSteps = 0;
        let replacement;
        do {
          replacement = landscape.cells[Math.floor(random() * landscape.cells.length)];
        } while (visitedStarts.has(key(replacement.x, replacement.y)) && visitedStarts.size < landscape.cells.length);
        visitedStarts.add(key(replacement.x, replacement.y));
        current = replacement;
        if (current.value > best.value) best = current;
        append("restart", null, true, 0, "Рестарт переносит поиск в другую область ландшафта");
      }
    }
    if (frames.length >= MAX_TRACE_STEPS) throw new Error("Трасса локального поиска превысила безопасную границу");
    append(
      "finish",
      null,
      true,
      0,
      best.value === landscape.maximum.value
        ? "Лучшее найденное решение совпало с глобальным максимумом"
        : "Поиск завершён без гарантии глобальной оптимальности"
    );
    return deepFreeze({
      options: options,
      landscape: landscape,
      localOptima: localOptima(landscape),
      frames: frames,
      result: best,
    });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: trace.frames.length === 1 });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) {
      throw new TypeError("Некорректное состояние локального поиска");
    }
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({
      trace: state.trace,
      cursor: cursor,
      finished: cursor === state.trace.frames.length - 1,
    });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) {
      throw new TypeError("Некорректное состояние визуализации");
    }
    const frame = state.trace.frames[state.cursor];
    const pathKeys = new Set(frame.path.map(function (point) { return key(point.x, point.y); }));
    const localKeys = new Set(state.trace.localOptima.map(function (point) { return key(point.x, point.y); }));
    return deepFreeze({
      frame: frame,
      options: state.trace.options,
      width: state.trace.landscape.width,
      height: state.trace.landscape.height,
      globalMaximum: state.trace.landscape.maximum,
      cells: state.trace.landscape.cells.map(function (cell) {
        return Object.assign({}, cell, {
          current: cell.x === frame.current.x && cell.y === frame.current.y,
          candidate: frame.candidate &&
            cell.x === frame.candidate.x && cell.y === frame.candidate.y,
          visited: pathKeys.has(key(cell.x, cell.y)),
          localOptimum: localKeys.has(key(cell.x, cell.y)),
          globalOptimum: cell.x === state.trace.landscape.maximum.x &&
            cell.y === state.trace.landscape.maximum.y,
        });
      }),
    });
  }

  return deepFreeze({
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MAX_RESTARTS: MAX_RESTARTS,
    STRATEGIES: STRATEGIES,
    seededRandom: seededRandom,
    createLandscape: createLandscape,
    neighbors: neighbors,
    localOptima: localOptima,
    normalizeOptions: normalizeOptions,
    chooseHillMove: chooseHillMove,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
