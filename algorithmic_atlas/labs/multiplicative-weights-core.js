(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MultiplicativeWeightsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  const EXPERTS = deepFreeze([
    { id: "steady", label: "Осторожный" },
    { id: "trend", label: "Следующий тренду" },
    { id: "contrarian", label: "Контртренд" },
    { id: "seasonal", label: "Сезонный" },
  ]);

  const SCENARIOS = deepFreeze({
    leader: {
      title: "Один устойчивый лидер",
      description: "Осторожный эксперт почти всегда несёт малый проигрыш, остальные ошибаются чаще",
    },
    switch: {
      title: "Смена режима",
      description: "В первой половине силён тренд, во второй — контртренд",
    },
    rotating: {
      title: "Победитель меняется",
      description: "Нулевая потеря циклически переходит между четырьмя экспертами",
    },
    shocks: {
      title: "Редкие шоки",
      description: "Стабильные советы прерываются раундами с противоположным исходом",
    },
  });

  function finiteNumber(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new RangeError(label + ": требуется число от " + minimum + " до " + maximum);
    }
    return number;
  }

  function boundedInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(label + ": требуется целое число от " + minimum + " до " + maximum);
    }
    return number;
  }

  function normalizeOptions(rawOptions) {
    const options = rawOptions || {};
    const scenario = options.scenario || "leader";
    if (!SCENARIOS[scenario]) throw new RangeError("Неизвестный сценарий проигрышей");
    return deepFreeze({
      scenario: scenario,
      eta: finiteNumber(options.eta === undefined ? 0.45 : options.eta, "eta", 0.05, 1.5),
      rounds: boundedInteger(options.rounds === undefined ? 20 : options.rounds, "rounds", 6, 40),
    });
  }

  function clampLoss(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError("Проигрыш эксперта должен лежать в [0,1]");
    }
    return value;
  }

  function lossVector(scenario, round, rounds) {
    if (!SCENARIOS[scenario]) throw new RangeError("Неизвестный сценарий проигрышей");
    boundedInteger(round, "round", 0, rounds - 1);
    boundedInteger(rounds, "rounds", 1, 1000);
    let losses;
    if (scenario === "leader") {
      const pulse = round % 5;
      losses = [0.12 + 0.04 * (pulse === 4 ? 1 : 0), 0.38 + 0.16 * (round % 3 === 0 ? 1 : 0), 0.26 + 0.32 * (round % 2), 0.48 - 0.18 * (pulse === 2 ? 1 : 0)];
    } else if (scenario === "switch") {
      const firstHalf = round < Math.ceil(rounds / 2);
      losses = firstHalf ? [0.34, 0.06, 0.78, 0.44] : [0.36, 0.82, 0.05, 0.42];
    } else if (scenario === "rotating") {
      const winner = round % EXPERTS.length;
      losses = EXPERTS.map(function (_, index) {
        const distance = (index - winner + EXPERTS.length) % EXPERTS.length;
        return [0.04, 0.28, 0.58, 0.82][distance];
      });
    } else {
      const shock = round % 7 === 6;
      losses = shock ? [0.94, 0.08, 0.22, 0.62] : [0.16, 0.42, 0.58, 0.34];
    }
    return deepFreeze(losses.map(clampLoss));
  }

  function normalizeWeights(weights) {
    if (!Array.isArray(weights) || weights.length !== EXPERTS.length) {
      throw new RangeError("Требуются веса всех экспертов");
    }
    const total = weights.reduce(function (sum, weight) {
      if (!Number.isFinite(weight) || weight <= 0) throw new RangeError("Вес должен быть положительным и конечным");
      return sum + weight;
    }, 0);
    return deepFreeze(weights.map(function (weight) { return weight / total; }));
  }

  function dot(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      throw new RangeError("Векторы должны иметь одинаковую длину");
    }
    return left.reduce(function (sum, value, index) { return sum + value * right[index]; }, 0);
  }

  function bestExpert(cumulativeLosses) {
    let index = 0;
    for (let candidate = 1; candidate < cumulativeLosses.length; candidate += 1) {
      if (cumulativeLosses[candidate] < cumulativeLosses[index]) index = candidate;
    }
    return { index: index, loss: cumulativeLosses[index] };
  }

  function regretBound(eta, rounds, expertCount) {
    return Math.log(expertCount) / eta + eta * rounds / 8;
  }

  function buildTrace(rawOptions) {
    const options = normalizeOptions(rawOptions);
    let weights = EXPERTS.map(function () { return 1; });
    let cumulativeExpertLosses = EXPERTS.map(function () { return 0; });
    let cumulativeAlgorithmLoss = 0;
    const frames = [deepFreeze({
      round: 0,
      losses: null,
      probabilities: normalizeWeights(weights),
      nextProbabilities: normalizeWeights(weights),
      weightsBefore: weights.slice(),
      weights: weights.slice(),
      updateFactors: EXPERTS.map(function () { return 1; }),
      expectedLoss: 0,
      cumulativeAlgorithmLoss: 0,
      cumulativeExpertLosses: cumulativeExpertLosses.slice(),
      bestExpertIndex: 0,
      bestExpertLoss: 0,
      regret: 0,
      potentialBefore: EXPERTS.length,
      potential: EXPERTS.length,
      logPotentialChange: 0,
      hoeffdingUpperChange: 0,
      bound: regretBound(options.eta, 0, EXPERTS.length),
    })];

    for (let round = 0; round < options.rounds; round += 1) {
      const losses = lossVector(options.scenario, round, options.rounds);
      const weightsBefore = weights.slice();
      const probabilities = normalizeWeights(weightsBefore);
      const expectedLoss = dot(probabilities, losses);
      const potentialBefore = weightsBefore.reduce(function (sum, value) { return sum + value; }, 0);
      const updateFactors = losses.map(function (loss) { return Math.exp(-options.eta * loss); });
      weights = weightsBefore.map(function (weight, index) { return weight * updateFactors[index]; });
      const potential = weights.reduce(function (sum, value) { return sum + value; }, 0);
      cumulativeExpertLosses = cumulativeExpertLosses.map(function (value, index) { return value + losses[index]; });
      cumulativeAlgorithmLoss += expectedLoss;
      const best = bestExpert(cumulativeExpertLosses);
      frames.push(deepFreeze({
        round: round + 1,
        losses: losses.slice(),
        probabilities: probabilities.slice(),
        nextProbabilities: normalizeWeights(weights),
        weightsBefore: weightsBefore,
        weights: weights.slice(),
        updateFactors: updateFactors,
        expectedLoss: expectedLoss,
        cumulativeAlgorithmLoss: cumulativeAlgorithmLoss,
        cumulativeExpertLosses: cumulativeExpertLosses.slice(),
        bestExpertIndex: best.index,
        bestExpertLoss: best.loss,
        regret: cumulativeAlgorithmLoss - best.loss,
        potentialBefore: potentialBefore,
        potential: potential,
        logPotentialChange: Math.log(potential / potentialBefore),
        hoeffdingUpperChange: -options.eta * expectedLoss + options.eta * options.eta / 8,
        bound: regretBound(options.eta, round + 1, EXPERTS.length),
      }));
    }
    return deepFreeze({ options: options, experts: EXPERTS, frames: frames });
  }

  function createState(options) {
    return deepFreeze({ trace: buildTrace(options), cursor: 0, finished: false });
  }

  function validState(state) {
    return state && state.trace && Array.isArray(state.trace.frames) && Number.isSafeInteger(state.cursor) && state.trace.frames[state.cursor];
  }

  function step(state) {
    if (!validState(state)) throw new TypeError("Некорректное состояние лаборатории мультипликативных весов");
    if (state.cursor >= state.trace.frames.length - 1) return state;
    const cursor = state.cursor + 1;
    return deepFreeze({ trace: state.trace, cursor: cursor, finished: cursor === state.trace.frames.length - 1 });
  }

  function isFinished(state) {
    if (!validState(state)) throw new TypeError("Некорректное состояние лаборатории мультипликативных весов");
    return state.cursor >= state.trace.frames.length - 1;
  }

  function visualModel(state) {
    if (!validState(state)) throw new TypeError("Некорректное состояние визуализации");
    const frame = state.trace.frames[state.cursor];
    return deepFreeze({
      options: state.trace.options,
      experts: state.trace.experts,
      frame: frame,
      history: state.trace.frames.slice(0, state.cursor + 1).map(function (item) {
        return {
          round: item.round,
          algorithmLoss: item.cumulativeAlgorithmLoss,
          bestLoss: item.bestExpertLoss,
          regret: item.regret,
          potential: item.potential,
        };
      }),
      remaining: state.trace.options.rounds - state.cursor,
    });
  }

  return deepFreeze({
    EXPERTS: EXPERTS,
    SCENARIOS: SCENARIOS,
    normalizeOptions: normalizeOptions,
    lossVector: lossVector,
    normalizeWeights: normalizeWeights,
    bestExpert: bestExpert,
    regretBound: regretBound,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    isFinished: isFinished,
    visualModel: visualModel,
  });
});
