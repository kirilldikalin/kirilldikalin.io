const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/growth-rates-core.js");

test("growth functions preserve the expected hierarchy at a large input", () => {
  const n = 1000;
  assert.ok(core.logValue("log", n) < core.logValue("linear", n));
  assert.ok(core.logValue("linear", n) < core.logValue("square", n));
  assert.ok(core.logValue("square", n) < core.logValue("exponential", n));
  assert.ok(core.logValue("factorial", n) < core.logValue("self-power", n));
});

test("a race is bounded, finite and explicitly not a proof", () => {
  for (const yScale of ["linear", "log"]) {
    const race = core.sampleRace(["square", "n-log-n"], {
      maximumN: 1000000,
      xScale: "log",
      yScale,
    });
    assert.equal(race.proves, false);
    assert.ok(race.sampleCount <= 96);
    race.series.flatMap(({ points }) => points).forEach((point) => {
      assert.ok(Number.isFinite(point.xShare));
      assert.ok(Number.isFinite(point.yShare));
      assert.ok(point.xShare >= 0 && point.xShare <= 1);
      assert.ok(point.yShare >= 0 && point.yShare <= 1);
    });
  }
});

test("the practical constants create a visible crossover", () => {
  const found = core.crossings("thousand-linear", "square", 1, 1000000);
  assert.ok(found.some(({ n }) => n >= 900 && n <= 1100));
});

test("duplicate, unknown and out-of-range inputs fail closed", () => {
  assert.throws(() => core.sampleRace(["linear", "linear"], {}), /distinct/);
  assert.throws(() => core.sampleRace(["linear", "unknown"], {}), /unknown/);
  assert.throws(() => core.logValue("linear", 0), /от 1/);
});

test("playback visits every sampled point and then stops", () => {
  let state = core.createState(["linear", "square"], { maximumN: 100 });
  let steps = 0;
  while (!core.isFinished(state)) {
    state = core.step(state);
    steps += 1;
  }
  assert.equal(steps, state.race.series[0].points.length - 1);
});
