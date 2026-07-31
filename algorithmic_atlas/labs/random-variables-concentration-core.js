(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RandomVariablesConcentrationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_VARIABLES = 200;
  const MAX_TRIALS = 100000;
  const DEFAULT_BATCH = 100;

  function validateOptions(rawOptions) {
    const options = rawOptions || {};
    const variables = shared.boundedInteger(options.variables === undefined ? 40 : options.variables, "variables", 1, MAX_VARIABLES);
    const probabilityPermille = shared.boundedInteger(options.probabilityPermille === undefined ? 350 : options.probabilityPermille, "probability", 0, 1000);
    const threshold = shared.boundedInteger(options.threshold === undefined ? 6 : options.threshold, "threshold", 0, variables);
    const maxTrials = shared.boundedInteger(options.maxTrials === undefined ? 5000 : options.maxTrials, "maxTrials", 1, MAX_TRIALS);
    const batchSize = shared.boundedInteger(options.batchSize === undefined ? DEFAULT_BATCH : options.batchSize, "batchSize", 1, 1000);
    return Object.freeze({
      variables: variables,
      probabilityPermille: probabilityPermille,
      probability: probabilityPermille / 1000,
      threshold: threshold,
      maxTrials: maxTrials,
      batchSize: batchSize,
      seed: shared.normalizeSeed(options.seed === undefined ? 20260731 : options.seed),
    });
  }

  function createState(options) {
    const settings = validateOptions(options);
    return Object.freeze({
      settings: settings,
      rngState: settings.seed,
      histogram: Object.freeze(Array.from({ length: settings.variables + 1 }, function () { return 0; })),
      samples: 0,
      finished: false,
    });
  }

  function bernoulliSum(settings, rngState) {
    let state = rngState;
    let sum = 0;
    for (let index = 0; index < settings.variables; index += 1) {
      const random = shared.randomStep(state);
      state = random.state;
      if (random.value < settings.probability) sum += 1;
    }
    return { state: state, sum: sum };
  }

  function step(state) {
    if (state.finished) return state;
    const histogram = state.histogram.slice();
    let rngState = state.rngState;
    const remaining = state.settings.maxTrials - state.samples;
    const amount = Math.min(state.settings.batchSize, remaining);
    for (let trial = 0; trial < amount; trial += 1) {
      const sample = bernoulliSum(state.settings, rngState);
      rngState = sample.state;
      histogram[sample.sum] += 1;
    }
    const samples = state.samples + amount;
    return Object.freeze({
      settings: state.settings,
      rngState: rngState,
      histogram: Object.freeze(histogram),
      samples: samples,
      finished: samples >= state.settings.maxTrials,
    });
  }

  function binomialMasses(variables, probability) {
    const masses = Array.from({ length: variables + 1 }, function () { return 0; });
    if (probability === 0) {
      masses[0] = 1;
      return masses;
    }
    if (probability === 1) {
      masses[variables] = 1;
      return masses;
    }
    const logMasses = Array.from({ length: variables + 1 }, function () { return 0; });
    logMasses[0] = variables * Math.log1p(-probability);
    for (let k = 0; k < variables; k += 1) {
      logMasses[k + 1] = logMasses[k] +
        Math.log(variables - k) - Math.log(k + 1) +
        Math.log(probability) - Math.log1p(-probability);
    }
    const maximumLog = Math.max.apply(null, logMasses);
    logMasses.forEach(function (logMass, index) {
      masses[index] = Math.exp(logMass - maximumLog);
    });
    const total = masses.reduce(function (sum, value) { return sum + value; }, 0);
    return masses.map(function (value) { return value / total; });
  }

  function tailBounds(settings) {
    const mean = settings.variables * settings.probability;
    const variance = settings.variables * settings.probability * (1 - settings.probability);
    const threshold = settings.threshold;
    const chebyshev = threshold === 0 ? 1 : Math.min(1, variance / (threshold * threshold));
    const hoeffding = threshold === 0 ? 1 : Math.min(1, 2 * Math.exp(-2 * threshold * threshold / settings.variables));
    const markovDenominator = mean + threshold;
    const markov = markovDenominator === 0 ? 1 : Math.min(1, mean / markovDenominator);
    const chernoff = mean > 0 && threshold <= mean
      ? Math.min(1, 2 * Math.exp(-(threshold * threshold) / (3 * mean)))
      : null;
    return Object.freeze({
      mean: mean,
      variance: variance,
      standardDeviation: Math.sqrt(variance),
      markov: markov,
      markovEvent: "upper-tail",
      chebyshev: chebyshev,
      hoeffding: hoeffding,
      chernoff: chernoff,
    });
  }

  function visualModel(state) {
    const settings = state.settings;
    const theory = binomialMasses(settings.variables, settings.probability);
    const bounds = tailBounds(settings);
    const lower = bounds.mean - settings.threshold;
    const upper = bounds.mean + settings.threshold;
    const empirical = state.samples === 0
      ? state.histogram.map(function () { return 0; })
      : state.histogram.map(function (value) { return value / state.samples; });
    const maximum = Math.max.apply(null, empirical.concat(theory, [1 / Math.max(1, settings.variables)]));
    let tailSamples = 0;
    state.histogram.forEach(function (count, value) {
      if (value <= lower || value >= upper) tailSamples += count;
    });
    return shared.deepFreeze({
      kind: "simulation",
      proves: false,
      warning: "Конечная симуляция иллюстрирует распределение, но не доказывает неравенства концентрации.",
      samples: state.samples,
      bars: empirical.map(function (share, value) {
        return { value: value, empirical: share, theoretical: theory[value], heightShare: share / maximum, theoryShare: theory[value] / maximum, tail: value <= lower || value >= upper };
      }),
      mean: bounds.mean,
      variance: bounds.variance,
      standardDeviation: bounds.standardDeviation,
      lowerThreshold: lower,
      upperThreshold: upper,
      empiricalTail: state.samples === 0 ? null : tailSamples / state.samples,
      bounds: bounds,
    });
  }

  return {
    MAX_VARIABLES: MAX_VARIABLES,
    MAX_TRIALS: MAX_TRIALS,
    validateOptions: validateOptions,
    createState: createState,
    step: step,
    binomialMasses: binomialMasses,
    tailBounds: tailBounds,
    visualModel: visualModel,
  };
});
