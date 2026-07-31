const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/probability-spaces-core.js");

test("Bayes tree keeps an exact probability mass of one", () => {
  const model = core.bayesModel(100, 900, 80);
  assert.equal(model.exactTotal, true);
  assert.deepEqual(model.total, { numerator: 1n, denominator: 1n });
  assert.deepEqual(model.b, { numerator: 81n, denominator: 500n });
  assert.deepEqual(model.posterior, { numerator: 5n, denominator: 9n });
  assert.equal(model.leaves.reduce((sum, leaf) => sum + leaf.share, 0), 1);
});

test("posterior is explicitly undefined when the evidence has probability zero", () => {
  const impossibleEvidence = core.bayesModel(400, 0, 0);
  assert.equal(impossibleEvidence.posteriorDefined, false);
  assert.equal(impossibleEvidence.posterior, null);
  assert.deepEqual(impossibleEvidence.b, { numerator: 0n, denominator: 1n });
});

test("probability endpoints and complements stay exact", () => {
  assert.deepEqual(core.probability(0), { numerator: 0n, denominator: 1n });
  assert.deepEqual(core.probability(1000), { numerator: 1n, denominator: 1n });
  assert.deepEqual(core.complement(core.probability(375)), { numerator: 5n, denominator: 8n });
  assert.throws(() => core.probability(1001), /от 0/);
});

test("the staged explanation always terminates after four transitions", () => {
  let state = core.createState(250, 750, 100);
  for (let index = 0; index < 4; index += 1) state = core.step(state);
  assert.equal(core.isFinished(state), true);
  assert.equal(core.step(state).stage, 4);
});
