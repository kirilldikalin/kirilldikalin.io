const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../labs/asymptotics-core.js");

const EXPECTED_RELATIONS = {
  "quadratic-polynomial-vs-square": ["O", "Omega", "Theta"],
  "square-vs-linear": ["Omega", "omega"],
  "linear-vs-square": ["O", "o"],
  "exponential-vs-cubic": ["Omega", "omega"],
  "affine-vs-linear": ["O", "Omega", "Theta"],
  "n-log-n-vs-square": ["O", "o"],
  "exponential-vs-polynomial": ["Omega", "omega"],
  "oscillating-spikes": ["Omega"],
  "bounded-oscillation": ["O", "Omega", "Theta"],
};

test("the lab exposes fixed scenarios and never evaluates user code", () => {
  assert.deepEqual(
    core.RELATIONS.map(({ id }) => id),
    ["O", "Omega", "Theta", "o", "omega"]
  );
  assert.deepEqual(
    core.SCENARIOS.map(({ id }) => id),
    Object.keys(EXPECTED_RELATIONS)
  );
  core.SCENARIOS.forEach((scenario) => {
    assert.equal(Object.isFrozen(scenario), true);
    assert.match(scenario.id, /^[a-z0-9-]+$/);
    assert.ok(scenario.f.tex);
    assert.ok(scenario.g.tex);
    assert.equal(typeof scenario.minimumN, "bigint");
  });

  const source = fs.readFileSync(
    path.join(__dirname, "../labs/asymptotics-core.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\b/);
  assert.throws(() => core.getScenario("user-supplied"), /unknown/);
});

test("every true relation has an analytic witness and every false one a counterexample", () => {
  assert.equal(core.validateScenarioTable(), true);
  core.SCENARIOS.forEach((scenario) => {
    core.RELATIONS.forEach((relation) => {
      const result = core.relationResult(scenario.id, relation.id);
      assert.equal(result.basis, "analytic");
      assert.equal(typeof result.holds, "boolean");
      assert.match(result.statement, /\\in/);
      if (result.holds) {
        assert.ok(result.evidence.witness);
        assert.equal(result.evidence.counterexample, null);
      } else {
        assert.ok(result.evidence.counterexample);
        assert.equal(result.evidence.witness, null);
        assert.equal(
          [
            "ratio",
            "sequence",
            "choose",
            "inequality",
            "failedConstant",
          ].some((key) =>
            typeof result.evidence.counterexample[key] === "string" &&
            result.evidence.counterexample[key].trim().length > 0
          ),
          true,
          `${scenario.id}/${relation.id} needs substantive analytic evidence`
        );
      }
    });
  });
});

test("all five relation kinds are classified mathematically, not from samples", () => {
  Object.entries(EXPECTED_RELATIONS).forEach(([scenarioId, expected]) => {
    const answer = core.checkClassification(scenarioId, expected);
    assert.equal(answer.correct, true);
    assert.deepEqual(answer.actual, expected);
    assert.deepEqual(answer.missing, []);
    assert.deepEqual(answer.extra, []);
  });

  const incomplete = core.checkClassification(
    "affine-vs-linear",
    ["Theta"]
  );
  assert.equal(incomplete.correct, false);
  assert.deepEqual(incomplete.missing, ["O", "Omega"]);
  assert.deepEqual(incomplete.extra, []);

  const excessive = core.checkClassification(
    "n-log-n-vs-square",
    ["O", "Theta", "o"]
  );
  assert.equal(excessive.correct, false);
  assert.deepEqual(excessive.missing, []);
  assert.deepEqual(excessive.extra, ["Theta"]);
  assert.throws(
    () => core.checkClassification("affine-vs-linear", ["O", "O"]),
    /duplicate/
  );
});

test("claim feedback returns a witness or a counterexample without changing truth", () => {
  const correct = core.checkClaim("n-log-n-vs-square", "o", true);
  assert.equal(correct.correct, true);
  assert.equal(correct.holds, true);
  assert.equal(correct.evidence.witness.limit, "0");

  const falseUpperBound = core.checkClaim(
    "exponential-vs-polynomial",
    "O",
    true
  );
  assert.equal(falseUpperBound.correct, false);
  assert.equal(falseUpperBound.holds, false);
  assert.equal(
    falseUpperBound.evidence.counterexample.kind,
    "arbitrarily-large-ratio"
  );

  const subsequence = core.relationResult(
    "oscillating-spikes",
    "omega"
  );
  assert.equal(subsequence.holds, false);
  assert.equal(subsequence.evidence.counterexample.sequence, "n=2k");
  assert.throws(
    () => core.checkClaim("affine-vs-linear", "O", "yes"),
    /boolean/
  );
});

test("recorded constant witnesses agree with exact integer inequalities", () => {
  for (let n = 1n; n <= 1000n; n += 1n) {
    const affine = 2n * n + 7n;
    assert.ok(2n * n <= affine);
    assert.ok(affine <= 9n * n);

    const boundedOscillation = n % 2n === 0n ? n : 3n * n;
    assert.ok(n <= boundedOscillation);
    assert.ok(boundedOscillation <= 3n * n);
  }

  assert.ok((1n << 60n) >= 60n ** 10n);
  assert.ok(2n * 60n ** 10n > 61n ** 10n);
  const witness = core.relationResult(
    "exponential-vs-polynomial",
    "Omega"
  ).evidence.witness;
  assert.equal(witness.c, "1");
  assert.equal(witness.n0, "60");
});

test("finite plots are explicitly illustrations and never proof objects", () => {
  const sample = core.sampleScenario("affine-vs-linear", {
    minimumPower: 0,
    maximumPower: 40,
    count: 21,
  });
  assert.equal(sample.kind, "finite-illustration");
  assert.equal(sample.proves, false);
  assert.match(sample.warning, /не доказывает/);
  assert.equal(sample.xScale, "log2");
  assert.equal(sample.yScale, "log10");
  assert.equal(sample.points.length, 21);

  let previousX = -1;
  sample.points.forEach((point) => {
    assert.equal(typeof point.n, "bigint");
    for (const value of [
      point.log10N,
      point.log10F,
      point.log10G,
      point.log10Ratio,
      point.xShare,
      point.fShare,
      point.gShare,
    ]) {
      assert.equal(Number.isFinite(value), true);
    }
    assert.ok(point.xShare >= 0 && point.xShare <= 1);
    assert.ok(point.fShare >= 0 && point.fShare <= 1);
    assert.ok(point.gShare >= 0 && point.gShare <= 1);
    assert.ok(point.xShare > previousX);
    previousX = point.xShare;
  });
});

test("a finite prefix may look opposite to the analytical asymptotic answer", () => {
  const early = core.sampleScenario("exponential-vs-polynomial", {
    minimumPower: 1,
    maximumPower: 3,
    count: 3,
  });
  assert.deepEqual(
    early.points.map(({ n }) => n),
    [2n, 4n, 8n]
  );
  assert.ok(early.points.every((point) => point.log10F < point.log10G));

  assert.equal(
    core.relationResult("exponential-vs-polynomial", "omega").holds,
    true
  );
  assert.equal(
    core.relationResult("exponential-vs-polynomial", "O").holds,
    false
  );
});

test("finite illustrations retain both branches of oscillating scenarios", () => {
  const spikes = core.sampleScenario("oscillating-spikes", {
    minimumPower: 0,
    maximumPower: 4,
    count: 3,
  });
  const paired = spikes.points.filter(({ power }) => power === 4);
  assert.deepEqual(
    paired.map(({ branch, n }) => [branch, n]),
    [["even", 16n], ["odd", 17n]]
  );
  assert.equal(paired[0].log10Ratio, 0);
  assert.ok(paired[1].log10Ratio > 1);

  const bounded = core.sampleScenario("bounded-oscillation", {
    minimumPower: 1,
    maximumPower: 3,
    count: 3,
  });
  const evenRatios = bounded.points
    .filter(({ branch }) => branch === "even")
    .map(({ log10Ratio }) => log10Ratio);
  const oddRatios = bounded.points
    .filter(({ branch }) => branch === "odd")
    .map(({ log10Ratio }) => log10Ratio);
  assert.ok(evenRatios.every((ratio) => Math.abs(ratio) < 1e-12));
  assert.ok(oddRatios.every((ratio) =>
    Math.abs(ratio - Math.log10(3)) < 1e-12
  ));
});

test("log-scale sampling remains finite close to the BigInt safety boundary", () => {
  const sample = core.sampleScenario("exponential-vs-polynomial", {
    minimumPower: 992,
    maximumPower: core.MAX_SAMPLE_POWER,
    count: 5,
  });
  assert.equal(sample.points.length, 5);
  assert.equal(
    sample.points.at(-1).n,
    1n << BigInt(core.MAX_SAMPLE_POWER)
  );
  assert.ok(sample.points.at(-1).n.toString().length >= 299);
  sample.points.forEach((point) => {
    assert.equal(Number.isFinite(point.log10F), true);
    assert.equal(Number.isFinite(point.log10G), true);
    assert.equal(Number.isFinite(point.log10Ratio), true);
    assert.equal(Number.isFinite(point.fShare), true);
    assert.equal(Number.isFinite(point.gShare), true);
  });
  assert.throws(
    () => core.sampleScenario("affine-vs-linear", {
      minimumPower: 0,
      maximumPower: core.MAX_SAMPLE_POWER + 1,
      count: 2,
    }),
    /sample powers/
  );
});

test("sampling validates domains, unique points and bounded work", () => {
  assert.throws(
    () => core.sampleScenario("n-log-n-vs-square", {
      minimumPower: 0,
      maximumPower: 10,
      count: 5,
    }),
    /outside the scenario domain/
  );
  assert.throws(
    () => core.sampleScenario("affine-vs-linear", {
      minimumPower: 0,
      maximumPower: 2,
      count: 4,
    }),
    /too short/
  );
  assert.throws(
    () => core.sampleScenario("affine-vs-linear", {
      minimumPower: 0,
      maximumPower: 100,
      count: core.MAX_SAMPLE_COUNT + 1,
    }),
    /sample count/
  );
  assert.throws(() => core.log10BigInt(0n), /positive BigInt/);
  assert.throws(() => core.relationResult("affine-vs-linear", "≈"), /unknown/);
});

test("user witnesses are checked against the whole analytic tail", () => {
  const polynomial = core.checkWitness(
    "quadratic-polynomial-vs-square",
    "Theta",
    15,
    1
  );
  assert.equal(polynomial.relationHolds, true);
  assert.equal(polynomial.witnessValid, true);
  assert.equal(polynomial.basis, "analytic");

  const tooNarrow = core.checkWitness(
    "quadratic-polynomial-vs-square",
    "O",
    3,
    1000
  );
  assert.equal(tooNarrow.relationHolds, true);
  assert.equal(tooNarrow.witnessValid, false);

  const falseClaim = core.checkWitness("square-vs-linear", "O", 1000, 1);
  assert.equal(falseClaim.relationHolds, false);
  assert.equal(falseClaim.witnessValid, false);

  const littleO = core.checkWitness("linear-vs-square", "o", 0.01, 101);
  assert.equal(littleO.relationHolds, true);
  assert.equal(littleO.witnessValid, true);
});

test("logarithmic comparisons never certify constants beyond exact boundaries", () => {
  const exactUpper = core.checkWitness("affine-vs-linear", "O", 9, 1);
  assert.equal(exactUpper.witnessValid, true);

  const belowUpper = core.checkWitness(
    "affine-vs-linear",
    "O",
    9 - 1e-11,
    1
  );
  assert.equal(belowUpper.relationHolds, true);
  assert.equal(belowUpper.selectedTailValid, false);
  assert.equal(belowUpper.witnessValid, false);
  assert.equal(
    core.evaluatePoint("affine-vs-linear", 1, 9 - 1e-11, "O").satisfies,
    false
  );

  const exactLower = core.checkWitness("square-vs-linear", "Omega", 1, 1);
  assert.equal(exactLower.witnessValid, true);

  const aboveLower = core.checkWitness(
    "square-vs-linear",
    "Omega",
    1 + 1e-11,
    1
  );
  assert.equal(aboveLower.selectedTailValid, false);
  assert.equal(aboveLower.witnessValid, false);
  assert.equal(
    core.evaluatePoint("square-vs-linear", 1, 1 + 1e-11, "Omega").satisfies,
    false
  );
});

test("witness feedback exposes the selected tail bound and its derivation", () => {
  const affine = core.checkWitness("affine-vs-linear", "O", 5, 3);
  assert.equal(affine.witnessValid, true);
  assert.equal(affine.tailBounds.exact, true);
  assert.ok(affine.tailBounds.upperLog10 < Math.log10(5));
  assert.match(affine.steps.join(" "), /sup f\(n\)\/g\(n\).*5/);
  assert.match(affine.steps.join(" "), /4,333/);

  const exponential = core.checkWitness(
    "exponential-vs-polynomial",
    "Omega",
    1,
    60
  );
  assert.equal(exponential.witnessValid, true);
  assert.match(exponential.steps.join(" "), /Следующее отношение/);

  const littleO = core.checkWitness("linear-vs-square", "o", 0.01, 101);
  assert.match(littleO.steps.join(" "), /Для каждого c>0/);
});

test("linear and logarithmic windows stay finite and never become proofs", () => {
  for (const scale of ["linear", "log"]) {
    const sample = core.sampleWindow("exponential-vs-cubic", {
      maximumN: 1000000,
      count: 64,
      constant: 1,
      n0: 10,
      relationId: "omega",
      scale,
    });
    assert.equal(sample.scale, scale);
    assert.equal(sample.proves, false);
    assert.match(sample.warning, /не доказывает/);
    assert.ok(sample.points.length >= 2);
    sample.points.forEach((point) => {
      for (const value of [
        point.xShare,
        point.fShare,
        point.gShare,
        point.boundShare,
        point.log10F,
        point.log10G,
        point.log10Bound,
      ]) {
        assert.equal(Number.isFinite(value), true);
      }
    });
  }
});

test("counterexample mode finds concrete violations without finite-proof leakage", () => {
  const square = core.findCounterexample("square-vs-linear", "O", 1, 1);
  assert.equal(square.found, true);
  assert.equal(square.relationHolds, false);
  assert.equal(square.subject, "selected-witness");
  assert.equal(square.selectedTailValid, false);
  assert.equal(square.point.satisfies, false);
  assert.ok(square.n >= 1);
  assert.ok(square.analyticRefutation);

  const exponential = core.findCounterexample(
    "exponential-vs-cubic",
    "O",
    1,
    2
  );
  assert.equal(exponential.found, true);
  assert.equal(exponential.point.satisfies, false);

  const trueRelation = core.findCounterexample(
    "linear-vs-square",
    "O",
    1,
    1
  );
  assert.equal(trueRelation.found, false);
  assert.equal(trueRelation.relationHolds, true);
  assert.equal(trueRelation.witnessValid, true);
  assert.equal(trueRelation.selectedTailValid, true);
  assert.equal(trueRelation.analyticRefutation, null);
});

test("counterexample search separates a bad witness from a false relation", () => {
  const badUpperWitness = core.findCounterexample(
    "quadratic-polynomial-vs-square",
    "O",
    3,
    1
  );
  assert.equal(badUpperWitness.found, true);
  assert.equal(badUpperWitness.relationHolds, true);
  assert.equal(badUpperWitness.witnessValid, false);
  assert.equal(badUpperWitness.subject, "selected-witness");
  assert.equal(badUpperWitness.n, 1);
  assert.equal(badUpperWitness.point.satisfies, false);
  assert.equal(badUpperWitness.analyticRefutation, null);
  assert.match(badUpperWitness.reason, /не опровергает само/);

  const badLittleOWitness = core.findCounterexample(
    "linear-vs-square",
    "o",
    0.01,
    1
  );
  assert.equal(badLittleOWitness.found, true);
  assert.equal(badLittleOWitness.relationHolds, true);
  assert.equal(badLittleOWitness.point.satisfies, false);
});

test("a benign little-o constant does not hide the analytic refutation", () => {
  const witness = core.checkWitness("affine-vs-linear", "o", 100, 1);
  assert.equal(witness.relationHolds, false);
  assert.equal(witness.selectedTailValid, true);
  assert.equal(witness.witnessValid, false);
  assert.match(witness.steps.join(" "), /для каждого c>0/i);

  const result = core.findCounterexample(
    "affine-vs-linear",
    "o",
    100,
    1
  );
  assert.equal(result.found, false);
  assert.equal(result.relationHolds, false);
  assert.equal(result.selectedTailValid, true);
  assert.equal(result.selectedConstantBenign, true);
  assert.equal(result.subject, "relation");
  assert.ok(result.analyticRefutation);
  assert.match(result.reason, /для каждого c>0/);
});

test("point evaluation handles oscillation and large exponents without overflow", () => {
  const even = core.evaluatePoint("oscillating-spikes", 100, 2, "omega");
  const odd = core.evaluatePoint("oscillating-spikes", 101, 2, "omega");
  assert.equal(even.satisfies, false);
  assert.equal(odd.satisfies, true);

  const huge = core.evaluatePoint(
    "exponential-vs-cubic",
    core.MAX_WINDOW_N,
    1,
    "Omega"
  );
  assert.equal(Number.isFinite(huge.log10F), true);
  assert.match(huge.fLabel, /10\^/);
});
