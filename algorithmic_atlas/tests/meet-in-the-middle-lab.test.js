const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/meet-in-the-middle-core.js");

test("half lists contain every subset exactly once", () => {
  const entries = core.enumerateSubsets([2n, -3n, 5n], 4);
  assert.equal(entries.length, 8);
  assert.deepEqual(
    entries.map((entry) => entry.sum).sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
    [-3n, -1n, 0n, 2n, 2n, 4n, 5n, 7n]
  );
  assert.ok(entries.every((entry) =>
    entry.items.every((index) => index >= 4 && index <= 6)
  ));
});

test("meet-in-the-middle agrees with exhaustive subset sum", () => {
  const arrays = [
    { values: "3, 34, 4, 12, 5, 2", targets: [9, 30, 44] },
    { values: "-7, 2, 2, 9, 15, -3", targets: [-8, 4, 18] },
    { values: "1, 1, 1, 1, 1, 1, 1", targets: [0, 3, 8] },
  ];
  arrays.forEach(({ values, targets }) => {
    targets.forEach((target) => {
      const actual = core.solveMeetInMiddle(values, target);
      const expected = core.bruteForce(values, target);
      assert.equal(actual.exactPairs.length > 0, expected.exact.length > 0);
      assert.equal(actual.best.distance, abs(expected.best.sum - BigInt(target)));
    });
  });
});

function abs(value) {
  return value < 0n ? -value : value;
}

test("the two lists have square-root exponential size", () => {
  const result = core.solveMeetInMiddle(
    "1,2,3,4,5,6,7,8,9,10,11,12,13,14",
    "52"
  );
  assert.equal(result.leftEntries.length, 2 ** 7);
  assert.equal(result.rightEntries.length, 2 ** 7);
  assert.equal(result.memoryEntries, 2 ** 8);
  assert.ok(result.comparisons <= result.leftEntries.length * 8);
});

test("binary search returns the first duplicate complement", () => {
  const entries = [
    { sum: -2n }, { sum: 4n }, { sum: 4n }, { sum: 9n },
  ];
  assert.deepEqual(core.lowerBound(entries, 4n), { index: 1, comparisons: 3 });
  assert.equal(core.lowerBound(entries, 5n).index, 3);
});

test("trace exposes split, both lists, sorting and every pairing step", () => {
  const trace = core.buildTrace("8,3,5,6,11,2,9,1", "20");
  assert.deepEqual(
    trace.frames.slice(0, 4).map((frame) => frame.phase),
    ["split", "enumerate-left", "enumerate-right", "sort-right"]
  );
  assert.equal(
    trace.frames.filter((frame) => frame.phase === "pair").length,
    trace.solution.leftEntries.length
  );
  let state = core.createState("8,3,5,6,11,2,9,1", "20");
  let steps = 0;
  while (!state.finished && steps < 100) {
    state = core.step(state);
    steps += 1;
  }
  assert.ok(state.finished);
  assert.ok(Object.isFrozen(state));
  assert.equal(core.visualModel(state).target, 20n);
});

test("large exact integers and unsafe input are handled without Number arithmetic", () => {
  const exact = core.solveMeetInMiddle(
    "999999999999, -999999999998, 17, 23",
    "41"
  );
  assert.ok(exact.exactPairs.length > 0);
  assert.throws(() => core.solveMeetInMiddle("", "0"), /от 1/);
  assert.throws(() => core.solveMeetInMiddle("1,2,run()", "3"), /целым/);
  assert.throws(
    () => core.solveMeetInMiddle(Array(15).fill("1").join(","), "3"),
    /от 1 до/
  );
  assert.throws(() => core.solveMeetInMiddle("1000000000001", "0"), /слишком велик/);
});
