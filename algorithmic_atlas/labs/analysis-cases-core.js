(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AnalysisCasesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_SIZE = 128;

  function adversaryState(rawSize) {
    const size = shared.boundedInteger(rawSize === undefined ? 16 : rawSize, "size", 1, MAX_SIZE);
    return Object.freeze({ mode: "adversary", size: size, tested: 0, finished: false, foundAt: size - 1 });
  }

  function adversaryStep(state) {
    if (state.finished) return state;
    const tested = state.tested + 1;
    return Object.freeze({ mode: "adversary", size: state.size, tested: tested, finished: tested >= state.size, foundAt: state.foundAt });
  }

  function searchDistribution(rawSize, rawAbsentPermille, rawBiasPermille) {
    const size = shared.boundedInteger(rawSize === undefined ? 12 : rawSize, "size", 1, 60);
    const absent = shared.boundedInteger(rawAbsentPermille === undefined ? 150 : rawAbsentPermille, "absent probability", 0, 1000) / 1000;
    const bias = shared.boundedInteger(rawBiasPermille === undefined ? 300 : rawBiasPermille, "front bias", 0, 1000) / 1000;
    const rawWeights = Array.from({ length: size }, function (_, index) {
      return Math.exp(-bias * 5 * index / Math.max(1, size - 1));
    });
    const totalWeight = rawWeights.reduce(function (sum, value) { return sum + value; }, 0);
    const presentMass = 1 - absent;
    const cases = rawWeights.map(function (weight, index) {
      const probability = presentMass * weight / totalWeight;
      return Object.freeze({ id: "position-" + index, position: index, probability: probability, cost: index + 1 });
    });
    cases.push(Object.freeze({ id: "absent", position: null, probability: absent, cost: size }));
    const totalProbability = cases.reduce(function (sum, item) { return sum + item.probability; }, 0);
    const expectedCost = cases.reduce(function (sum, item) { return sum + item.probability * item.cost; }, 0);
    return shared.deepFreeze({ mode: "average", size: size, absentProbability: absent, bias: bias, cases: cases, totalProbability: totalProbability, expectedCost: expectedCost });
  }

  function averageState(options) {
    const settings = options || {};
    const model = searchDistribution(settings.size, settings.absentPermille, settings.biasPermille);
    return Object.freeze({ mode: "average", model: model, selectedCase: 0, finished: false });
  }

  function averageStep(state) {
    const selected = Math.min(state.model.cases.length - 1, state.selectedCase + 1);
    return Object.freeze({ mode: "average", model: state.model, selectedCase: selected, finished: selected >= state.model.cases.length - 1 });
  }

  function potential(size, capacity) {
    return Math.max(0, 2 * size - capacity);
  }

  function dynamicArrayState(rawOperations) {
    const operations = shared.boundedInteger(rawOperations === undefined ? 24 : rawOperations, "operations", 1, 1000);
    return Object.freeze({
      mode: "amortized", operations: operations, size: 0, capacity: 1,
      pushes: 0, actualTotal: 0, amortizedTotal: 0, potential: 0,
      last: null, finished: false,
    });
  }

  function dynamicArrayStep(state) {
    if (state.finished) return state;
    const resize = state.size === state.capacity;
    const capacity = resize ? state.capacity * 2 : state.capacity;
    const actual = resize ? state.size + 1 : 1;
    const size = state.size + 1;
    const nextPotential = potential(size, capacity);
    const amortized = actual + nextPotential - state.potential;
    const pushes = state.pushes + 1;
    return Object.freeze({
      mode: "amortized", operations: state.operations, size: size, capacity: capacity,
      pushes: pushes, actualTotal: state.actualTotal + actual,
      amortizedTotal: state.amortizedTotal + amortized, potential: nextPotential,
      last: Object.freeze({ resize: resize, copied: resize ? state.size : 0, actual: actual, amortized: amortized, deltaPotential: nextPotential - state.potential }),
      finished: pushes >= state.operations,
    });
  }

  function createState(mode, options) {
    if (mode === "average") return averageState(options);
    if (mode === "amortized") return dynamicArrayState(options && options.operations);
    return adversaryState(options && options.size);
  }

  function step(state) {
    if (state.mode === "average") return averageStep(state);
    if (state.mode === "amortized") return dynamicArrayStep(state);
    return adversaryStep(state);
  }

  function visualModel(state) {
    if (state.mode === "adversary") {
      return shared.deepFreeze({ mode: state.mode, cells: Array.from({ length: state.size }, function (_, index) {
        return {
          index: index,
          tested: index < state.tested,
          targetRevealed: state.finished && index === state.foundAt,
          current: index === state.tested && !state.finished,
        };
      }), cost: state.tested, worstCost: state.size });
    }
    if (state.mode === "average") {
      const maximum = Math.max.apply(null, state.model.cases.map(function (item) { return item.probability; }));
      return shared.deepFreeze({ mode: state.mode, expectedCost: state.model.expectedCost, totalProbability: state.model.totalProbability, cases: state.model.cases.map(function (item, index) {
        return Object.assign({}, item, { share: maximum === 0 ? 0 : item.probability / maximum, selected: index === state.selectedCase });
      }) });
    }
    return shared.deepFreeze({
      mode: state.mode, size: state.size, capacity: state.capacity,
      visibleCapacity: Math.min(64, state.capacity), omittedSlots: Math.max(0, state.capacity - 64),
      actualTotal: state.actualTotal, amortizedTotal: state.amortizedTotal,
      potential: state.potential, last: state.last,
      identityHolds: state.last === null || state.last.amortized === state.last.actual + state.last.deltaPotential,
    });
  }

  return {
    MAX_SIZE: MAX_SIZE,
    adversaryState: adversaryState,
    adversaryStep: adversaryStep,
    searchDistribution: searchDistribution,
    averageState: averageState,
    averageStep: averageStep,
    potential: potential,
    dynamicArrayState: dynamicArrayState,
    dynamicArrayStep: dynamicArrayStep,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
