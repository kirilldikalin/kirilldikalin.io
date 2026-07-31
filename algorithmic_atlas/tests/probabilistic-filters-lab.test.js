const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/probabilistic-filters-core.js");

function closeTo(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " differs from " + expected);
}

test("Bloom probability and continuous optimal k match their formulas", () => {
  const expected = Math.pow(1 - Math.exp(-7 * 100 / 1000), 7);
  closeTo(core.bloomFalsePositiveProbability(1000, 100, 7), expected, 1e-15);
  closeTo(core.optimalHashCount(1000, 100), 10 * Math.LN2, 1e-15);
  assert.equal(core.bloomFalsePositiveProbability(1000, 0, 7), 0);
});

test("deterministic hash positions are reproducible and bounded", () => {
  const first = core.hashPositions(314, 32, 5, 2027);
  const second = core.hashPositions(314, 32, 5, 2027);
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  first.forEach((position) => assert.ok(position >= 0 && position < 32));
  assert.notDeepEqual(first, core.hashPositions(314, 32, 5, 2028));
});

test("Bloom insertions never create false negatives", () => {
  let filter = core.createBloom(40, 4, 2027);
  const keys = [3, 11, 19, 27, 41, 58];
  keys.forEach((key) => { filter = core.bloomInsert(filter, key); });
  keys.forEach((key) => {
    const query = core.bloomQuery(filter, key);
    assert.equal(query.result, true);
    assert.equal(query.actualMember, true);
    assert.equal(query.falsePositive, false);
  });
});

test("the false-positive witness is intentional and reproducible", () => {
  let filter = core.createBloom(24, 3, 2027);
  [7, 13, 29, 44].forEach((key) => { filter = core.bloomInsert(filter, key); });
  const first = core.findFalsePositiveWitness(filter, 0, 20000);
  const second = core.findFalsePositiveWitness(filter, 0, 20000);
  assert.ok(first);
  assert.deepEqual(first, second);
  assert.equal(filter.items.includes(first.key), false);
  assert.equal(first.result, true);
  assert.equal(first.falsePositive, true);
  first.positions.forEach((position) => assert.equal(filter.bits[position], 1));
});

test("every UI Bloom parameter combination has a bounded witness", () => {
  for (let seed = 1; seed <= core.MAX_SCENARIO_SEED; seed += 1) {
    for (const m of [20, 24, 28, 32, 36, 40]) {
      for (let k = 2; k <= 5; k += 1) {
        const frames = core.bloomScenario({ seed, m, k });
        const result = frames.at(-1);
        assert.equal(result.falsePositive, true);
        assert.equal(result.actualMember, false);
        assert.equal(result.queryResult, true);
        const counting = core.countingScenario({ seed, m, k });
        assert.equal(counting.at(-1).finished, true);
      }
    }
  }
});

test("counting Bloom deletion removes exactly one known insertion", () => {
  let filter = core.createCountingBloom(32, 4, 73, 7);
  const inserted = [5, 17, 31, 46];
  inserted.forEach((key) => { filter = core.countingInsert(filter, key); });
  const totalBefore = filter.counters.reduce((sum, value) => sum + value, 0);
  filter = core.countingDelete(filter, 17);
  assert.equal(filter.counters.reduce((sum, value) => sum + value, 0), totalBefore - 4);
  assert.equal(filter.items.includes(17), false);
  [5, 31, 46].forEach((key) => assert.equal(core.countingQuery(filter, key).result, true));
  assert.throws(() => core.countingDelete(filter, 999), /только ключ/);
});

test("small counting Bloom counters fail closed on overflow", () => {
  const filter = core.createCountingBloom(4, 8, 5, 1);
  assert.throws(() => core.countingInsert(filter, 12), /переполнится/);
});

test("cuckoo alternate buckets are an involution", () => {
  for (let fingerprint = 1; fingerprint <= 31; fingerprint += 1) {
    for (let bucket = 0; bucket < 8; bucket += 1) {
      const alternate = core.alternateIndex(bucket, fingerprint, 8, 2027);
      assert.ok(alternate >= 0 && alternate < 8);
      assert.equal(core.alternateIndex(alternate, fingerprint, 8, 2027), bucket);
    }
  }
});

