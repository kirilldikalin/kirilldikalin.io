const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/sets-relations-functions-logic-core.js");

test("mapping properties distinguish functions, injections and surjections", () => {
  const mapping = core.mappingProperties(["a", "b"], ["1", "2"], [["a", "1"], ["b", "1"]]);
  assert.equal(mapping.isFunction, true);
  assert.equal(mapping.injective, false);
  assert.equal(mapping.surjective, false);
  assert.deepEqual(mapping.collisions, ["1"]);

  const notFunction = core.mappingProperties(["a"], ["1", "2"], [["a", "1"], ["a", "2"]]);
  assert.equal(notFunction.isFunction, false);
  assert.deepEqual(notFunction.multiple, ["a"]);
});

test("empty mapping follows the standard empty-set edge cases", () => {
  const empty = core.mappingProperties([], [], []);
  assert.equal(empty.isFunction, true);
  assert.equal(empty.injective, true);
  assert.equal(empty.surjective, true);
  assert.equal(empty.bijective, true);
});

test("equivalence classes and Hasse covers are derived exactly", () => {
  const equivalence = core.PRESETS.find(({ id }) => id === "equivalence");
  assert.deepEqual(core.equivalenceClasses(equivalence.elements, equivalence.pairs), [["1", "3"], ["2", "4"]]);
  const poset = core.PRESETS.find(({ id }) => id === "poset");
  assert.deepEqual(core.hasseEdges(poset.elements, poset.pairs), [["1", "2"], ["1", "3"], ["2", "6"], ["3", "6"]]);
});

test("a missing transitive pair carries a concrete witness", () => {
  const result = core.relationProperties(["a", "b", "c"], [["a", "a"], ["b", "b"], ["c", "c"], ["a", "b"], ["b", "c"]]);
  assert.equal(result.transitive, false);
  assert.deepEqual(result.witnesses.transitivityTriple, ["a", "b", "c"]);
  assert.throws(() => core.hasseEdges(result.elements, result.pairs), /partial order/);
});
