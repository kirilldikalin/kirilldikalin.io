"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/multiplicative-weights-core.js");

function close(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test("normalization produces a probability distribution", () => {
  const probabilities = core.normalizeWeights([1, 2, 3, 4]);
  close(probabilities.reduce((sum, value) => sum + value, 0), 1);
  assert.deepEqual(probabilities, [0.1, 0.2, 0.3, 0.4]);
});

test("one step uses the exponential multiplicative update exactly", () => {
  const eta = 0.5;
  const trace = core.buildTrace({ scenario: "leader", eta, rounds: 6 });
  const frame = trace.frames[1];
  frame.losses.forEach((loss, index) => {
    close(frame.updateFactors[index], Math.exp(-eta * loss));
    close(frame.weights[index], frame.weightsBefore[index] * Math.exp(-eta * loss));
  });
});

test("algorithm round loss is the expectation under the pre-update distribution", () => {
  const frame = core.buildTrace({ scenario: "rotating", eta: 0.7, rounds: 8 }).frames[1];
  const expected = frame.probabilities.reduce((sum, probability, index) => sum + probability * frame.losses[index], 0);
  close(frame.expectedLoss, expected);
  close(frame.cumulativeAlgorithmLoss, expected);
});

test("cumulative expert losses and best expert are exact prefix sums", () => {
  const trace = core.buildTrace({ scenario: "switch", eta: 0.35, rounds: 12 });
  const final = trace.frames.at(-1);
  const sums = [0, 0, 0, 0];
  for (let round = 0; round < 12; round += 1) {
    core.lossVector("switch", round, 12).forEach((loss, index) => { sums[index] += loss; });
  }
  sums.forEach((value, index) => close(final.cumulativeExpertLosses[index], value));
  const minimum = Math.min(...sums);
  close(final.bestExpertLoss, minimum);
  assert.equal(final.bestExpertIndex, sums.indexOf(minimum));
  close(final.regret, final.cumulativeAlgorithmLoss - minimum);
});

test("potential is the sum of expert weights and has the stored log change", () => {
  const trace = core.buildTrace({ scenario: "shocks", eta: 0.9, rounds: 14 });
  for (const frame of trace.frames.slice(1)) {
    close(frame.potential, frame.weights.reduce((sum, weight) => sum + weight, 0));
    close(frame.logPotentialChange, Math.log(frame.potential / frame.potentialBefore));
    assert.ok(frame.logPotentialChange <= frame.hoeffdingUpperChange + 1e-12);
  }
});

test("the displayed regret bound follows ln(N)/eta plus eta*T/8", () => {
  const eta = 0.4;
  const rounds = 20;
  const final = core.buildTrace({ scenario: "leader", eta, rounds }).frames.at(-1);
  close(final.bound, Math.log(4) / eta + eta * rounds / 8);
  assert.ok(final.regret <= final.bound + 1e-12);
});

test("eta materially changes weights while losses remain the same", () => {
  const slow = core.buildTrace({ scenario: "leader", eta: 0.1, rounds: 12 });
  const fast = core.buildTrace({ scenario: "leader", eta: 1.2, rounds: 12 });
  assert.deepEqual(slow.frames.at(-1).cumulativeExpertLosses, fast.frames.at(-1).cumulativeExpertLosses);
  assert.notDeepEqual(slow.frames.at(-1).nextProbabilities, fast.frames.at(-1).nextProbabilities);
});

test("every scenario creates a distinct deterministic loss geometry", () => {
  const signatures = Object.keys(core.SCENARIOS).map((scenario) =>
    JSON.stringify(core.buildTrace({ scenario, eta: 0.45, rounds: 14 }).frames.map((frame) => frame.losses))
  );
  assert.equal(new Set(signatures).size, Object.keys(core.SCENARIOS).length);
  assert.equal(
    JSON.stringify(core.buildTrace({ scenario: "rotating", eta: 0.45, rounds: 14 })),
    JSON.stringify(core.buildTrace({ scenario: "rotating", eta: 0.45, rounds: 14 }))
  );
});

test("state advances one bounded round at a time and then stays finished", () => {
  let state = core.createState({ scenario: "switch", eta: 0.5, rounds: 9 });
  let steps = 0;
  while (!core.isFinished(state)) {
    const before = state.cursor;
    state = core.step(state);
    assert.equal(state.cursor, before + 1);
    assert.ok(++steps <= 9);
  }
  assert.equal(steps, 9);
  assert.equal(core.step(state), state);
});

test("public traces and visual models are deeply immutable", () => {
  const state = core.createState({ scenario: "leader", eta: 0.4, rounds: 8 });
  const model = core.visualModel(core.step(state));
  assert.equal(Object.isFrozen(state.trace.frames[1].weights), true);
  assert.equal(Object.isFrozen(model.history), true);
  assert.throws(() => { model.frame.weights[0] = 99; }, TypeError);
});

test("invalid scenarios, rates, horizons, losses and states are rejected", () => {
  assert.throws(() => core.normalizeOptions({ scenario: "oracle" }), /сценарий/);
  assert.throws(() => core.normalizeOptions({ eta: 0 }), /eta/);
  assert.throws(() => core.normalizeOptions({ eta: 2 }), /eta/);
  assert.throws(() => core.normalizeOptions({ rounds: 5 }), /rounds/);
  assert.throws(() => core.normalizeOptions({ rounds: 41 }), /rounds/);
  assert.throws(() => core.lossVector("leader", 7, 6), /round/);
  assert.throws(() => core.normalizeWeights([1, 2]), /веса/);
  assert.throws(() => core.step({}), /состояние/);
});

test("browser adapter contains no executable expression parser", () => {
  const file = path.join(__dirname, "../labs/multiplicative-weights.js");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});
