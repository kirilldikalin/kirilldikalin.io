const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/euclidean-algorithm-core.js");

test("integer parser follows the atlas BigInt input policy", () => {
  assert.equal(core.parseInteger(" -001071 ", "a"), -1071n);
  assert.equal(core.parseInteger("+0", "a"), 0n);
  assert.throws(() => core.parseInteger("", "a"), /введите целое число/);
  assert.throws(() => core.parseInteger("10.5", "a"), /только целые числа/);
  assert.throws(
    () => core.parseInteger("9".repeat(core.MAX_DIGITS + 1), "a"),
    /не больше/
  );
});

test("1071 and 462 produce the exact textbook division trace", () => {
  const run = core.runToEnd(core.createState(1071n, 462n));
  assert.equal(run.gcd, 21n);
  assert.equal(run.divisionCount, 3);
  assert.equal(run.subtractionCount, 11n);
  assert.deepEqual(
    run.trace.slice(1).map(({ lastDivision }) => [
      lastDivision.dividend,
      lastDivision.divisor,
      lastDivision.quotient,
      lastDivision.remainder,
    ]),
    [
      [1071n, 462n, 2n, 147n],
      [462n, 147n, 3n, 21n],
      [147n, 21n, 7n, 0n],
    ]
  );
});

test("every division preserves the gcd invariant", () => {
  const run = core.runToEnd(core.createState(1234567891011n, 987654321n));
  run.trace.forEach((state) => {
    assert.equal(core.invariantHolds(state), true);
    assert.equal(core.gcd(state.a, state.b), run.gcd);
  });
});

test("zero, equal and negative inputs follow the stated domain policy", () => {
  assert.equal(core.runToEnd(core.createState(48n, 0n)).gcd, 48n);
  assert.equal(core.runToEnd(core.createState(0n, -48n)).gcd, 48n);
  assert.equal(core.runToEnd(core.createState(-48n, -18n)).gcd, 6n);
  assert.equal(core.runToEnd(core.createState(25n, 25n)).gcd, 25n);
  assert.throws(() => core.createState(0n, 0n), /не определён/);
});

test("division and literal repeated subtraction agree on small inputs", () => {
  for (let left = 0n; left <= 40n; left += 1n) {
    for (let right = 0n; right <= 40n; right += 1n) {
      if (left === 0n && right === 0n) continue;
      const division = core.runToEnd(core.createState(left, right));
      const subtraction = core.subtractionRun(left, right);
      assert.equal(subtraction.truncated, false);
      assert.equal(subtraction.gcd, division.gcd);
      assert.equal(subtraction.steps, division.subtractionCount);
    }
  }
});

test("consecutive Fibonacci inputs realize the Lamé worst-case trace", () => {
  for (const index of [2, 5, 20, 100, 400]) {
    const badCase = core.fibonacciBadCase(index);
    const run = core.runToEnd(core.createState(badCase.larger, badCase.smaller));
    assert.equal(run.divisionCount, badCase.expectedDivisionCount);
    assert.equal(run.gcd, 1n);
    const minimum = core.minimumPairForDivisions(run.divisionCount);
    assert.equal(minimum.larger, badCase.larger);
    assert.equal(minimum.smaller, badCase.smaller);
  }
});

test("large integers remain exact and complete within the guarded step count", () => {
  const left = 10n ** 115n + 123456789n;
  const right = 10n ** 110n + 987654321n;
  const run = core.runToEnd(core.createState(left, right));
  assert.equal(run.gcd, core.gcd(left, right));
  assert.ok(run.divisionCount < core.MAX_STEPS);
  assert.equal(core.bitLength(left), left.toString(2).length);
});

test("geometry becomes schematic without changing exact quotient data", () => {
  const exact = core.geometryModel(core.createState(48n, 18n));
  assert.equal(exact.schematic, false);
  assert.equal(exact.quotient, 2n);
  assert.equal(exact.remainder, 12n);
  assert.equal(exact.visibleSquareCount, 2);
  assert.equal(exact.sourceArea, 48n * 18n);
  assert.equal(exact.tiledArea, 2n * 18n * 18n);
  assert.equal(exact.remainderArea, 12n * 18n);
  assert.equal(exact.identityHolds, true);
  assert.deepEqual(exact.nextPair, { a: 18n, b: 12n });

  const huge = core.geometryModel(
    core.createState(10n ** 80n + 1n, 3n)
  );
  assert.equal(huge.schematic, true);
  assert.equal(huge.quotient, (10n ** 80n + 1n) / 3n);
  assert.equal(huge.visibleSquareCount, 3);
});

test("Fibonacci phases expose the repeated minimum positive quotient", () => {
  const badCase = core.fibonacciBadCase(20);
  const run = core.runToEnd(
    core.createState(badCase.larger, badCase.smaller)
  );
  const models = run.trace
    .filter((state) => !state.finished)
    .map(core.geometryModel);

  assert.ok(models.length > 2);
  models.slice(0, -1).forEach((model) => {
    assert.equal(model.quotient, 1n);
    assert.equal(model.isSlowQuotient, true);
  });
  assert.equal(models.at(-1).quotient, 2n);
  assert.equal(models.at(-1).remainder, 0n);
  assert.equal(models.at(-1).isSlowQuotient, false);
});

test("every geometry model agrees with the Euclidean transition", () => {
  let state = core.createState(1071n, 462n);
  while (!state.finished) {
    const model = core.geometryModel(state);
    const next = core.step(state);
    assert.equal(model.identityHolds, true);
    assert.equal(model.tiledArea + model.remainderArea, model.sourceArea);
    assert.deepEqual(
      [next.a, next.b],
      [model.nextPair.a, model.nextPair.b]
    );
    assert.equal(core.gcd(model.a, model.b), core.gcd(next.a, next.b));
    state = next;
  }
});
