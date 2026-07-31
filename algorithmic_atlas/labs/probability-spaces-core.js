(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProbabilitySpacesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const SCALE = 1000n;

  function probability(rawValue, label) {
    const value = shared.boundedInteger(rawValue, label || "probability", 0, 1000);
    return shared.rational(BigInt(value), SCALE);
  }

  function complement(value) {
    return shared.subtractRational(shared.rational(1n, 1n), value);
  }

  function bayesModel(rawPrior, rawLikelihood, rawFalsePositive) {
    const prior = probability(rawPrior, "P(A)");
    const likelihood = probability(rawLikelihood, "P(B|A)");
    const falsePositive = probability(rawFalsePositive, "P(B|¬A)");
    const notPrior = complement(prior);
    const aAndB = shared.multiplyRational(prior, likelihood);
    const notAAndB = shared.multiplyRational(notPrior, falsePositive);
    const b = shared.addRational(aAndB, notAAndB);
    const posterior = b.numerator === 0n ? null : shared.divideRational(aAndB, b);
    const leaves = [
      { id: "a-b", value: aAndB },
      { id: "a-not-b", value: shared.multiplyRational(prior, complement(likelihood)) },
      { id: "not-a-b", value: notAAndB },
      { id: "not-a-not-b", value: shared.multiplyRational(notPrior, complement(falsePositive)) },
    ];
    const total = leaves.reduce(function (sum, leaf) {
      return shared.addRational(sum, leaf.value);
    }, shared.rational(0n, 1n));
    return shared.deepFreeze({
      prior: prior,
      notPrior: notPrior,
      likelihood: likelihood,
      falsePositive: falsePositive,
      aAndB: aAndB,
      notAAndB: notAAndB,
      b: b,
      posterior: posterior,
      posteriorDefined: posterior !== null,
      leaves: leaves.map(function (leaf) {
        return { id: leaf.id, value: leaf.value, share: shared.rationalToNumber(leaf.value) };
      }),
      total: total,
      exactTotal: total.numerator === total.denominator,
      area: {
        priorShare: shared.rationalToNumber(prior),
        likelihoodShare: shared.rationalToNumber(likelihood),
        falsePositiveShare: shared.rationalToNumber(falsePositive),
        bShare: shared.rationalToNumber(b),
      },
    });
  }

  function createState(prior, likelihood, falsePositive) {
    return Object.freeze({
      model: bayesModel(prior === undefined ? 10 : prior, likelihood === undefined ? 900 : likelihood, falsePositive === undefined ? 80 : falsePositive),
      stage: 0,
    });
  }
  function step(state) { return Object.freeze({ model: state.model, stage: Math.min(4, state.stage + 1) }); }
  function isFinished(state) { return state.stage >= 4; }

  return {
    SCALE: SCALE,
    probability: probability,
    complement: complement,
    bayesModel: bayesModel,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
