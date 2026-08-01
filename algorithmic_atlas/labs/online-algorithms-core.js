(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OnlineAlgorithmsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  const SCENARIOS = deepFreeze({
    locality: {
      title: "Локальность с редкими скачками",
      base: [1, 2, 1, 2, 1, 3, 1, 2, 1, 2, 4, 1, 2, 1, 2, 3],
    },
    scan: {
      title: "Последовательный проход",
      base: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
    },
    adversary: {
      title: "Противник: запрос вне online-кэша",
      base: null,
    },
  });
  const POLICIES = deepFreeze(["lru", "fifo"]);

  function boundedInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return number;
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const scenario = options.scenario || "adversary";
    const policy = options.policy || "lru";
    if (!SCENARIOS[scenario]) throw new RangeError("Неизвестный сценарий запросов");
    if (!POLICIES.includes(policy)) throw new RangeError("Неизвестная online-политика");
    return deepFreeze({
      scenario: scenario,
      policy: policy,
      capacity: boundedInteger(options.capacity === undefined ? 3 : options.capacity, "capacity", 2, 4),
      horizon: boundedInteger(options.horizon === undefined ? 16 : options.horizon, "horizon", 6, 24),
    });
  }

  function repeatToLength(base, length) {
    const result = [];
    for (let index = 0; index < length; index += 1) result.push(base[index % base.length]);
    return result;
  }

  function onlineFrames(sequence, capacity, policy) {
    if (!Array.isArray(sequence) || !sequence.length) throw new RangeError("Последовательность запросов пуста");
    if (!POLICIES.includes(policy)) throw new RangeError("Неизвестная online-политика");
    boundedInteger(capacity, "capacity", 1, 10);
    const cache = [];
    const insertedAt = new Map();
    const lastUsed = new Map();
    let misses = 0;
    let hits = 0;
    const frames = [];
    sequence.forEach(function (page, index) {
      if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("Номер страницы должен быть положительным целым");
      const slot = cache.indexOf(page);
      let evicted = null;
      const hit = slot !== -1;
      if (hit) {
        hits += 1;
      } else {
        misses += 1;
        if (cache.length >= capacity) {
          let victim = cache[0];
          cache.forEach(function (candidate) {
            const candidateKey = policy === "lru" ? lastUsed.get(candidate) : insertedAt.get(candidate);
            const victimKey = policy === "lru" ? lastUsed.get(victim) : insertedAt.get(victim);
            if (candidateKey < victimKey || (candidateKey === victimKey && candidate < victim)) victim = candidate;
          });
          evicted = victim;
          cache.splice(cache.indexOf(victim), 1);
          insertedAt.delete(victim);
          lastUsed.delete(victim);
        }
        cache.push(page);
        insertedAt.set(page, index);
      }
      lastUsed.set(page, index);
      frames.push(deepFreeze({
        index: index, request: page, hit: hit, evicted: evicted,
        cache: cache.slice(), misses: misses, hits: hits,
      }));
    });
    return deepFreeze(frames);
  }

  function adversarialSequence(capacity, horizon, policy) {
    const sequence = [];
    const universe = Array.from({ length: capacity + 1 }, function (_, index) { return index + 1; });
    while (sequence.length < horizon) {
      const frames = sequence.length ? onlineFrames(sequence, capacity, policy) : [];
      const cache = frames.length ? frames[frames.length - 1].cache : [];
      const request = universe.find(function (page) { return !cache.includes(page); });
      sequence.push(request);
    }
    return sequence;
  }

  function buildSequence(rawOptions) {
    const options = normalizeOptions(rawOptions);
    if (options.scenario === "adversary") {
      return deepFreeze(adversarialSequence(options.capacity, options.horizon, options.policy));
    }
    return deepFreeze(repeatToLength(SCENARIOS[options.scenario].base, options.horizon));
  }

  function nextUse(sequence, page, afterIndex) {
    for (let index = afterIndex + 1; index < sequence.length; index += 1) {
      if (sequence[index] === page) return index;
    }
    return Infinity;
  }

  function beladyFrames(sequence, capacity) {
    boundedInteger(capacity, "capacity", 1, 10);
    const cache = [];
    let misses = 0;
    let hits = 0;
    const frames = [];
    sequence.forEach(function (page, index) {
      let evicted = null;
      const hit = cache.includes(page);
      if (hit) {
        hits += 1;
      } else {
        misses += 1;
        if (cache.length >= capacity) {
          let victim = cache[0];
          cache.forEach(function (candidate) {
            const candidateNext = nextUse(sequence, candidate, index);
            const victimNext = nextUse(sequence, victim, index);
            if (candidateNext > victimNext || (candidateNext === victimNext && candidate < victim)) victim = candidate;
          });
          evicted = victim;
          cache.splice(cache.indexOf(victim), 1);
        }
        cache.push(page);
      }
      frames.push(deepFreeze({
        index: index, request: page, hit: hit, evicted: evicted,
        cache: cache.slice(), misses: misses, hits: hits,
      }));
    });
    return deepFreeze(frames);
  }

  function offlineOptimalMisses(sequence, capacity) {
    boundedInteger(capacity, "capacity", 1, 10);
    const memo = new Map();
    function solve(index, rawCache) {
      if (index === sequence.length) return 0;
      const cache = rawCache.slice().sort(function (left, right) { return left - right; });
      const key = index + "|" + cache.join(",");
      if (memo.has(key)) return memo.get(key);
      const page = sequence[index];
      let answer;
      if (cache.includes(page)) {
        answer = solve(index + 1, cache);
      } else if (cache.length < capacity) {
        answer = 1 + solve(index + 1, cache.concat(page));
      } else {
        answer = 1 + Math.min.apply(null, cache.map(function (victim) {
          return solve(index + 1, cache.filter(function (candidate) { return candidate !== victim; }).concat(page));
        }));
      }
      memo.set(key, answer);
      return answer;
    }
    return solve(0, []);
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    const sequence = buildSequence(options);
    const online = onlineFrames(sequence, options.capacity, options.policy);
    const offline = beladyFrames(sequence, options.capacity);
    const exact = offlineOptimalMisses(sequence, options.capacity);
    if (offline[offline.length - 1].misses !== exact) throw new Error("Belady не совпал с точным offline-эталоном");
    const frames = [deepFreeze({
      cursor: 0, revealed: [], request: null,
      online: { cache: [], misses: 0, hits: 0, hit: null, evicted: null },
      offline: { cache: [], misses: 0, hits: 0, hit: null, evicted: null },
      message: "Противник ещё не раскрыл первый запрос",
    })];
    sequence.forEach(function (request, index) {
      const onlineFrame = online[index];
      const offlineFrame = offline[index];
      frames.push(deepFreeze({
        cursor: index + 1,
        revealed: sequence.slice(0, index + 1),
        request: request,
        online: onlineFrame,
        offline: offlineFrame,
        message: onlineFrame.hit
          ? "Online-политика нашла страницу в кэше и не платит за промах"
          : "Запрос отсутствует в online-кэше: политика платит и выбирает жертву без знания будущего",
      }));
    });
    return deepFreeze({ options: options, sequence: sequence, frames: frames, exactOfflineMisses: exact });
  }

  function createState(options) {
    const trace = buildTrace(options);
    return deepFreeze({ trace: trace, cursor: 0, finished: false });
  }

  function step(state) {
    if (!state || !state.trace || !Number.isInteger(state.cursor)) throw new TypeError("Некорректное состояние online-лаборатории");
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({ trace: state.trace, cursor: cursor, finished: cursor === state.trace.frames.length - 1 });
  }

  function visualModel(state) {
    if (!state || !state.trace || !state.trace.frames[state.cursor]) throw new TypeError("Некорректное состояние визуализации");
    const frame = state.trace.frames[state.cursor];
    const onlineMisses = frame.online.misses;
    const offlineMisses = frame.offline.misses;
    return deepFreeze({
      options: state.trace.options,
      sequence: state.trace.sequence,
      frame: frame,
      ratio: offlineMisses === 0 ? 1 : onlineMisses / offlineMisses,
      onlineHistory: state.trace.frames.slice(1, state.cursor + 1).map(function (item) { return item.online.misses; }),
      offlineHistory: state.trace.frames.slice(1, state.cursor + 1).map(function (item) { return item.offline.misses; }),
    });
  }

  return deepFreeze({
    SCENARIOS: SCENARIOS,
    POLICIES: POLICIES,
    normalizeOptions: normalizeOptions,
    onlineFrames: onlineFrames,
    adversarialSequence: adversarialSequence,
    buildSequence: buildSequence,
    beladyFrames: beladyFrames,
    offlineOptimalMisses: offlineOptimalMisses,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  });
});
