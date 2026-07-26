"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

require("../interactive/amoeba-layers-core.js");

const core = globalThis.Euler763Core;

test("one split moves every child to the next diagonal layer", () => {
  const cell = [2, 3, 4];
  assert.equal(core.layerIndex(cell), 9);
  assert.deepEqual(core.splitCell(cell), [[3, 3, 4], [2, 4, 4], [2, 3, 5]]);
  assert.ok(core.splitCell(cell).every((child) => core.layerIndex(child) === 10));
});

test("layer coordinates contain the expected triangular number of cells", () => {
  for (let layer = 0; layer <= 12; layer += 1) {
    const cells = core.layerCoordinates(layer);
    assert.equal(cells.length, ((layer + 1) * (layer + 2)) / 2);
    assert.ok(cells.every((cell) => core.layerIndex(cell) === layer));
  }
});

test("a legal chain preserves the amoeba balance 2N+1", () => {
  const splits = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  for (let count = 0; count <= splits.length; count += 1) {
    const state = core.applySplits(splits.slice(0, count));
    const amoebas = state.reduce((sum, item) => sum + item.count, 0);
    assert.equal(amoebas, 2 * count + 1);
  }
});

test("all forbidden patterns have a distinct collision marker", () => {
  for (const name of ["triangle", "y", "stapler"]) {
    const pattern = core.forbiddenPattern(name);
    assert.ok(pattern.cells.length >= 3);
    assert.equal(pattern.collision.length, 2);
    assert.ok(!pattern.cells.some((cell) => cell.join(",") === pattern.collision.join(",")));
  }
});

test("snake state contains a+b+1 cells and has triangular lower bound", () => {
  for (let a = 0; a <= 6; a += 1) {
    for (let b = 0; b <= 6; b += 1) {
      assert.equal(core.snakeCells(a, b).length, a + b + 1);
      assert.equal(core.triangularCost(a, b), ((a + b) * (a + b + 1)) / 2);
      assert.ok(core.transitionTerms(a, b).length >= 2);
    }
  }
});

test("the recurrence reproduces direct and published checks", () => {
  const values = core.countConfigurations(100, 1_000_000_000);
  assert.deepEqual(values.slice(0, 9), [1, 1, 3, 9, 30, 99, 336, 1134, 3855]);
  assert.equal(values[10], 44_499);
  assert.equal(core.countConfigurations(20)[20], 9_204_559_704);
  assert.equal(values[100], 780_166_455);
});
