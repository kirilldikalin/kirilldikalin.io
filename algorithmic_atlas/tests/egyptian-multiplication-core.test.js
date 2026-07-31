const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/egyptian-multiplication-core.js");

test("integer parser accepts signs and rejects malformed or oversized input", () => {
  assert.equal(core.parseInteger("  -0041 ", "x"), -41n);
  assert.equal(core.parseInteger("+0", "x"), 0n);
  assert.throws(() => core.parseInteger("", "x"), /введите целое число/);
  assert.throws(() => core.parseInteger("4.1", "x"), /только целые числа/);
  assert.throws(
    () => core.parseInteger("1".repeat(core.MAX_DIGITS + 1), "x"),
    /не больше/
  );
});

test("41 times 59 keeps the invariant after every step", () => {
  const run = core.runToEnd(core.createState(41n, 59n));
  assert.equal(run.result, 2419n);
  assert.equal(run.state.finished, true);
  assert.equal(run.state.multiplier, 0n);
  assert.equal(run.state.accumulator, 2419n);
  run.trace.forEach((state) => {
    assert.equal(core.invariantHolds(state), true);
    assert.equal(core.invariantValue(state), 2419n);
  });
});

test("odd and even transitions apply the intended exact rules", () => {
  const initial = core.createState(13n, 27n);
  const odd = core.step(initial);
  assert.deepEqual(
    [odd.multiplier, odd.multiplicand, odd.accumulator, odd.lastRule],
    [6n, 54n, 27n, "odd"]
  );
  const even = core.step(odd);
  assert.deepEqual(
    [even.multiplier, even.multiplicand, even.accumulator, even.lastRule],
    [3n, 108n, 27n, "even"]
  );
});

test("zero and negative factors are handled without losing exactness", () => {
  assert.equal(core.runToEnd(core.createState(0n, 999n)).result, 0n);
  assert.equal(core.runToEnd(core.createState(-13n, 27n)).result, -351n);
  assert.equal(core.runToEnd(core.createState(-13n, -27n)).result, 351n);
});

test("large values use BigInt and never pass through floating point", () => {
  const left = 10n ** 70n + 123456789n;
  const right = -(10n ** 65n + 7n);
  const run = core.runToEnd(core.createState(left, right));
  assert.equal(run.result, left * right);
  assert.ok(run.trace.length < 300);
});

test("a finished state is stable and exposes its signed result", () => {
  const finished = core.runToEnd(core.createState(1n, 7n)).state;
  assert.equal(core.nextRule(finished), "halt");
  assert.equal(core.step(finished), finished);
  assert.equal(core.signedResult(finished), 7n);
});

test("geometry exposes the exact even area transformation", () => {
  const state = core.createState(14n, 8n);
  const geometry = core.geometryModel(state);
  assert.equal(geometry.rule, "even");
  assert.deepEqual(
    [geometry.before.width, geometry.before.height, geometry.before.area],
    [14n, 8n, 112n]
  );
  assert.deepEqual(
    [geometry.after.width, geometry.after.height, geometry.after.area],
    [7n, 16n, 112n]
  );
  assert.equal(geometry.extractedStrip, 0n);
  assert.equal(geometry.accumulatorAfter + geometry.remainingAfter, 112n);
  assert.equal(geometry.exact, true);
});

test("geometry separates one strip on an odd step and keeps total area", () => {
  const state = core.createState(13n, 8n);
  const geometry = core.geometryModel(state);
  assert.equal(geometry.rule, "odd");
  assert.equal(geometry.extractedStrip, 8n);
  assert.equal(geometry.accumulatorAfter, 8n);
  assert.deepEqual(
    [geometry.after.width, geometry.after.height, geometry.after.area],
    [6n, 16n, 96n]
  );
  assert.equal(geometry.accumulatorAfter + geometry.remainingAfter, 104n);

  const next = core.step(state);
  assert.equal(next.accumulator, geometry.accumulatorAfter);
  assert.equal(
    next.multiplier * next.multiplicand,
    geometry.remainingAfter
  );
});

test("geometry remains bounded and exact in value for huge inputs", () => {
  const state = core.createState(10n ** 70n + 1n, 10n ** 65n + 3n);
  const geometry = core.geometryModel(state);
  assert.equal(geometry.exact, false);
  assert.equal(
    geometry.accumulatorAfter + geometry.remainingAfter,
    state.targetMagnitude
  );
  assert.ok(geometry.accumulatorFraction >= 0);
  assert.ok(geometry.accumulatorFraction <= 1);
  assert.ok(geometry.remainingFraction >= 0);
  assert.ok(geometry.remainingFraction <= 1);
});

test("finished zero and nonzero products have a stable geometry", () => {
  const zero = core.geometryModel(core.createState(0n, 99n));
  assert.equal(zero.finished, true);
  assert.equal(zero.targetArea, 0n);
  assert.equal(zero.accumulatorFraction, 1);

  const finished = core.runToEnd(core.createState(7n, 9n)).state;
  const geometry = core.geometryModel(finished);
  assert.equal(geometry.finished, true);
  assert.equal(geometry.accumulatorAfter, 63n);
  assert.equal(geometry.remainingAfter, 0n);
});
