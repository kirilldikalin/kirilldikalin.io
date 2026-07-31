const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/input-size-core.js");

test("positive integer parsing is exact and bounded", () => {
  assert.equal(core.parsePositiveInteger("00042", "N"), 42n);
  assert.equal(core.parsePositiveInteger("+" + "9".repeat(121)), BigInt("9".repeat(121)));
  assert.throws(() => core.parsePositiveInteger("0", "N"), /больше нуля/);
  assert.throws(() => core.parsePositiveInteger("-1", "N"), /положительное/);
  assert.throws(() => core.parsePositiveInteger("1.5", "N"), /положительное/);
  assert.throws(() => core.parsePositiveInteger("1".repeat(122), "N"), /121 цифр/);
});

test("binary length handles boundaries and huge integers without Number", () => {
  assert.equal(core.bitLength(0n), 1);
  assert.equal(core.bitLength(1n), 1);
  assert.equal(core.bitLength(2n), 2);
  assert.equal(core.bitLength(3n), 2);
  assert.equal(core.bitLength(4n), 3);
  assert.equal(core.bitLength(core.powerOfTwo(399)), 400);
  assert.equal(
    core.parsePositiveInteger(String(core.powerOfTwo(399))),
    core.powerOfTwo(399)
  );
  assert.throws(() => core.powerOfTwo(400), /between 0 and 399/);
});

test("binary and unary previews never materialize an unbounded representation", () => {
  const huge = core.powerOfTwo(399);
  const binary = core.binaryPreview(huge);
  const unary = core.unaryPreview(huge);
  assert.equal(binary.totalBits, 400);
  assert.equal(binary.truncated, true);
  assert.ok(binary.text.length < 100);
  assert.equal(unary.totalSymbols, huge);
  assert.equal(unary.truncated, true);
  assert.ok(unary.text.length < 60);
});

test("magnitude model separates numeric value from representation length", () => {
  const value = core.powerOfTwo(100);
  const model = core.magnitudeModel(value, 1000000000n);
  assert.equal(model.bitLength, 101);
  assert.equal(model.unaryLength, value);
  assert.equal(model.algorithms[0].steps, value);
  assert.equal(model.algorithms[1].steps, 101n);
  assert.equal(model.algorithms[2].steps, 10201n);
  assert.equal(model.algorithms[0].evaluation, "analytic");
  assert.equal(model.algorithms[1].evaluation, "direct-range");
});

test("duration estimates stay exact before presentation rounding", () => {
  assert.equal(core.formatDuration(0n, 1000000000n), "0 с");
  assert.equal(core.formatDuration(1000000000n, 1000000000n), "1 с");
  assert.equal(core.formatDuration(100000000000n, 1000000000n), "≈ 1 мин 40 с");
  assert.match(
    core.formatDuration(10n ** 100n, 1000000000n),
    /^≈ .* лет$/
  );
});

test("logarithmic shares are finite, monotone and capped", () => {
  const maximum = 10n ** 100n;
  const values = [1n, 10n, 10n ** 20n, maximum];
  const shares = values.map((value) => core.logScale(value, maximum));
  shares.forEach((share) => {
    assert.ok(Number.isFinite(share));
    assert.ok(share >= 0 && share <= 1);
  });
  assert.ok(shares[0] < shares[1]);
  assert.ok(shares[1] < shares[2]);
  assert.equal(shares[3], 1);
});

test("gcd comparison derives all counts without literal huge loops", () => {
  const model = core.gcdOperationCounts(48n, 18n);
  assert.equal(model.gcd, 6n);
  assert.equal(model.naiveChecks, 13n);
  assert.equal(model.subtractionSteps, 4n);
  assert.equal(model.divisionSteps, 3n);
  assert.ok(model.schoolbookBitWork > model.divisionSteps);
});

test("gcd comparison covers equal and highly unbalanced inputs", () => {
  const equal = core.gcdOperationCounts(17n, 17n);
  assert.equal(equal.gcd, 17n);
  assert.equal(equal.naiveChecks, 1n);
  assert.equal(equal.subtractionSteps, 0n);
  assert.equal(equal.divisionSteps, 1n);

  const unbalanced = core.gcdOperationCounts(10n ** 100n + 1n, 1n);
  assert.equal(unbalanced.gcd, 1n);
  assert.equal(unbalanced.subtractionSteps, 10n ** 100n);
  assert.equal(unbalanced.divisionSteps, 1n);
  assert.equal(unbalanced.algorithms[1].evaluation, "analytic");
});

test("the direct-simulation boundary is explicit", () => {
  assert.equal(core.evaluationKind(core.DIRECT_SIMULATION_LIMIT), "direct-range");
  assert.equal(core.evaluationKind(core.DIRECT_SIMULATION_LIMIT + 1n), "analytic");
});

test("small encoding geometry uses one equal cell per physical symbol", () => {
  const geometry = core.encodingGeometry(13n);
  assert.equal(geometry.mode, "exact");
  assert.equal(geometry.unaryExact, true);
  assert.equal(geometry.unaryGroups.length, 13);
  assert.ok(geometry.unaryGroups.every((size) => size === 1n));
  assert.equal(geometry.binaryExact, true);
  assert.equal(geometry.binaryHead, "1101");
  assert.equal(geometry.binaryTail, "");
  assert.equal(geometry.binaryLength, 4);
  assert.equal(geometry.binaryValue, 13n);
  assert.equal(geometry.lowerBound, 8n);
  assert.equal(geometry.upperBoundExclusive, 16n);
  assert.equal(geometry.patternCapacity, 16n);
});

test("aggregated unary blocks preserve the exact represented length", () => {
  const geometry = core.encodingGeometry(1000000n, 32);
  assert.equal(geometry.mode, "aggregated");
  assert.equal(geometry.unaryExact, false);
  assert.equal(geometry.unaryGroups.length, 32);
  assert.equal(geometry.representedUnaryLength, 1000000n);
  assert.ok(
    geometry.unaryCompressionCeiling - geometry.unaryCompressionFloor <= 1n
  );
  assert.equal(
    geometry.unaryGroups.reduce((sum, group) => sum + group, 0n),
    geometry.value
  );
});

test("huge binary geometry stays bounded without losing bits or bounds", () => {
  const value = core.powerOfTwo(399);
  const geometry = core.encodingGeometry(value);
  assert.equal(geometry.binaryLength, 400);
  assert.equal(geometry.binaryExact, false);
  assert.equal(
    geometry.binaryHead.length +
      geometry.binaryTail.length +
      geometry.binaryOmitted,
    400
  );
  assert.equal(geometry.binaryValue, value);
  assert.equal(geometry.lowerBound, value);
  assert.equal(geometry.upperBoundExclusive, value * 2n);
  assert.ok(geometry.unaryGroups.length <= geometry.cellLimit);
  assert.equal(geometry.representedUnaryLength, value);
  assert.ok(geometry.unaryLogShare > geometry.binaryLogShare);
});

test("encoding geometry validates its bounded rendering contract", () => {
  assert.throws(() => core.encodingGeometry(0n), /positive BigInt/);
  assert.throws(() => core.encodingGeometry(1n, 7), /between 8 and 96/);
  assert.throws(() => core.encodingGeometry(1n, 97), /between 8 and 96/);
});
