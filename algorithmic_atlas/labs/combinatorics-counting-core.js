(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CombinatoricsCountingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_GRID_SIDE = 20;

  function binomial(rawN, rawK) {
    const n = shared.boundedInteger(rawN, "n", 0, 1000);
    const k = shared.boundedInteger(rawK, "k", 0, n);
    const smaller = Math.min(k, n - k);
    let result = 1n;
    for (let index = 1; index <= smaller; index += 1) {
      result = result * BigInt(n - smaller + index) / BigInt(index);
    }
    return result;
  }

  function gridPaths(rawRows, rawColumns) {
    const rows = shared.boundedInteger(rawRows, "rows", 0, MAX_GRID_SIDE);
    const columns = shared.boundedInteger(rawColumns, "columns", 0, MAX_GRID_SIDE);
    const counts = [];
    let maximum = 1n;
    for (let row = 0; row <= rows; row += 1) {
      const current = [];
      for (let column = 0; column <= columns; column += 1) {
        const value = row === 0 && column === 0
          ? 1n
          : (row > 0 ? counts[row - 1][column] : 0n) +
            (column > 0 ? current[column - 1] : 0n);
        current.push(value);
        if (value > maximum) maximum = value;
      }
      counts.push(Object.freeze(current));
    }
    return shared.deepFreeze({
      rows: rows,
      columns: columns,
      counts: counts,
      total: counts[rows][columns],
      closedForm: binomial(rows + columns, rows),
      maximum: maximum,
      cells: counts.flatMap(function (line, row) {
        return line.map(function (value, column) {
          return {
            row: row,
            column: column,
            value: value,
            share: maximum === 1n ? 1 : shared.log10BigInt(value) / shared.log10BigInt(maximum),
          };
        });
      }),
    });
  }

  function inclusionExclusion(rawUniverse, rawA, rawB, rawIntersection) {
    const universe = shared.boundedInteger(rawUniverse, "|U|", 0, 1000000);
    const a = shared.boundedInteger(rawA, "|A|", 0, universe);
    const b = shared.boundedInteger(rawB, "|B|", 0, universe);
    const intersection = shared.boundedInteger(rawIntersection, "|A∩B|", 0, Math.min(a, b));
    const union = a + b - intersection;
    if (union > universe) throw new RangeError("specified sets do not fit inside the universe");
    return Object.freeze({
      universe: universe,
      a: a,
      b: b,
      intersection: intersection,
      onlyA: a - intersection,
      onlyB: b - intersection,
      neither: universe - union,
      union: union,
      identityHolds: union === a + b - intersection,
    });
  }

  function pigeonholeModel(rawItems, rawBoxes) {
    const items = shared.boundedInteger(rawItems, "items", 0, 200);
    const boxes = shared.boundedInteger(rawBoxes, "boxes", 1, 30);
    const occupancy = Array.from({ length: boxes }, function () { return 0; });
    for (let item = 0; item < items; item += 1) occupancy[item % boxes] += 1;
    const guaranteed = Math.ceil(items / boxes);
    const maximum = Math.max.apply(null, occupancy);
    return Object.freeze({
      items: items,
      boxes: boxes,
      occupancy: Object.freeze(occupancy),
      guaranteedMaximum: guaranteed,
      actualMaximum: maximum,
      collisionForced: items > boxes,
      principleHolds: maximum >= guaranteed,
    });
  }

  function createState(mode, options) {
    const requested = ["grid", "inclusion", "pigeonhole"].includes(mode) ? mode : "grid";
    const settings = options || {};
    let model;
    let maximumStage;
    if (requested === "grid") {
      model = gridPaths(settings.rows === undefined ? 6 : settings.rows, settings.columns === undefined ? 8 : settings.columns);
      maximumStage = model.rows + model.columns;
    } else if (requested === "inclusion") {
      model = inclusionExclusion(
        settings.universe === undefined ? 100 : settings.universe,
        settings.a === undefined ? 45 : settings.a,
        settings.b === undefined ? 38 : settings.b,
        settings.intersection === undefined ? 15 : settings.intersection
      );
      maximumStage = 3;
    } else {
      model = pigeonholeModel(settings.items === undefined ? 13 : settings.items, settings.boxes === undefined ? 5 : settings.boxes);
      maximumStage = model.items;
    }
    return Object.freeze({ mode: requested, model: model, stage: 0, maximumStage: maximumStage });
  }

  function step(state) {
    return Object.freeze(Object.assign({}, state, { stage: Math.min(state.maximumStage, state.stage + 1) }));
  }
  function isFinished(state) { return state.stage >= state.maximumStage; }

  return {
    MAX_GRID_SIDE: MAX_GRID_SIDE,
    binomial: binomial,
    gridPaths: gridPaths,
    inclusionExclusion: inclusionExclusion,
    pigeonholeModel: pigeonholeModel,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
