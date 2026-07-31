const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/lsm-learned-indexes-core.js");

test("LSM playback preserves newest-value and tombstone semantics", () => {
  const frames = core.buildLsmFrames({
    operations: "1=A,2=B,3=C,1=A2,2=DEL,4=D",
    memtableLimit: 2,
    runLimit: 2,
    policy: "leveled",
  });
  const final = frames.at(-1);
  const updated = core.lookup(final, 1);
  assert.equal(updated.key, 1);
  assert.equal(updated.found, true);
  assert.equal(updated.deleted, false);
  assert.equal(updated.value, "A2");
  assert.match(updated.sourceId, /^L1-/);
  assert.ok(updated.runsChecked >= 1);
  const deleted = core.lookup(final, 2);
  assert.equal(deleted.found, false);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.value, null);
  assert.ok(frames.some((frame) => frame.action === "flush"));
  assert.ok(frames.some((frame) => frame.action === "compaction"));
});

test("LSM metrics count WAL, flush and compaction writes exactly", () => {
  const frames = core.buildLsmFrames({
    operations: "1=A,2=B,3=C,4=D",
    memtableLimit: 2,
    runLimit: 2,
    policy: "leveled",
  });
  const final = frames.at(-1);
  assert.equal(final.metrics.logicalWrites, 4);
  assert.equal(final.metrics.physicalWrites, 12);
  assert.equal(final.metrics.writeAmplification, 3);
  assert.equal(final.metrics.liveEntries, 4);
  assert.equal(final.metrics.physicalEntries, 4);
  assert.equal(final.metrics.spaceAmplification, 1);
  assert.equal(final.levels[0].length, 0);
  assert.equal(final.levels[1].length, 1);
});

test("tiered and leveled policies expose different run layouts without losing values", () => {
  const options = {
    operations: "1=A,2=B,3=C,4=D,5=E,6=F,7=G,8=H",
    memtableLimit: 2,
    runLimit: 2,
  };
  const leveled = core.buildLsmFrames({ ...options, policy: "leveled" }).at(-1);
  const tiered = core.buildLsmFrames({ ...options, policy: "tiered" }).at(-1);
  assert.ok(tiered.levels[1].length > leveled.levels[1].length);
  for (let key = 1; key <= 8; key += 1) {
    assert.equal(core.lookup(leveled, key).found, true);
    assert.equal(core.lookup(tiered, key).found, true);
  }
});

test("learned error bound contains every stored key", () => {
  const model = core.learnedModel("1,2,3,20,21,22,80,81,100");
  assert.ok(model.epsilon > 0);
  model.keys.forEach((key, index) => {
    const result = core.learnedLookup(model, key);
    assert.equal(result.found, true);
    assert.equal(result.index, index);
    assert.ok(index >= result.start && index <= result.end);
  });
});

test("last-mile search distinguishes absence from an approximate prediction", () => {
  const model = core.learnedModel("10,20,30,40,50,60");
  const missing = core.learnedLookup(model, 35);
  assert.equal(missing.found, false);
  assert.equal(missing.index, 3);
  assert.ok(missing.comparisons > 0);
  assert.ok(missing.index >= missing.start && missing.index <= missing.end + 1);
});

test("both laboratory modes remain bounded and terminate", () => {
  [
    core.createState({ mode: "lsm", operations: "1=A,2=B,3=C,4=D" }),
    core.createState({ mode: "learned", keys: "2,5,9,14,20", query: 14 }),
  ].forEach((initial) => {
    let state = initial;
    let guard = 0;
    while (!core.isFinished(state) && guard < 200) {
      state = core.step(state);
      guard += 1;
    }
    assert.equal(core.isFinished(state), true);
    assert.ok(guard < 200);
  });
});

test("invalid operations and learned key sets fail before playback", () => {
  assert.throws(() => core.parseOperations("not-an-operation"), /ключ=значение/);
  assert.throws(() => core.parseOperations("1="), /ключ=значение/);
  assert.throws(() => core.parseKeys("1,2,2,3"), /уникальны/);
  assert.throws(() => core.parseKeys("1,2,3"), /от 4/);
  assert.throws(() => core.createState({ mode: "other" }), /режим/);
});
