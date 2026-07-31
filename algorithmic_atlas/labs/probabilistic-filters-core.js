(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProbabilisticFiltersCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_BITS = 64;
  const MAX_HASHES = 8;
  const MAX_COUNTER = 15;
  const MAX_CUCKOO_BUCKETS = 16;
  const MAX_RELOCATIONS = 32;
  const MAX_SCENARIO_SEED = 64;

  function normalizeKey(rawKey, label) {
    return shared.boundedInteger(rawKey, label || "key", -1000000000, 1000000000);
  }

  function mix32(rawKey, rawSeed) {
    let value = (normalizeKey(rawKey) | 0) ^ (shared.normalizeSeed(rawSeed) | 0) ^ 0x9e3779b9;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
  }

  function normalizeScenarioSeed(rawSeed) {
    const normalized = shared.normalizeSeed(rawSeed);
    if (normalized >= 1 && normalized <= MAX_SCENARIO_SEED) return normalized;
    return 1 + normalized % MAX_SCENARIO_SEED;
  }

  function normalizeBloomParameters(rawBits, rawHashes, rawSeed) {
    return Object.freeze({
      m: shared.boundedInteger(rawBits, "m", 4, MAX_BITS),
      k: shared.boundedInteger(rawHashes, "k", 1, MAX_HASHES),
      seed: shared.normalizeSeed(rawSeed),
    });
  }

  function hashPositions(rawKey, rawBits, rawHashes, rawSeed) {
    const key = normalizeKey(rawKey);
    const parameters = normalizeBloomParameters(rawBits, rawHashes, rawSeed);
    const positions = [];
    for (let index = 0; index < parameters.k; index += 1) {
      const salt = (parameters.seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
      positions.push(mix32(key, salt) % parameters.m);
    }
    return Object.freeze(positions);
  }

  function bloomFalsePositiveProbability(rawBits, rawItems, rawHashes) {
    const m = shared.boundedInteger(rawBits, "m", 1, 1000000000);
    const n = shared.boundedInteger(rawItems, "n", 0, 1000000000);
    const k = shared.boundedInteger(rawHashes, "k", 1, 1000000);
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  function optimalHashCount(rawBits, rawItems) {
    const m = shared.boundedInteger(rawBits, "m", 1, 1000000000);
    const n = shared.boundedInteger(rawItems, "n", 1, 1000000000);
    return m / n * Math.LN2;
  }

  function validateBloom(filter) {
    if (!filter || !Array.isArray(filter.bits) || !Array.isArray(filter.items)) {
      throw new TypeError("некорректное состояние Bloom filter");
    }
    const parameters = normalizeBloomParameters(filter.m, filter.k, filter.seed);
    if (filter.bits.length !== parameters.m || filter.bits.some(function (bit) { return bit !== 0 && bit !== 1; })) {
      throw new RangeError("битовый массив Bloom filter повреждён");
    }
    filter.items.forEach(function (key, index) { normalizeKey(key, "items[" + index + "]"); });
    return parameters;
  }

  function createBloom(rawBits, rawHashes, rawSeed) {
    const parameters = normalizeBloomParameters(rawBits, rawHashes, rawSeed);
    return shared.deepFreeze({
      m: parameters.m,
      k: parameters.k,
      seed: parameters.seed,
      bits: Array(parameters.m).fill(0),
      items: [],
    });
  }

  function bloomInsert(filter, rawKey) {
    const parameters = validateBloom(filter);
    const key = normalizeKey(rawKey);
    const positions = hashPositions(key, parameters.m, parameters.k, parameters.seed);
    const bits = filter.bits.slice();
    positions.forEach(function (position) { bits[position] = 1; });
    return shared.deepFreeze({
      m: parameters.m,
      k: parameters.k,
      seed: parameters.seed,
      bits: bits,
      items: filter.items.concat(key),
    });
  }

  function bloomQuery(filter, rawKey) {
    const parameters = validateBloom(filter);
    const key = normalizeKey(rawKey);
    const positions = hashPositions(key, parameters.m, parameters.k, parameters.seed);
    const result = positions.every(function (position) { return filter.bits[position] === 1; });
    const actualMember = filter.items.includes(key);
    return shared.deepFreeze({
      key: key,
      positions: positions,
      result: result,
      actualMember: actualMember,
      falsePositive: result && !actualMember,
    });
  }

  function findFalsePositiveWitness(filter, rawStart, rawLimit) {
    validateBloom(filter);
    const start = shared.boundedInteger(rawStart === undefined ? 0 : rawStart, "start", -1000000000, 1000000000);
    const limit = shared.boundedInteger(rawLimit === undefined ? 20000 : rawLimit, "limit", 1, 100000);
    for (let offset = 0; offset < limit; offset += 1) {
      const candidate = start + offset;
      if (candidate > 1000000000) break;
      const query = bloomQuery(filter, candidate);
      if (query.falsePositive) return query;
    }
    return null;
  }

  function validateCounting(filter) {
    if (!filter || !Array.isArray(filter.counters) || !Array.isArray(filter.items)) {
      throw new TypeError("некорректное состояние counting Bloom filter");
    }
    const parameters = normalizeBloomParameters(filter.m, filter.k, filter.seed);
    const maximum = shared.boundedInteger(filter.maxCounter, "maxCounter", 1, MAX_COUNTER);
    if (filter.counters.length !== parameters.m || filter.counters.some(function (value) {
      return !Number.isInteger(value) || value < 0 || value > maximum;
    })) {
      throw new RangeError("массив счётчиков повреждён");
    }
    filter.items.forEach(function (key, index) { normalizeKey(key, "items[" + index + "]"); });
    return Object.assign({ maxCounter: maximum }, parameters);
  }

  function createCountingBloom(rawBits, rawHashes, rawSeed, rawMaximum) {
    const parameters = normalizeBloomParameters(rawBits, rawHashes, rawSeed);
    const maxCounter = shared.boundedInteger(rawMaximum === undefined ? 7 : rawMaximum, "maxCounter", 1, MAX_COUNTER);
    return shared.deepFreeze({
      m: parameters.m,
      k: parameters.k,
      seed: parameters.seed,
      maxCounter: maxCounter,
      counters: Array(parameters.m).fill(0),
      items: [],
    });
  }

  function countingInsert(filter, rawKey) {
    const parameters = validateCounting(filter);
    const key = normalizeKey(rawKey);
    const positions = hashPositions(key, parameters.m, parameters.k, parameters.seed);
    const increments = Array(parameters.m).fill(0);
    positions.forEach(function (position) { increments[position] += 1; });
    for (let position = 0; position < parameters.m; position += 1) {
      if (filter.counters[position] + increments[position] > parameters.maxCounter) {
        throw new RangeError("счётчик позиции " + position + " переполнится");
      }
    }
    const counters = filter.counters.slice();
    positions.forEach(function (position) { counters[position] += 1; });
    return shared.deepFreeze({
      m: parameters.m,
      k: parameters.k,
      seed: parameters.seed,
      maxCounter: parameters.maxCounter,
      counters: counters,
      items: filter.items.concat(key),
    });
  }

  function countingDelete(filter, rawKey) {
    const parameters = validateCounting(filter);
    const key = normalizeKey(rawKey);
    const memberIndex = filter.items.indexOf(key);
    if (memberIndex < 0) {
      throw new RangeError("удалять можно только ключ, чья вставка известна внешнему владельцу");
    }
    const positions = hashPositions(key, parameters.m, parameters.k, parameters.seed);
    const counters = filter.counters.slice();
    positions.forEach(function (position) {
      if (counters[position] <= 0) throw new Error("счётчик не согласован с журналом вставок");
      counters[position] -= 1;
    });
    const items = filter.items.slice();
    items.splice(memberIndex, 1);
    return shared.deepFreeze({
      m: parameters.m,
      k: parameters.k,
      seed: parameters.seed,
      maxCounter: parameters.maxCounter,
      counters: counters,
      items: items,
    });
  }

  function countingQuery(filter, rawKey) {
    const parameters = validateCounting(filter);
    const key = normalizeKey(rawKey);
    const positions = hashPositions(key, parameters.m, parameters.k, parameters.seed);
    const result = positions.every(function (position) { return filter.counters[position] > 0; });
    const actualMember = filter.items.includes(key);
    return shared.deepFreeze({
      key: key,
      positions: positions,
      result: result,
      actualMember: actualMember,
      falsePositive: result && !actualMember,
    });
  }

  function isPowerOfTwo(value) {
    return value > 0 && (value & (value - 1)) === 0;
  }

  function normalizeCuckooParameters(rawBucketCount, rawBucketSize, rawFingerprintBits, rawSeed) {
    const bucketCount = shared.boundedInteger(rawBucketCount, "bucketCount", 4, MAX_CUCKOO_BUCKETS);
    if (!isPowerOfTwo(bucketCount)) throw new RangeError("bucketCount должен быть степенью двойки");
    return Object.freeze({
      bucketCount: bucketCount,
      bucketSize: shared.boundedInteger(rawBucketSize, "bucketSize", 1, 4),
      fingerprintBits: shared.boundedInteger(rawFingerprintBits, "fingerprintBits", 2, 8),
      seed: shared.normalizeSeed(rawSeed),
    });
  }

  function fingerprint(rawKey, rawFingerprintBits, rawSeed) {
    const key = normalizeKey(rawKey);
    const bits = shared.boundedInteger(rawFingerprintBits, "fingerprintBits", 2, 8);
    const mask = Math.pow(2, bits) - 1;
    const value = mix32(key, shared.normalizeSeed(rawSeed) ^ 0xa5a5a5a5) & mask;
    return value === 0 ? 1 : value;
  }

  function fingerprintOffset(rawFingerprint, rawBucketCount, rawSeed) {
    const bucketCount = shared.boundedInteger(rawBucketCount, "bucketCount", 4, MAX_CUCKOO_BUCKETS);
    if (!isPowerOfTwo(bucketCount)) throw new RangeError("bucketCount должен быть степенью двойки");
    const value = shared.boundedInteger(rawFingerprint, "fingerprint", 1, 255);
    const offset = mix32(value, shared.normalizeSeed(rawSeed) ^ 0x85ebca6b) & (bucketCount - 1);
    return offset === 0 ? 1 : offset;
  }

  function alternateIndex(rawIndex, rawFingerprint, rawBucketCount, rawSeed) {
    const bucketCount = shared.boundedInteger(rawBucketCount, "bucketCount", 4, MAX_CUCKOO_BUCKETS);
    if (!isPowerOfTwo(bucketCount)) throw new RangeError("bucketCount должен быть степенью двойки");
    const index = shared.boundedInteger(rawIndex, "index", 0, bucketCount - 1);
    return index ^ fingerprintOffset(rawFingerprint, bucketCount, rawSeed);
  }

  function cuckooIndices(rawKey, rawFingerprint, rawBucketCount, rawSeed) {
    const key = normalizeKey(rawKey);
    const bucketCount = shared.boundedInteger(rawBucketCount, "bucketCount", 4, MAX_CUCKOO_BUCKETS);
    if (!isPowerOfTwo(bucketCount)) throw new RangeError("bucketCount должен быть степенью двойки");
    const first = mix32(key, shared.normalizeSeed(rawSeed) ^ 0xc2b2ae35) & (bucketCount - 1);
    const second = alternateIndex(first, rawFingerprint, bucketCount, rawSeed);
    return Object.freeze([first, second]);
  }

  function validateCuckoo(filter) {
    if (!filter || !Array.isArray(filter.buckets) || !Array.isArray(filter.items)) {
      throw new TypeError("некорректное состояние cuckoo filter");
    }
    const parameters = normalizeCuckooParameters(
      filter.bucketCount,
      filter.bucketSize,
      filter.fingerprintBits,
      filter.seed
    );
    const maximumFingerprint = Math.pow(2, parameters.fingerprintBits) - 1;
    if (filter.buckets.length !== parameters.bucketCount) throw new RangeError("число корзин повреждено");
    filter.buckets.forEach(function (bucket) {
      if (!Array.isArray(bucket) || bucket.length > parameters.bucketSize || bucket.some(function (value) {
        return !Number.isInteger(value) || value < 1 || value > maximumFingerprint;
      })) throw new RangeError("корзина cuckoo filter повреждена");
    });
    filter.items.forEach(function (key, index) { normalizeKey(key, "items[" + index + "]"); });
    return parameters;
  }

  function createCuckooFilter(rawBucketCount, rawBucketSize, rawFingerprintBits, rawSeed) {
    const parameters = normalizeCuckooParameters(rawBucketCount, rawBucketSize, rawFingerprintBits, rawSeed);
    return shared.deepFreeze({
      bucketCount: parameters.bucketCount,
      bucketSize: parameters.bucketSize,
      fingerprintBits: parameters.fingerprintBits,
      seed: parameters.seed,
      buckets: Array.from({ length: parameters.bucketCount }, function () { return []; }),
      items: [],
    });
  }

  function cloneBuckets(buckets) {
    return buckets.map(function (bucket) { return bucket.slice(); });
  }

  function cuckooSnapshot(action, message, filter, details) {
    const data = details || {};
    return shared.deepFreeze({
      mode: "cuckoo",
      action: action,
      message: message,
      bucketCount: filter.bucketCount,
      bucketSize: filter.bucketSize,
      fingerprintBits: filter.fingerprintBits,
      seed: filter.seed,
      buckets: cloneBuckets(filter.buckets),
      insertedKeys: filter.items.slice(),
      key: data.key === undefined ? null : data.key,
      fingerprint: data.fingerprint === undefined ? null : data.fingerprint,
      candidates: (data.candidates || []).slice(),
      activeBucket: data.activeBucket === undefined ? null : data.activeBucket,
      activeSlot: data.activeSlot === undefined ? null : data.activeSlot,
      displacedFingerprint: data.displacedFingerprint === undefined ? null : data.displacedFingerprint,
      relocations: data.relocations || 0,
      queryResult: data.queryResult === undefined ? null : data.queryResult,
      rolledBack: Boolean(data.rolledBack),
      finished: Boolean(data.finished),
    });
  }

  function cuckooContains(filter, rawKey) {
    const parameters = validateCuckoo(filter);
    const key = normalizeKey(rawKey);
    const value = fingerprint(key, parameters.fingerprintBits, parameters.seed);
    const candidates = cuckooIndices(key, value, parameters.bucketCount, parameters.seed);
    return candidates.some(function (index) { return filter.buckets[index].includes(value); });
  }

  function cuckooInsert(filter, rawKey, rawMaximumRelocations) {
    const parameters = validateCuckoo(filter);
    const key = normalizeKey(rawKey);
    if (filter.items.includes(key)) throw new RangeError("ключ уже добавлен в демонстрационный фильтр");
    const maximumRelocations = shared.boundedInteger(
      rawMaximumRelocations === undefined ? 12 : rawMaximumRelocations,
      "maximumRelocations",
      0,
      MAX_RELOCATIONS
    );
    const value = fingerprint(key, parameters.fingerprintBits, parameters.seed);
    const candidates = cuckooIndices(key, value, parameters.bucketCount, parameters.seed);
    const original = shared.deepFreeze({
      bucketCount: parameters.bucketCount,
      bucketSize: parameters.bucketSize,
      fingerprintBits: parameters.fingerprintBits,
      seed: parameters.seed,
      buckets: cloneBuckets(filter.buckets),
      items: filter.items.slice(),
    });
    const frames = [cuckooSnapshot(
      "candidates",
      "Отпечаток может находиться только в двух связанных корзинах",
      original,
      { key: key, fingerprint: value, candidates: candidates }
    )];

    for (let index = 0; index < candidates.length; index += 1) {
      const bucketIndex = candidates[index];
      if (original.buckets[bucketIndex].length < parameters.bucketSize) {
        const buckets = cloneBuckets(original.buckets);
        buckets[bucketIndex].push(value);
        const state = shared.deepFreeze(Object.assign({}, original, {
          buckets: buckets,
          items: original.items.concat(key),
        }));
        frames.push(cuckooSnapshot("place", "Свободный слот найден без вытеснения", state, {
          key: key,
          fingerprint: value,
          candidates: candidates,
          activeBucket: bucketIndex,
          activeSlot: buckets[bucketIndex].length - 1,
          finished: true,
        }));
        return shared.deepFreeze({ state: state, inserted: true, relocations: 0, frames: frames });
      }
    }

    let buckets = cloneBuckets(original.buckets);
    let currentFingerprint = value;
    let currentBucket = candidates[mix32(key, parameters.seed ^ 0x27d4eb2d) & 1];
    for (let relocation = 0; relocation < maximumRelocations; relocation += 1) {
      const slot = mix32(currentFingerprint + relocation, parameters.seed ^ currentBucket) % parameters.bucketSize;
      const displaced = buckets[currentBucket][slot];
      buckets[currentBucket][slot] = currentFingerprint;
      const transient = {
        bucketCount: parameters.bucketCount,
        bucketSize: parameters.bucketSize,
        fingerprintBits: parameters.fingerprintBits,
        seed: parameters.seed,
        buckets: buckets,
        items: original.items.slice(),
      };
      frames.push(cuckooSnapshot("evict", "Слот занят: новый отпечаток вытесняет прежний", transient, {
        key: null,
        fingerprint: displaced,
        candidates: [currentBucket, alternateIndex(currentBucket, displaced, parameters.bucketCount, parameters.seed)],
        activeBucket: currentBucket,
        activeSlot: slot,
        displacedFingerprint: displaced,
        relocations: relocation + 1,
      }));
      currentFingerprint = displaced;
      currentBucket = alternateIndex(currentBucket, currentFingerprint, parameters.bucketCount, parameters.seed);
      if (buckets[currentBucket].length < parameters.bucketSize) {
        buckets[currentBucket].push(currentFingerprint);
        const state = shared.deepFreeze({
          bucketCount: parameters.bucketCount,
          bucketSize: parameters.bucketSize,
          fingerprintBits: parameters.fingerprintBits,
          seed: parameters.seed,
          buckets: cloneBuckets(buckets),
          items: original.items.concat(key),
        });
        frames.push(cuckooSnapshot("relocated", "Вытесненный отпечаток помещён в альтернативную корзину", state, {
          key: null,
          fingerprint: currentFingerprint,
          candidates: [currentBucket, alternateIndex(currentBucket, currentFingerprint, parameters.bucketCount, parameters.seed)],
          activeBucket: currentBucket,
          activeSlot: buckets[currentBucket].length - 1,
          relocations: relocation + 1,
          finished: true,
        }));
        return shared.deepFreeze({ state: state, inserted: true, relocations: relocation + 1, frames: frames });
      }
    }

    frames.push(cuckooSnapshot("rollback", "Предел вытеснений достигнут: временные перестановки отменены", original, {
      key: key,
      fingerprint: value,
      candidates: candidates,
      relocations: maximumRelocations,
      rolledBack: true,
      finished: true,
    }));
    return shared.deepFreeze({ state: original, inserted: false, relocations: maximumRelocations, frames: frames });
  }

  function arrayFrame(mode, action, message, filter, details) {
    const data = details || {};
    const values = mode === "counting" ? filter.counters : filter.bits;
    return shared.deepFreeze({
      mode: mode,
      action: action,
      message: message,
      m: filter.m,
      k: filter.k,
      seed: filter.seed,
      values: values.slice(),
      insertedKeys: filter.items.slice(),
      positions: (data.positions || []).slice(),
      checkedPositions: (data.checkedPositions || []).slice(),
      activePosition: data.activePosition === undefined ? null : data.activePosition,
      key: data.key === undefined ? null : data.key,
      queryResult: data.queryResult === undefined ? null : data.queryResult,
      actualMember: data.actualMember === undefined ? null : data.actualMember,
      falsePositive: Boolean(data.falsePositive),
      maxCounter: mode === "counting" ? filter.maxCounter : 1,
      finished: Boolean(data.finished),
    });
  }

  function bloomScenario(options) {
    const settings = options || {};
    const seed = normalizeScenarioSeed(settings.seed === undefined ? 2027 : settings.seed);
    const m = settings.m === undefined ? 24 : settings.m;
    const k = settings.k === undefined ? 3 : settings.k;
    const keys = [7, 13, 29, 44];
    let filter = createBloom(m, k, seed);
    const frames = [arrayFrame("bloom", "initial", "Пустой фильтр начинается с нулевого битового массива", filter)];
    keys.forEach(function (key) {
      const positions = hashPositions(key, filter.m, filter.k, filter.seed);
      frames.push(arrayFrame("bloom", "hash-insert", "Хеш-функции вычислили позиции для ключа " + key, filter, {
        key: key,
        positions: positions,
      }));
      filter = bloomInsert(filter, key);
      frames.push(arrayFrame("bloom", "insert", "Все вычисленные биты установлены в единицу", filter, {
        key: key,
        positions: positions,
      }));
    });
    const query = findFalsePositiveWitness(filter, 0, 20000);
    if (!query) throw new Error("в ограниченном диапазоне не найден воспроизводимый false positive");
    frames.push(arrayFrame("bloom", "hash-query", "Ключ " + query.key + " не вставлялся; проверяем те же k позиций", filter, {
      key: query.key,
      positions: query.positions,
      actualMember: false,
    }));
    query.positions.forEach(function (position, index) {
      frames.push(arrayFrame("bloom", "probe", "Проверяем бит " + position + ": он уже установлен другими ключами", filter, {
        key: query.key,
        positions: query.positions,
        checkedPositions: query.positions.slice(0, index + 1),
        activePosition: position,
        actualMember: false,
      }));
    });
    frames.push(arrayFrame("bloom", "false-positive", "Все позиции равны единице: фильтр отвечает «возможно есть», хотя ключ не вставлялся", filter, {
      key: query.key,
      positions: query.positions,
      checkedPositions: query.positions,
      queryResult: true,
      actualMember: false,
      falsePositive: true,
      finished: true,
    }));
    return shared.deepFreeze(frames);
  }

  function countingScenario(options) {
    const settings = options || {};
    const seed = normalizeScenarioSeed(settings.seed === undefined ? 2027 : settings.seed);
    const m = settings.m === undefined ? 24 : settings.m;
    const k = settings.k === undefined ? 3 : settings.k;
    const keys = [5, 17, 31];
    const removedKey = 17;
    let filter = createCountingBloom(m, k, seed, 7);
    const frames = [arrayFrame("counting", "initial", "Каждая позиция хранит малый счётчик вместо одного бита", filter)];
    keys.forEach(function (key) {
      const positions = hashPositions(key, filter.m, filter.k, filter.seed);
      filter = countingInsert(filter, key);
      frames.push(arrayFrame("counting", "insert", "Вставка ключа " + key + " увеличила каждый из k счётчиков", filter, {
        key: key,
        positions: positions,
      }));
    });
    const positions = hashPositions(removedKey, filter.m, filter.k, filter.seed);
    frames.push(arrayFrame("counting", "hash-delete", "Удаление разрешено: внешнему владельцу известна прежняя вставка ключа " + removedKey, filter, {
      key: removedKey,
      positions: positions,
    }));
    const counters = filter.counters.slice();
    positions.forEach(function (position, index) {
      counters[position] -= 1;
      const transient = Object.assign({}, filter, { counters: counters.slice() });
      frames.push(arrayFrame("counting", "decrement", "Уменьшаем счётчик позиции " + position + " ровно на один", transient, {
        key: removedKey,
        positions: positions,
        checkedPositions: positions.slice(0, index + 1),
        activePosition: position,
      }));
    });
    filter = countingDelete(filter, removedKey);
    const query = countingQuery(filter, removedKey);
    frames.push(arrayFrame("counting", "deleted", query.result
      ? "Ключ удалён из журнала, но коллизии всё ещё дают ответ «возможно есть»"
      : "После удаления хотя бы один счётчик равен нулю: ответ «точно нет»", filter, {
      key: removedKey,
      positions: query.positions,
      checkedPositions: query.positions,
      queryResult: query.result,
      actualMember: false,
      falsePositive: query.falsePositive,
      finished: true,
    }));
    return shared.deepFreeze(frames);
  }

  function cuckooScenario(options) {
    const settings = options || {};
    const seed = normalizeScenarioSeed(settings.seed === undefined ? 2027 : settings.seed);
    let selected = null;
    for (let attempt = 0; attempt < 12 && selected === null; attempt += 1) {
      let filter = createCuckooFilter(8, 2, 5, seed);
      const frames = [cuckooSnapshot("initial", "Восемь корзин начинают пустыми; в каждой два слота", filter)];
      const stride = 2 * attempt + 1;
      const start = attempt * 1000 + 1;
      for (let offset = 0; offset < 200 && filter.items.length < 15; offset += 1) {
        const key = start + offset * stride;
        const insertion = cuckooInsert(filter, key, 16);
        if (!insertion.inserted) continue;
        filter = insertion.state;
        insertion.frames.forEach(function (current) { frames.push(current); });
        if (insertion.relocations > 0) {
          selected = { filter: filter, frames: frames, relocatedKey: key };
          break;
        }
      }
    }
    if (selected === null) throw new Error("не удалось построить ограниченный сценарий успешного вытеснения");
    const filter = selected.filter;
    const frames = selected.frames;
    const relocatedKey = selected.relocatedKey;
    const value = fingerprint(relocatedKey, filter.fingerprintBits, filter.seed);
    const candidates = cuckooIndices(relocatedKey, value, filter.bucketCount, filter.seed);
    frames.push(cuckooSnapshot("query", "Запрос проверяет только две кандидатные корзины и находит отпечаток", filter, {
      key: relocatedKey,
      fingerprint: value,
      candidates: candidates,
      queryResult: cuckooContains(filter, relocatedKey),
      finished: true,
    }));
    return shared.deepFreeze(frames);
  }

  function createState(mode, options) {
    let frames;
    if (mode === "bloom") frames = bloomScenario(options);
    else if (mode === "counting") frames = countingScenario(options);
    else if (mode === "cuckoo") frames = cuckooScenario(options);
    else throw new RangeError("неизвестный режим вероятностного фильтра");
    return shared.deepFreeze({
      mode: mode,
      frames: frames,
      frameIndex: 0,
      finished: frames.length <= 1,
    });
  }

  function step(state) {
    if (!state || !Array.isArray(state.frames) || !Number.isInteger(state.frameIndex)) {
      throw new TypeError("повреждённое состояние воспроизведения");
    }
    if (state.finished) return state;
    const frameIndex = Math.min(state.frames.length - 1, state.frameIndex + 1);
    return shared.deepFreeze({
      mode: state.mode,
      frames: state.frames,
      frameIndex: frameIndex,
      finished: frameIndex >= state.frames.length - 1,
    });
  }

  function visualModel(state) {
    const frame = state.frames[state.frameIndex];
    if (state.mode === "cuckoo") {
      const occupied = frame.buckets.reduce(function (sum, bucket) { return sum + bucket.length; }, 0);
      return shared.deepFreeze({
        mode: state.mode,
        frame: frame,
        frameIndex: state.frameIndex,
        frameCount: state.frames.length,
        occupied: occupied,
        capacity: frame.bucketCount * frame.bucketSize,
        exact: true,
      });
    }
    const occupied = frame.values.filter(function (value) { return value > 0; }).length;
    return shared.deepFreeze({
      mode: state.mode,
      frame: frame,
      frameIndex: state.frameIndex,
      frameCount: state.frames.length,
      occupied: occupied,
      capacity: frame.m,
      probability: bloomFalsePositiveProbability(frame.m, frame.insertedKeys.length, frame.k),
      optimalK: frame.insertedKeys.length ? optimalHashCount(frame.m, frame.insertedKeys.length) : null,
      exact: true,
    });
  }

  return {
    MAX_BITS: MAX_BITS,
    MAX_HASHES: MAX_HASHES,
    MAX_COUNTER: MAX_COUNTER,
    MAX_CUCKOO_BUCKETS: MAX_CUCKOO_BUCKETS,
    MAX_RELOCATIONS: MAX_RELOCATIONS,
    MAX_SCENARIO_SEED: MAX_SCENARIO_SEED,
    normalizeScenarioSeed: normalizeScenarioSeed,
    mix32: mix32,
    hashPositions: hashPositions,
    bloomFalsePositiveProbability: bloomFalsePositiveProbability,
    optimalHashCount: optimalHashCount,
    createBloom: createBloom,
    bloomInsert: bloomInsert,
    bloomQuery: bloomQuery,
    findFalsePositiveWitness: findFalsePositiveWitness,
    createCountingBloom: createCountingBloom,
    countingInsert: countingInsert,
    countingDelete: countingDelete,
    countingQuery: countingQuery,
    fingerprint: fingerprint,
    alternateIndex: alternateIndex,
    cuckooIndices: cuckooIndices,
    createCuckooFilter: createCuckooFilter,
    cuckooContains: cuckooContains,
    cuckooInsert: cuckooInsert,
    bloomScenario: bloomScenario,
    countingScenario: countingScenario,
    cuckooScenario: cuckooScenario,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
