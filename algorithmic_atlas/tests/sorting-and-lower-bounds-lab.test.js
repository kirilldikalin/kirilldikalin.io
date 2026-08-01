const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/sorting-and-lower-bounds-core.js");

const INPUT = "5,1,4,1,3,2";

test("all four sorting scenarios produce the same sorted multiset", () => {
  for (const algorithm of ["insertion", "merge", "heap", "quick"]) {
    const scenario = core.sortingScenario(INPUT, algorithm, "median3", 17);
    assert.deepEqual(
      scenario.frames.at(-1).array.map(({ value }) => value),
      [1, 1, 2, 3, 4, 5]
    );
    assert.ok(scenario.frames.at(-1).metrics.comparisons > 0);
    assert.ok(scenario.frames.length < 300);
  }
});
test("stable scenarios preserve duplicate identities", () => {
  for (const algorithm of ["insertion", "merge"]) {
    const scenario = core.sortingScenario(INPUT, algorithm, "last", 1);
    const equalIds = scenario.frames.at(-1).array
      .filter(({ value }) => value === 1)
      .map(({ id }) => id);
    assert.deepEqual(equalIds, [1, 3]);
    assert.equal(scenario.stable, true);
  }
});

test("pivot randomization is reproducible", () => {
  const first = core.sortingScenario(INPUT, "quick", "random", 91);
  const second = core.sortingScenario(INPUT, "quick", "random", 91);
  assert.deepEqual(first, second);
});

test("decision trees have one leaf per permutation and respect the lower bound", () => {
  for (let n = 2; n <= 4; n += 1) {
    const tree = core.decisionTree(n);
    assert.equal(tree.leaves, Number(core.factorialBigInt(n)));
    assert.ok(tree.height >= tree.lowerBound);
    assert.equal(tree.lowerBound, core.ceilLog2BigInt(core.factorialBigInt(n)));
  }
  assert.throws(() => core.decisionTree(5), /от 2 до 4/);
});

test("both laboratory modes terminate within their safe bounds", () => {
  let sorting = core.createState("sorting", INPUT, "quick", "random", 7);
  let steps = 0;
  while (!sorting.finished) {
    sorting = core.step(sorting);
    steps += 1;
  }
  assert.ok(steps < 300);
  assert.equal(core.visualModel(sorting).exact, true);

  let decision = core.createState("decision", 4);
  while (!decision.finished) decision = core.step(decision);
  assert.equal(decision.frameIndex, decision.scenario.height);
});

test("unsafe arrays are rejected", () => {
  assert.throws(() => core.parseArray("1"), /от 2/);
  assert.throws(
    () => core.parseArray(Array.from({ length: 11 }, (_, index) => index).join(",")),
    /10/
  );
});
