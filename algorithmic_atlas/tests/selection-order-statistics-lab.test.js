const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/selection-order-statistics-core.js");

test("randomized and BFPRT tracks return every requested rank exactly", () => {
  const values = "9,1,7,3,3,8,2,6,5,4";
  for (let rank = 1; rank <= 10; rank += 1) {
    const scenario = core.comparisonScenario(values, rank, 42);
    assert.equal(scenario.random.result, scenario.expected);
    assert.equal(scenario.bfprt.result, scenario.expected);
    assert.ok(scenario.random.frames.length < 100);
    assert.ok(scenario.bfprt.frames.length < 100);
  }
});
test("three-way partition handles duplicate pivots without looping", () => {
  const counter = { comparisons: 0 };
  const partition = core.partitionThreeWay([2, 1, 2, 3, 2], 2, counter);
  assert.deepEqual(partition, {
    less: [1],
    equal: [2, 2, 2],
    greater: [3],
  });
  assert.ok(counter.comparisons >= 5);

  const scenario = core.comparisonScenario("5,5,5,5", 3, 7);
  assert.equal(scenario.random.result, 5);
  assert.equal(scenario.bfprt.result, 5);
});

test("median of medians chooses a present pivot and records groups of five", () => {
  const counter = { comparisons: 0 };
  const evidence = [];
  const values = [12, 3, 7, 1, 9, 4, 10, 2, 6, 8, 11, 5];
  const pivot = core.medianOfMedians(values, counter, evidence);
  assert.ok(values.includes(pivot));
  assert.ok(evidence[0].groups.every((group) => group.length <= 5));
  assert.equal(evidence[0].medians.length, 3);
  assert.ok(counter.comparisons > 0);
  assert.equal(core.guaranteedBfprtDiscard(25), 6);
});

test("simultaneous minimum and maximum meet the pairwise comparison bound", () => {
  for (const values of [[7], [8, 1], [9, 2, 7, 4, 5], [9, 2, 7, 4, 5, 1]]) {
    const result = core.simultaneousMinMax(values);
    assert.equal(result.minimum, Math.min(...values));
    assert.equal(result.maximum, Math.max(...values));
    assert.ok(result.comparisons <= Math.ceil(3 * values.length / 2) - 2 || values.length === 1);
  }
});

test("synchronized comparison state terminates and never mutates progress implicitly", () => {
  let state = core.createState("8,4,7,1,9,2,6,3,5", 5, 123);
  let steps = 0;
  while (!state.finished) {
    state = core.step(state);
    steps += 1;
  }
  const model = core.visualModel(state);
  assert.equal(model.random.result, 5);
  assert.equal(model.bfprt.result, 5);
  assert.equal(model.exact, true);
  assert.ok(steps < 100);
});

test("top-k and boundary validation are explicit", () => {
  assert.deepEqual(core.topK([4, 1, 7, 7, 2], 3), [7, 7, 4]);
  assert.throws(() => core.comparisonScenario("1,2,3", 0, 1), /Ранг k/);
  assert.throws(() => core.comparisonScenario("1,2,3", 4, 1), /Ранг k/);
});
