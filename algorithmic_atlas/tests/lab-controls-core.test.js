const test = require("node:test");
const assert = require("node:assert/strict");

const controls = require("../labs/lab-controls-core.js");

test("speed levels run from slower on the left to faster on the right", () => {
  const models = [];
  for (
    let level = controls.MIN_SPEED_LEVEL;
    level <= controls.MAX_SPEED_LEVEL;
    level += 1
  ) {
    models.push(controls.speedModel(level));
  }

  assert.deepEqual(
    models.map(({ stepsPerSecond }) => stepsPerSecond),
    [0.5, 1, 2, 4, 8]
  );
  for (let index = 1; index < models.length; index += 1) {
    assert.ok(
      models[index].stepsPerSecond > models[index - 1].stepsPerSecond
    );
    assert.ok(models[index].delayMs < models[index - 1].delayMs);
  }
  assert.equal(models[0].delayMs, 2000);
  assert.equal(models.at(-1).delayMs, 125);
});

test("speed labels expose speed rather than the inverse delay", () => {
  assert.equal(controls.speedModel(1).label, "0,5 шага/с");
  assert.equal(controls.speedModel(2).label, "1 шаг/с");
  assert.equal(controls.speedModel(3).label, "2 шага/с");
  assert.equal(controls.speedModel(5).label, "8 шагов/с");
});

test("invalid speed levels fail closed", () => {
  for (const value of [0, 6, 1.5, "", null, undefined, "fast"]) {
    assert.throws(() => controls.speedModel(value), /speed level/);
  }
  assert.equal(controls.speedModel("4").stepsPerSecond, 4);
});

test("reduced motion disables interpolation without changing playback speed", () => {
  assert.equal(controls.motionDurationMs(3, true), 0);
  assert.ok(controls.motionDurationMs(3, false) > 0);
  assert.equal(controls.speedModel(3).delayMs, 500);
  assert.throws(() => controls.motionDurationMs(0, true), /speed level/);
});
