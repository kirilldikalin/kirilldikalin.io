const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/hash-tables-core.js");

function run(initial) {
  let state = initial;
  let guard = 0;
  while (!state.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard < 200);
  }
  return state;
}

test("all strategies retain the same unique key set across a deterministic rebuild", () => {
  const options = { keys: [18, 25, 39, 11, 32, 4, 53, 67, 74, 81], capacity: 5, seed: 91 };
  const first = run(core.createState(options));
  const second = run(core.createState(options));
  assert.deepEqual(first.frame, second.frame);
  assert.ok(first.trace.frames.some((frame) => frame.action === "rehash"));
  const expected = options.keys.slice().sort((a, b) => a - b);
  const openKeys = first.frame.tables.linear.filter(Boolean).map((slot) => slot.key).sort((a, b) => a - b);
  const chainedKeys = first.frame.tables.chaining.flat().sort((a, b) => a - b);
  assert.deepEqual(openKeys, expected);
  assert.deepEqual(chainedKeys, expected);
});

test("a colliding sequence exposes probes and Robin Hood displacement", () => {
  const capacity = 7;
  const seed = 17;
  const buckets = new Map();
  for (let key = 0; key < 500; key += 1) {
    const bucket = core.home(key, capacity, seed);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(key);
  }
  const keys = Array.from(buckets.values()).find((group) => group.length >= 4).slice(0, 4);
  const final = run(core.createState({ keys, capacity, seed }));
  assert.ok(final.frame.details.linear.probes.length >= 4);
  assert.ok(final.frame.tables["robin-hood"].some((slot) => slot && slot.displacement > 0));
});

test("expected probe formulas state their assumptions through valid domains", () => {
  assert.equal(core.expectedChaining(2, false), 2);
  assert.equal(core.expectedChaining(2, true), 2);
  assert.ok(Math.abs(core.expectedUniformOpenAddressing(0.5, false) - 2) < 1e-12);
  assert.ok(Math.abs(core.expectedUniformOpenAddressing(0.5, true) - 2 * Math.log(2)) < 1e-12);
  assert.throws(() => core.expectedUniformOpenAddressing(1, false), /\[0, 1\)/);
});

test("invalid and adversarially large inputs fail before probing", () => {
  assert.throws(() => core.createState({ keys: [1, 1] }), /уникальны/);
  assert.throws(() => core.createState({ keys: Array.from({ length: 25 }, (_, i) => i) }), /24/);
  assert.throws(() => core.createState({ keys: [1], capacity: 100 }), /от 5/);
});
