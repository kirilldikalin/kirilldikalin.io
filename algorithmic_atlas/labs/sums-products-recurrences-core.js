(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SumsProductsRecurrencesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_DEPTH = 10;
  const MAX_VISIBLE_NODES = 31;
  const SCENARIO_DEFINITIONS = [
    { id: "binary-linear", label: "T(n)=2T(n/2)+n", divisors: [2, 2], cost: "linear", master: { a: 2, b: 2, d: 1 } },
    { id: "triple-linear", label: "T(n)=3T(n/2)+n", divisors: [2, 2, 2], cost: "linear", master: { a: 3, b: 2, d: 1 } },
    { id: "binary-constant", label: "T(n)=2T(n/2)+1", divisors: [2, 2], cost: "constant", master: { a: 2, b: 2, d: 0 } },
    { id: "binary-nlogn", label: "T(n)=2T(n/2)+n log₂n", divisors: [2, 2], cost: "n-log-n", master: null },
    { id: "mixed-linear", label: "T(n)=T(n/2)+T(n/3)+n", divisors: [2, 3], cost: "linear", master: null },
    { id: "decrement-linear", label: "T(n)=T(n−1)+n", decrement: true, cost: "linear", master: null },
  ];
  const BY_ID = new Map(SCENARIO_DEFINITIONS.map(function (entry) {
    return [entry.id, entry];
  }));
  const SCENARIOS = Object.freeze(SCENARIO_DEFINITIONS.map(function (entry) {
    return Object.freeze({ id: entry.id, label: entry.label });
  }));

  function scenario(id) {
    const value = BY_ID.get(String(id));
    if (!value) throw new RangeError("unknown recurrence scenario: " + id);
    return value;
  }

  function nodeCost(size, kind) {
    if (kind === "constant") return 1;
    if (kind === "n-log-n") return size <= 1 ? 0 : size * Math.log2(size);
    return size;
  }

  function masterCase(id) {
    const current = scenario(id);
    if (!current.master) {
      return Object.freeze({ applicable: false, reason: "У этой рекуррентности нет формы aT(n/b)+f(n), необходимой для Master theorem." });
    }
    const comparison = current.master.a - Math.pow(current.master.b, current.master.d);
    return Object.freeze({
      applicable: true,
      a: current.master.a,
      b: current.master.b,
      d: current.master.d,
      case: comparison < 0 ? 1 : comparison === 0 ? 2 : 3,
      relation: comparison < 0 ? "a < b^d" : comparison === 0 ? "a = b^d" : "a > b^d",
    });
  }

  function treeModel(id, rawN, rawDepth) {
    const current = scenario(id);
    const n = shared.boundedInteger(rawN, "n", 1, 1048576);
    const depth = shared.boundedInteger(rawDepth, "depth", 0, MAX_DEPTH);
    let sizes = [n];
    let cumulative = 0;
    const levels = [];
    for (let level = 0; level <= depth && sizes.length; level += 1) {
      const costs = sizes.map(function (size) { return nodeCost(size, current.cost); });
      const levelCost = costs.reduce(function (sum, value) { return sum + value; }, 0);
      cumulative += levelCost;
      const visibleSizes = sizes.slice(0, MAX_VISIBLE_NODES);
      levels.push(Object.freeze({
        level: level,
        nodeCount: BigInt(sizes.length),
        minimumSize: Math.min.apply(null, sizes),
        maximumSize: Math.max.apply(null, sizes),
        representativeSize: sizes[0],
        levelCost: levelCost,
        cumulativeCost: cumulative,
        visibleSizes: Object.freeze(visibleSizes),
        omittedNodes: Math.max(0, sizes.length - visibleSizes.length),
        aggregated: sizes.length > MAX_VISIBLE_NODES,
      }));
      if (level === depth) break;
      const next = [];
      sizes.forEach(function (size) {
        if (size <= 1) return;
        if (current.decrement) {
          next.push(size - 1);
        } else {
          current.divisors.forEach(function (divisor) {
            next.push(Math.max(1, size / divisor));
          });
        }
      });
      if (next.length > 100000) {
        throw new RangeError("recurrence tree exceeds the guarded node count");
      }
      sizes = next;
    }
    const maximumLevelCost = levels.reduce(function (maximum, level) {
      return Math.max(maximum, level.levelCost);
    }, 1);
    return shared.deepFreeze({
      scenarioId: current.id,
      label: current.label,
      n: n,
      requestedDepth: depth,
      master: masterCase(current.id),
      levels: levels.map(function (level) {
        return Object.freeze(Object.assign({}, level, {
          costShare: level.levelCost / maximumLevelCost,
        }));
      }),
      maximumLevelCost: maximumLevelCost,
      cumulativeCost: cumulative,
    });
  }

  function createState(id, n, depth) {
    const model = treeModel(id, n, depth);
    return Object.freeze({ model: model, visibleLevel: 0 });
  }

  function step(state) {
    return Object.freeze({
      model: state.model,
      visibleLevel: Math.min(state.model.levels.length - 1, state.visibleLevel + 1),
    });
  }

  function isFinished(state) {
    return state.visibleLevel >= state.model.levels.length - 1;
  }

  return {
    MAX_DEPTH: MAX_DEPTH,
    MAX_VISIBLE_NODES: MAX_VISIBLE_NODES,
    SCENARIOS: SCENARIOS,
    nodeCost: nodeCost,
    masterCase: masterCase,
    treeModel: treeModel,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
