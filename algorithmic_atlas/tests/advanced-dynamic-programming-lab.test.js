const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/advanced-dynamic-programming-core.js");

test("additive interval weights satisfy both Knuth premises", () => {
  for (let size = 4; size <= 7; size += 1) {
    const options = core.normalizeOptions({ scenario: "monge", size: size });
    const conditions = core.analyzeConditions(options);
    assert.equal(conditions.quadrangle, true);
    assert.equal(conditions.intervalMonotone, true);
  }
});

test("valid scenario has monotone optimum indices", () => {
  const options = core.normalizeOptions({ scenario: "monge", size: 7 });
  const full = core.solveFull(options);
  assert.deepEqual(core.optViolations(full), []);
});

test("Knuth window preserves every exact value in the valid scenario", () => {
  for (let size = 4; size <= 7; size += 1) {
    const options = core.normalizeOptions({ scenario: "monge", size: size });
    const full = core.solveFull(options);
    const knuth = core.solveKnuth(options);
    assert.deepEqual(knuth.dp, full.dp);
    assert.equal(knuth.dp[0][size - 1], full.dp[0][size - 1]);
  }
});

test("irregular scenario exposes failed premises and a moving-optimum counterexample", () => {
  const trace = core.buildTrace({ scenario: "irregular", size: 6, method: "knuth" });
  assert.equal(trace.conditions.quadrangle, false);
  assert.equal(trace.conditions.intervalMonotone, false);
  assert.ok(trace.optViolations.length > 0);
  assert.notEqual(trace.chosenAnswer, trace.exactAnswer);
  assert.ok(trace.events.some((event) => event.missedOptimum));
});

test("a missed optimum is visibly outside the chosen search window", () => {
  const trace = core.buildTrace({ scenario: "irregular", size: 6, method: "knuth" });
  const event = trace.events.find((entry) => entry.missedOptimum);
  assert.ok(event);
  assert.ok(event.exactSplit < event.lower || event.exactSplit > event.upper);
  assert.ok(event.candidates.some((entry) => entry.split === event.exactSplit && !entry.allowed));
});

test("full transition rows agree with their stored minimum", () => {
  const options = core.normalizeOptions({ scenario: "irregular", size: 7, method: "full" });
  const solved = core.solveFull(options);
  for (const record of solved.records) {
    const minimum = Math.min(...record.candidates.map((entry) => entry.value));
    assert.equal(record.value, minimum);
    assert.equal(record.candidates.find((entry) => entry.split === record.split).value, minimum);
  }
});

test("all arithmetic remains exact finite integers on the supported domain", () => {
  for (const scenario of Object.keys(core.SCENARIOS)) {
    const trace = core.buildTrace({ scenario: scenario, size: 7, method: "knuth" });
    for (const event of trace.events) {
      assert.ok(Number.isSafeInteger(event.value));
      assert.ok(Number.isSafeInteger(event.exactValue));
      for (const candidate of event.candidates) assert.ok(Number.isSafeInteger(candidate.value));
    }
  }
});

test("runtime trace is deterministic and bounded", () => {
  const input = { scenario: "irregular", size: 7, method: "knuth" };
  assert.deepEqual(core.buildTrace(input).events, core.buildTrace(input).events);
  let state = core.createState(input);
  let steps = 0;
  while (!core.isFinished(state)) {
    state = core.step(state);
    steps += 1;
    assert.ok(steps <= 21);
  }
  assert.equal(core.visualModel(state).finished, true);
});

test("unknown scenarios, methods and oversized matrices are rejected", () => {
  assert.throws(() => core.createState({ scenario: "eval", size: 6 }), /сценарий/);
  assert.throws(() => core.createState({ scenario: "monge", size: 200 }), /4 до 7/);
  assert.throws(() => core.createState({ scenario: "monge", size: 6, method: "Function" }), /способ/);
});
