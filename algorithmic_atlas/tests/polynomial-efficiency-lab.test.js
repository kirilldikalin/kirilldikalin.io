const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/polynomial-efficiency-core.js");

test("log-space evaluation remains finite at the largest supported input", () => {
  for (const { id } of core.ALGORITHMS) {
    assert.ok(Number.isFinite(core.logTheoretical(id, core.MAX_N, 1)));
    assert.ok(Number.isFinite(core.logExperimental(id, core.MAX_N, 1, {
      cacheItems: 4096,
      memoryPenalty: 1.8,
      vectorFactor: 1,
    })));
  }
});

test("the comparison is a bounded deterministic model, never a benchmark proof", () => {
  for (const scale of ["linear", "log"]) {
    const model = core.sampleComparison({
      leftId: "quadratic",
      rightId: "n-log-n",
      minimumN: 1,
      maximumN: core.MAX_N,
      scale,
    });
    assert.equal(model.kind, "experimental-model");
    assert.equal(model.proves, false);
    assert.match(model.warning, /не измерение/);
    assert.ok(model.points.length <= 72);
    model.points.forEach((point) => {
      for (const key of ["xShare", "leftTheoryShare", "rightTheoryShare", "leftExperimentShare", "rightExperimentShare"]) {
        assert.ok(Number.isFinite(point[key]), key);
        assert.ok(point[key] >= 0 && point[key] <= 1, key);
      }
    });
  }
});

test("cache and practical constants can move the observed crossover", () => {
  const roomy = core.sampleComparison({
    leftId: "quadratic", rightId: "n-log-n", maximumN: 1000000,
    leftConstant: 1, rightConstant: 40, cacheItems: 1000000,
  });
  const tight = core.sampleComparison({
    leftId: "quadratic", rightId: "n-log-n", maximumN: 1000000,
    leftConstant: 1, rightConstant: 40, cacheItems: 64, memoryPenalty: 10,
  });
  assert.ok(roomy.theoryCrossing);
  assert.ok(tight.theoryCrossing);
  assert.equal(roomy.theoryCrossing.n, tight.theoryCrossing.n);
  assert.notDeepEqual(roomy.experimentCrossing, tight.experimentCrossing);
  assert.ok(
    core.logExperimental("quadratic", 100000, 1, { cacheItems: 64, memoryPenalty: 10 }) >
    core.logTheoretical("quadratic", 100000, 1)
  );
});

test("invalid comparisons fail closed and playback reaches the final sample", () => {
  assert.throws(() => core.sampleComparison({ leftId: "quadratic", rightId: "quadratic" }), /different/);
  assert.throws(() => core.sampleComparison({ leftId: "missing", rightId: "quadratic" }), /unknown/);
  assert.throws(() => core.sampleComparison({ leftConstant: 0 }), /positive/);
  assert.throws(() => core.logTheoretical("quadratic", 0, 1), /от 1/);
  assert.throws(() => core.sampleComparison({ scale: "diagonal" }), /scale/);
  let state = core.createState({ maximumN: 10000 });
  while (!core.isFinished(state)) state = core.step(state);
  assert.equal(state.pointIndex, state.model.points.length - 1);
});
