const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/proof-methods-induction-core.js");

test("a conclusion chosen too early explains every missing dependency", () => {
  const initial = core.createState("odd-sum-induction");
  const result = core.attemptStep(initial, "conclusion");
  assert.equal(result.ok, false);
  assert.equal(result.state.completed.length, 0);
  assert.deepEqual(result.missing, ["base", "algebra"]);
  assert.match(result.message, /Сначала нужны утверждения/);
});

test("automatic topological steps complete every published proof graph", () => {
  core.SCENARIOS.forEach(({ id }) => {
    let state = core.createState(id);
    let guard = 0;
    while (!core.isFinished(state)) {
      state = core.step(state);
      guard += 1;
      assert.ok(guard < 20);
    }
    const graph = core.graphModel(state);
    assert.ok(graph.nodes.every(({ complete }) => complete));
    assert.equal(graph.edges.some(({ missing }) => missing), false);
  });
});

test("scenario validation rejects cycles and missing references", () => {
  assert.throws(() => core.validateScenario({ steps: [{ id: "a", requires: ["missing"] }] }), /unknown/);
  assert.throws(() => core.validateScenario({ steps: [{ id: "a", requires: ["b"] }, { id: "b", requires: ["a"] }] }), /cycle/);
});

test("repeating a completed step never mutates the proof", () => {
  const first = core.attemptStep(core.createState("contrapositive"), "claim");
  const repeated = core.attemptStep(first.state, "claim");
  assert.equal(repeated.ok, false);
  assert.equal(repeated.state, first.state);
});
