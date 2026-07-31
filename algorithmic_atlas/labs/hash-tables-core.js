(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HashTablesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_KEYS = 24;
  const STRATEGIES = Object.freeze(["chaining", "linear", "double", "robin-hood"]);

  function normalizeKeys(rawKeys) {
    const keys = rawKeys === undefined ? [18, 25, 39, 11, 32, 4, 53, 67, 74] : rawKeys;
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_KEYS) {
      throw new RangeError("keys: требуется от 1 до " + MAX_KEYS + " ключей");
    }
    const normalized = keys.map(function (rawKey) {
      return shared.boundedInteger(rawKey, "key", -1000000, 1000000);
    });
    if (new Set(normalized).size !== normalized.length) {
      throw new RangeError("keys: ключи должны быть уникальны");
    }
    return Object.freeze(normalized);
  }

  function isPrime(value) {
    if (value < 2) return false;
    for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
      if (value % divisor === 0) return false;
    }
    return true;
  }

  function nextPrime(value) {
    let candidate = Math.max(5, Math.ceil(value));
    while (!isPrime(candidate)) candidate += 1;
    return candidate;
  }

  function mix32(rawKey, rawSeed) {
    let value = (Number(rawKey) | 0) ^ (Number(rawSeed) | 0) ^ 0x9e3779b9;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
  }

  function home(rawKey, capacity, seed) {
    return mix32(rawKey, seed) % capacity;
  }

  function secondStep(rawKey, capacity, seed) {
    return 1 + (mix32(rawKey, seed ^ 0x85ebca6b) % (capacity - 1));
  }

  function emptyStrategies(capacity) {
    return {
      chaining: Array.from({ length: capacity }, function () { return []; }),
      linear: Array(capacity).fill(null),
      double: Array(capacity).fill(null),
      "robin-hood": Array(capacity).fill(null),
    };
  }

  function insertChaining(table, key, seed) {
    const position = home(key, table.length, seed);
    const collisions = table[position].length;
    table[position].unshift(key);
    return { probes: [position], collisions: collisions, swaps: [], displacement: collisions };
  }

  function insertOpen(table, key, seed, strategy) {
    const capacity = table.length;
    const start = home(key, capacity, seed);
    const step = strategy === "double" ? secondStep(key, capacity, seed) : 1;
    const probes = [];
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const position = (start + attempt * step) % capacity;
      probes.push(position);
      if (table[position] === null) {
        table[position] = { key: key, home: start, displacement: attempt };
        return { probes: probes, collisions: probes.length - 1, swaps: [], displacement: attempt };
      }
    }
    throw new RangeError("open-address table is full");
  }

  function insertRobinHood(table, key, seed) {
    const capacity = table.length;
    let incoming = { key: key, home: home(key, capacity, seed), displacement: 0 };
    const probes = [];
    const swaps = [];
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const position = (incoming.home + incoming.displacement) % capacity;
      probes.push(position);
      const resident = table[position];
      if (resident === null) {
        table[position] = incoming;
        return { probes: probes, collisions: probes.length - 1, swaps: swaps, displacement: incoming.displacement };
      }
      if (resident.displacement < incoming.displacement) {
        table[position] = incoming;
        swaps.push({ position: position, incoming: incoming.key, displaced: resident.key });
        incoming = {
          key: resident.key,
          home: resident.home,
          displacement: resident.displacement + 1,
        };
      } else {
        incoming = {
          key: incoming.key,
          home: incoming.home,
          displacement: incoming.displacement + 1,
        };
      }
    }
    throw new RangeError("Robin Hood table is full");
  }

  function insertEverywhere(tables, key, seed) {
    return {
      chaining: insertChaining(tables.chaining, key, seed),
      linear: insertOpen(tables.linear, key, seed, "linear"),
      double: insertOpen(tables.double, key, seed, "double"),
      "robin-hood": insertRobinHood(tables["robin-hood"], key, seed),
    };
  }

  function cloneTables(tables) {
    return {
      chaining: tables.chaining.map(function (bucket) { return bucket.slice(); }),
      linear: tables.linear.map(function (slot) { return slot ? Object.assign({}, slot) : null; }),
      double: tables.double.map(function (slot) { return slot ? Object.assign({}, slot) : null; }),
      "robin-hood": tables["robin-hood"].map(function (slot) { return slot ? Object.assign({}, slot) : null; }),
    };
  }

  function buildTrace(rawKeys, rawCapacity, rawSeed) {
    const keys = normalizeKeys(rawKeys);
    let capacity = nextPrime(shared.boundedInteger(
      rawCapacity === undefined ? 7 : rawCapacity,
      "capacity",
      5,
      31
    ));
    const seed = shared.normalizeSeed(rawSeed === undefined ? 2027 : rawSeed);
    let tables = emptyStrategies(capacity);
    const inserted = [];
    const frames = [];
    const totals = { chaining: 0, linear: 0, double: 0, "robin-hood": 0 };

    frames.push(shared.deepFreeze({
      action: "initial", message: "Четыре стратегии начинают с одной ёмкости и одной семьи хеш-функций",
      capacity: capacity, inserted: [], key: null, tables: cloneTables(tables), details: null,
      totals: Object.assign({}, totals), loadFactor: 0, rebuilds: 0,
    }));
    let rebuilds = 0;

    keys.forEach(function (key) {
      if ((inserted.length + 1) / capacity > 0.72) {
        capacity = nextPrime(capacity * 2 + 1);
        tables = emptyStrategies(capacity);
        inserted.forEach(function (existing) { insertEverywhere(tables, existing, seed); });
        rebuilds += 1;
        frames.push(shared.deepFreeze({
          action: "rehash", message: "Коэффициент заполнения приблизился к 0,72: все ключи размещены заново",
          capacity: capacity, inserted: inserted.slice(), key: null, tables: cloneTables(tables), details: null,
          totals: Object.assign({}, totals), loadFactor: inserted.length / capacity, rebuilds: rebuilds,
        }));
      }
      const details = insertEverywhere(tables, key, seed);
      inserted.push(key);
      STRATEGIES.forEach(function (strategy) { totals[strategy] += details[strategy].probes.length; });
      frames.push(shared.deepFreeze({
        action: "insert", message: "Ключ " + key + " прошёл один и тот же набор стратегий разрешения коллизий",
        capacity: capacity, inserted: inserted.slice(), key: key, tables: cloneTables(tables), details: details,
        totals: Object.assign({}, totals), loadFactor: inserted.length / capacity, rebuilds: rebuilds,
      }));
    });
    return shared.deepFreeze({ keys: keys, seed: seed, frames: frames });
  }

  function createState(options) {
    const settings = options || {};
    const trace = buildTrace(settings.keys, settings.capacity, settings.seed);
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

  function expectedChaining(alpha, successful) {
    if (!Number.isFinite(alpha) || alpha < 0) throw new RangeError("alpha must be nonnegative");
    return successful ? 1 + alpha / 2 : alpha;
  }

  function expectedUniformOpenAddressing(alpha, successful) {
    if (!Number.isFinite(alpha) || alpha < 0 || alpha >= 1) {
      throw new RangeError("alpha must be in [0, 1)");
    }
    if (alpha === 0) return successful ? 1 : 1;
    return successful
      ? Math.log(1 / (1 - alpha)) / alpha
      : 1 / (1 - alpha);
  }

  function visualModel(state) {
    const frame = state.frame;
    return shared.deepFreeze({
      action: frame.action,
      message: frame.message,
      capacity: frame.capacity,
      insertedCount: frame.inserted.length,
      key: frame.key,
      tables: frame.tables,
      details: frame.details,
      totals: frame.totals,
      loadFactor: frame.loadFactor,
      rebuilds: frame.rebuilds,
      schematic: frame.capacity > 23,
      omittedSlots: Math.max(0, frame.capacity - 23),
    });
  }

  return {
    MAX_KEYS: MAX_KEYS,
    STRATEGIES: STRATEGIES,
    normalizeKeys: normalizeKeys,
    nextPrime: nextPrime,
    mix32: mix32,
    home: home,
    secondStep: secondStep,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
    expectedChaining: expectedChaining,
    expectedUniformOpenAddressing: expectedUniformOpenAddressing,
  };
});
