(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PolynomialEfficiencyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_N = 1000000000;
  const DEFINITIONS = [
    { id: "n-log-n", label: "n log₂n", memoryPerItem: 16, log: function (n) { return n === 1 ? -Infinity : Math.log10(n) + Math.log10(Math.log2(n)); } },
    { id: "quadratic", label: "n²", memoryPerItem: 8, log: function (n) { return 2 * Math.log10(n); } },
    { id: "cube", label: "n³", memoryPerItem: 8, log: function (n) { return 3 * Math.log10(n); } },
    { id: "exponential", label: "2ⁿ", memoryPerItem: 4, log: function (n) { return n * Math.log10(2); } },
  ];
  const BY_ID = new Map(DEFINITIONS.map(function (entry) { return [entry.id, entry]; }));
  const ALGORITHMS = Object.freeze(DEFINITIONS.map(function (entry) { return Object.freeze({ id: entry.id, label: entry.label }); }));

  function algorithm(id) {
    const result = BY_ID.get(String(id));
    if (!result) throw new RangeError("unknown efficiency algorithm: " + id);
    return result;
  }

  function positiveConstant(rawValue, label) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw new RangeError((label || "constant") + " must be positive and finite");
    return value;
  }

  function logTheoretical(id, n, constant) {
    const input = shared.boundedInteger(n, "n", 1, MAX_N);
    return algorithm(id).log(input) + Math.log10(positiveConstant(constant, "constant"));
  }

  function logExperimental(id, n, constant, options) {
    const current = algorithm(id);
    const settings = options || {};
    const cacheItems = shared.boundedInteger(settings.cacheItems === undefined ? 4096 : settings.cacheItems, "cacheItems", 1, MAX_N);
    const memoryPenalty = positiveConstant(settings.memoryPenalty === undefined ? 1.8 : settings.memoryPenalty, "memoryPenalty");
    const vectorFactor = positiveConstant(settings.vectorFactor === undefined ? 1 : settings.vectorFactor, "vectorFactor");
    const workingSet = n * current.memoryPerItem;
    const cacheBytes = cacheItems * 8;
    const penalty = workingSet <= cacheBytes
      ? 1
      : 1 + memoryPenalty * Math.log2(workingSet / cacheBytes + 1);
    return logTheoretical(id, n, constant) + Math.log10(penalty / vectorFactor);
  }

  function findCrossing(points, leftKey, rightKey) {
    let previous = null;
    const crossings = [];
    points.forEach(function (point) {
      const difference = point[leftKey] - point[rightKey];
      if (Number.isFinite(difference)) {
        if (difference === 0) crossings.push({ n: point.n, exact: true });
        else if (previous && Math.sign(previous.difference) !== Math.sign(difference)) {
          crossings.push({ n: Math.round(Math.sqrt(previous.n * point.n)), exact: false, bracket: [previous.n, point.n] });
        }
        previous = { n: point.n, difference: difference };
      }
    });
    return crossings[0] || null;
  }

  function sampleComparison(rawOptions) {
    const options = rawOptions || {};
    const leftId = options.leftId || "quadratic";
    const rightId = options.rightId || "n-log-n";
    algorithm(leftId); algorithm(rightId);
    if (leftId === rightId) throw new Error("choose two different algorithms");
    const minimumN = shared.boundedInteger(options.minimumN === undefined ? 1 : options.minimumN, "minimumN", 1, MAX_N);
    const maximumN = shared.boundedInteger(options.maximumN === undefined ? 1000000 : options.maximumN, "maximumN", minimumN, MAX_N);
    const leftConstant = positiveConstant(options.leftConstant === undefined ? 1 : options.leftConstant, "leftConstant");
    const rightConstant = positiveConstant(options.rightConstant === undefined ? 40 : options.rightConstant, "rightConstant");
    const requestedScale = options.scale === undefined ? "log" : options.scale;
    if (!["linear", "log"].includes(requestedScale)) {
      throw new RangeError("scale must be linear or log");
    }
    const scale = requestedScale;
    const ns = shared.sampleIntegers(minimumN, maximumN, 72, scale === "log");
    const points = ns.map(function (n) {
      return {
        n: n,
        leftTheory: logTheoretical(leftId, n, leftConstant),
        rightTheory: logTheoretical(rightId, n, rightConstant),
        leftExperiment: logExperimental(leftId, n, leftConstant, options),
        rightExperiment: logExperimental(rightId, n, rightConstant, options),
      };
    });
    const allLogs = points.flatMap(function (point) { return [point.leftTheory, point.rightTheory, point.leftExperiment, point.rightExperiment]; }).filter(Number.isFinite);
    const minimumLog = Math.min.apply(null, allLogs);
    const maximumLog = Math.max.apply(null, allLogs);
    const logMinN = Math.log10(minimumN);
    const logMaxN = Math.log10(maximumN);
    function xShare(n) { return scale === "log" ? shared.normalizedShare(Math.log10(n), logMinN, logMaxN) : shared.normalizedShare(n, minimumN, maximumN); }
    function yShare(value) { return scale === "log" ? shared.normalizedShare(value, minimumLog, maximumLog) : shared.clamp(Math.pow(10, value - maximumLog), 0, 1); }
    const theoryCrossing = findCrossing(points, "leftTheory", "rightTheory");
    const experimentCrossing = findCrossing(points, "leftExperiment", "rightExperiment");
    return shared.deepFreeze({
      kind: "experimental-model",
      proves: false,
      warning: "Сплошные линии — детерминированная модель наблюдаемой стоимости, а не измерение реального процессора.",
      left: { id: leftId, label: algorithm(leftId).label, constant: leftConstant },
      right: { id: rightId, label: algorithm(rightId).label, constant: rightConstant },
      minimumN: minimumN, maximumN: maximumN, scale: scale,
      cacheItems: shared.boundedInteger(options.cacheItems === undefined ? 4096 : options.cacheItems, "cacheItems", 1, MAX_N),
      points: points.map(function (point) { return Object.freeze(Object.assign({}, point, {
        xShare: xShare(point.n), leftTheoryShare: yShare(point.leftTheory), rightTheoryShare: yShare(point.rightTheory),
        leftExperimentShare: yShare(point.leftExperiment), rightExperimentShare: yShare(point.rightExperiment),
      })); }),
      theoryCrossing: theoryCrossing,
      experimentCrossing: experimentCrossing,
      minimumLog: minimumLog,
      maximumLog: maximumLog,
    });
  }

  function createState(options) { return Object.freeze({ model: sampleComparison(options), pointIndex: 0 }); }
  function step(state) { return Object.freeze({ model: state.model, pointIndex: Math.min(state.model.points.length - 1, state.pointIndex + 1) }); }
  function isFinished(state) { return state.pointIndex >= state.model.points.length - 1; }

  return {
    MAX_N: MAX_N,
    ALGORITHMS: ALGORITHMS,
    logTheoretical: logTheoretical,
    logExperimental: logExperimental,
    findCrossing: findCrossing,
    sampleComparison: sampleComparison,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
