const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/random-variables-concentration-core.js");

test("seeded Bernoulli simulation is reproducible and conserves sample count", () => {
  const options = { variables: 20, probabilityPermille: 350, maxTrials: 500, batchSize: 100, seed: 42 };
  let left = core.createState(options);
  let right = core.createState(options);
  for (let index = 0; index < 5; index += 1) {
    left = core.step(left);
    right = core.step(right);
  }
  assert.deepEqual(left, right);
  assert.equal(left.finished, true);
  assert.equal(left.histogram.reduce((sum, count) => sum + count, 0), 500);
});

test("binomial masses include the deterministic endpoints", () => {
  assert.deepEqual(core.binomialMasses(4, 0), [1, 0, 0, 0, 0]);
  assert.deepEqual(core.binomialMasses(4, 1), [0, 0, 0, 0, 1]);
  const masses = core.binomialMasses(50, 0.3);
  assert.ok(Math.abs(masses.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(masses.every((value) => Number.isFinite(value) && value >= 0));
  const extreme = core.binomialMasses(200, 0.999);
  assert.ok(Math.abs(extreme.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(extreme.every((value) => Number.isFinite(value) && value >= 0));
  assert.ok(extreme[200] > extreme[0]);
});

test("the visual model never presents finite simulation as proof", () => {
  const state = core.step(core.createState({ variables: 40, maxTrials: 100, batchSize: 100, seed: 7 }));
  const model = core.visualModel(state);
  assert.equal(model.kind, "simulation");
  assert.equal(model.proves, false);
  assert.match(model.warning, /не доказывает/);
  assert.equal(model.bars.length, 41);
  assert.ok(model.bars.every(({ heightShare, theoryShare }) =>
    Number.isFinite(heightShare) && heightShare >= 0 && heightShare <= 1 &&
    Number.isFinite(theoryShare) && theoryShare >= 0 && theoryShare <= 1
  ));
});

test("concentration bounds handle zero thresholds and boundary probabilities", () => {
  const zeroThreshold = core.tailBounds(core.validateOptions({ variables: 10, probabilityPermille: 0, threshold: 0 }));
  assert.equal(zeroThreshold.chebyshev, 1);
  assert.equal(zeroThreshold.hoeffding, 1);
  assert.equal(zeroThreshold.markov, 1);
  assert.equal(zeroThreshold.markovEvent, "upper-tail");
  const certain = core.tailBounds(core.validateOptions({ variables: 10, probabilityPermille: 1000, threshold: 2 }));
  assert.equal(certain.variance, 0);
  assert.equal(certain.chebyshev, 0);
  assert.throws(() => core.createState({ variables: core.MAX_VARIABLES + 1 }), /от 1/);
  assert.throws(() => core.createState({ maxTrials: core.MAX_TRIALS + 1 }), /от 1/);
});
