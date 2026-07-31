(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasLabControlsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MIN_SPEED_LEVEL = 1;
  const MAX_SPEED_LEVEL = 5;
  const SPEEDS_PER_SECOND = Object.freeze([0.5, 1, 2, 4, 8]);

  function parseSpeedLevel(rawLevel) {
    const level = Number(rawLevel);
    if (!Number.isInteger(level) ||
        level < MIN_SPEED_LEVEL ||
        level > MAX_SPEED_LEVEL) {
      throw new RangeError(
        "speed level must be between " + MIN_SPEED_LEVEL +
        " and " + MAX_SPEED_LEVEL
      );
    }
    return level;
  }

  function formatStepsPerSecond(rate) {
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError("rate must be a positive finite number");
    }
    const formatted = Number.isInteger(value)
      ? String(value)
      : String(value).replace(".", ",");
    if (value === 1) {
      return formatted + " шаг/с";
    }
    if (!Number.isInteger(value)) {
      return formatted + " шага/с";
    }
    if (value >= 2 && value <= 4 && Number.isInteger(value)) {
      return formatted + " шага/с";
    }
    return formatted + " шагов/с";
  }

  function speedModel(rawLevel) {
    const level = parseSpeedLevel(rawLevel);
    const stepsPerSecond = SPEEDS_PER_SECOND[level - 1];
    return Object.freeze({
      level: level,
      stepsPerSecond: stepsPerSecond,
      delayMs: Math.round(1000 / stepsPerSecond),
      label: formatStepsPerSecond(stepsPerSecond),
    });
  }

  function motionDurationMs(rawLevel, reducedMotion) {
    const delay = speedModel(rawLevel).delayMs;
    if (reducedMotion) {
      return 0;
    }
    return Math.min(360, Math.round(delay * 0.55));
  }

  return {
    MIN_SPEED_LEVEL: MIN_SPEED_LEVEL,
    MAX_SPEED_LEVEL: MAX_SPEED_LEVEL,
    SPEEDS_PER_SECOND: SPEEDS_PER_SECOND,
    parseSpeedLevel: parseSpeedLevel,
    formatStepsPerSecond: formatStepsPerSecond,
    speedModel: speedModel,
    motionDurationMs: motionDurationMs,
  };
});
