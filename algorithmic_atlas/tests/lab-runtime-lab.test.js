const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controls = require("../labs/lab-controls-core.js");
const shared = require("../labs/mathematical-tools-core.js");
const runtimeSource = fs.readFileSync(
  path.join(__dirname, "../labs/lab-runtime.js"),
  "utf8"
);

test("the shared speed contract always gets faster from left to right", () => {
  const speeds = [1, 2, 3, 4, 5].map(controls.speedModel);
  assert.deepEqual(speeds.map(({ stepsPerSecond }) => stepsPerSecond), [0.5, 1, 2, 4, 8]);
  assert.ok(speeds.every((item, index) => index === 0 || item.delayMs < speeds[index - 1].delayMs));
});

test("runtime owns one shared step, run, pause and reset transport", () => {
  for (const action of ["step", "run", "pause", "reset"]) {
    assert.match(runtimeSource, new RegExp('button\\("' + action + '"'));
  }
  assert.match(runtimeSource, /input\.min = "1"/);
  assert.match(runtimeSource, /input\.max = "5"/);
  assert.match(runtimeSource, /prefers-reduced-motion: reduce/);
  assert.match(runtimeSource, /visibilitychange/);
  assert.match(runtimeSource, /maxAutomaticSteps/);
  assert.doesNotMatch(runtimeSource, /while\s*\(/);
});

test("shared rationals and seeded random steps are exact and reproducible", () => {
  const oneThird = shared.rational(2n, 6n);
  assert.deepEqual(oneThird, { numerator: 1n, denominator: 3n });
  assert.deepEqual(
    shared.addRational(oneThird, shared.rational(1n, 6n)),
    { numerator: 1n, denominator: 2n }
  );
  assert.deepEqual(shared.randomStep(42), shared.randomStep(42));
  assert.notEqual(shared.randomStep(42).state, 42);
  assert.throws(() => shared.rational(1n, 0n), /denominator/);
});