test("cuckoo scenario preserves membership through bounded relocation", () => {
  const frames = core.cuckooScenario({ seed: 2027 });
  assert.ok(frames.some((frame) => frame.action === "evict"));
  assert.ok(frames.some((frame) => frame.action === "relocated"));
  const final = frames.at(-1);
  const filter = {
    bucketCount: final.bucketCount,
    bucketSize: final.bucketSize,
    fingerprintBits: final.fingerprintBits,
    seed: final.seed,
    buckets: final.buckets,
    items: final.insertedKeys,
  };
  final.insertedKeys.forEach((key) => assert.equal(core.cuckooContains(filter, key), true));
  frames.forEach((frame) => {
    assert.ok(frame.relocations <= core.MAX_RELOCATIONS);
    frame.buckets.forEach((bucket) => assert.ok(bucket.length <= frame.bucketSize));
    if (frame.action === "evict") {
      assert.equal(frame.fingerprint, frame.displacedFingerprint);
      assert.deepEqual(frame.candidates, [
        frame.activeBucket,
        core.alternateIndex(frame.activeBucket, frame.displacedFingerprint, frame.bucketCount, frame.seed),
      ]);
    }
  });
  assert.equal(final.queryResult, true);
});

test("every normalized UI seed yields a terminating cuckoo relocation", () => {
  for (let seed = 1; seed <= core.MAX_SCENARIO_SEED; seed += 1) {
    const frames = core.cuckooScenario({ seed });
    assert.equal(frames.at(-1).action, "query");
    assert.equal(frames.at(-1).queryResult, true);
    assert.ok(frames.some((frame) => frame.action === "relocated"));
  }
  for (const rawSeed of [-Number.MAX_SAFE_INTEGER, -1, 0, Number.MAX_SAFE_INTEGER]) {
    const normalized = core.normalizeScenarioSeed(rawSeed);
    assert.ok(normalized >= 1 && normalized <= core.MAX_SCENARIO_SEED);
    assert.equal(core.normalizeScenarioSeed(normalized), normalized);
    for (const mode of ["bloom", "counting", "cuckoo"]) {
      const state = core.createState(mode, { seed: rawSeed, m: 24, k: 3 });
      assert.equal(state.frames[0].seed, normalized);
    }
  }
});

test("failed cuckoo relocation rolls back without losing old members", () => {
  let filter = core.createCuckooFilter(4, 1, 4, 91);
  let failure = null;
  for (let key = 1; key <= 200 && failure === null; key += 1) {
    if (filter.items.includes(key)) continue;
    const insertion = core.cuckooInsert(filter, key, 0);
    if (insertion.inserted) filter = insertion.state;
    else failure = insertion;
  }
  assert.ok(failure);
  assert.equal(failure.relocations, 0);
  assert.equal(failure.frames.at(-1).rolledBack, true);
  assert.deepEqual(failure.state, filter);
  filter.items.forEach((key) => assert.equal(core.cuckooContains(failure.state, key), true));
});

test("playback is immutable, bounded, and terminates in every mode", () => {
  for (const mode of ["bloom", "counting", "cuckoo"]) {
    let state = core.createState(mode, { seed: 2027, m: 24, k: 3 });
    const initial = state;
    const initialFrame = state.frames[0];
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.frames), true);
    let steps = 0;
    while (!state.finished) {
      state = core.step(state);
      steps += 1;
      assert.ok(steps < 120);
    }
    assert.equal(state.frameIndex, state.frames.length - 1);
    assert.equal(initial.frameIndex, 0);
    assert.strictEqual(initial.frames[0], initialFrame);
    assert.equal(core.visualModel(state).exact, true);
  }
});

test("invalid bounds and malformed playback fail closed", () => {
  assert.throws(() => core.hashPositions(1, 65, 3, 1), /от 4 до 64/);
  assert.throws(() => core.hashPositions(1, 16, 9, 1), /от 1 до 8/);
  assert.throws(() => core.createCuckooFilter(6, 2, 5, 1), /степенью двойки/);
  assert.throws(() => core.createState("xor", {}), /неизвестный режим/);
  assert.throws(() => core.step({}), /повреждённое состояние/);
});
