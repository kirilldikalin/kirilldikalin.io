const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/greedy-algorithms-core.js");
const chapterSource = fs.readFileSync(
  path.join(__dirname, "../chapters/greedy-algorithms.html"), "utf8"
);

function formulaCoverage(source) {
  const formulas = source.match(/<div class="atlas-math atlas-notation-formula"[\s\S]*?<\/div>/g) || [];
  return formulas.map((formula) => {
    const requiredMatch = formula.match(/data-required-notations="([^"]+)"/);
    const required = requiredMatch ? requiredMatch[1].split(",").sort() : [];
    const tokens = Array.from(formula.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1]);
    return { required, tokens: Array.from(new Set(tokens)).sort() };
  });
}

test("earliest finish produces the three-interval optimum", () => {
  const data = core.SCENARIOS.exchange;
  const greedy = core.greedySchedule(data.intervals, "earliest-finish");
  const optimum = core.exactOptimum(data.intervals, data.objective);
  assert.deepEqual(greedy.selected, ["b", "c", "e"]);
  assert.equal(core.score(data.intervals, greedy.selected, data.objective), optimum.score);
  assert.equal(optimum.score, 3);
});

test("every displayed exchange preserves feasibility and cardinality", () => {
  const trace = core.buildTrace({ scenario: "exchange", policy: "earliest-finish" });
  const exchanges = trace.frames.filter((frame) => frame.phase === "exchange");
  assert.equal(exchanges.length, 3);
  for (const frame of exchanges) {
    assert.equal(frame.witness.length, 3);
    assert.equal(core.isFeasible(trace.data.intervals, frame.witness), true);
  }
  assert.deepEqual(exchanges.at(-1).witness, trace.greedy.selected);
});

test("weighted intervals are a genuine earliest-finish counterexample", () => {
  const trace = core.buildTrace({ scenario: "weighted", policy: "earliest-finish" });
  assert.deepEqual(trace.greedy.selected, ["a", "b", "c"]);
  assert.equal(core.score(trace.data.intervals, trace.greedy.selected, "weight"), 6);
  assert.deepEqual(trace.optimum.selected, ["h"]);
  assert.equal(trace.optimum.score, 10);
  assert.match(trace.frames.at(-1).message, /контрпример/i);
});

test("all policies return actual compatible schedules", () => {
  for (const data of Object.values(core.SCENARIOS)) {
    for (const policy of core.POLICIES) {
      const result = core.greedySchedule(data.intervals, policy);
      assert.equal(core.isFeasible(data.intervals, result.selected), true);
    }
  }
});

test("reference enumeration scores cardinality and weight separately", () => {
  const exchange = core.SCENARIOS.exchange;
  const weighted = core.SCENARIOS.weighted;
  assert.equal(core.exactOptimum(exchange.intervals, "cardinality").score, 3);
  assert.equal(core.exactOptimum(weighted.intervals, "weight").score, 10);
});

test("runtime state advances to a stable final frame", () => {
  let state = core.createState({ scenario: "exchange", policy: "earliest-finish" });
  let steps = 0;
  while (!state.finished) {
    const before = state.cursor;
    state = core.step(state);
    assert.equal(state.cursor, before + 1);
    assert.ok(++steps < 30);
  }
  assert.equal(core.step(state), state);
  assert.equal(core.visualModel(state).frame.phase, "result");
});

test("invalid settings and executable expressions are rejected by construction", () => {
  assert.throws(() => core.normalizeOptions({ scenario: "missing" }), /сценарий/);
  assert.throws(() => core.normalizeOptions({ policy: "guess" }), /правило/);
  assert.equal(core.isFeasible(core.SCENARIOS.exchange.intervals, ["unknown"]), false);
  const source = fs.readFileSync(path.join(__dirname, "../labs/greedy-algorithms.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});

test("chapter uses the shared shell, full-width lab hook and substantial exercises", () => {
  assert.match(chapterSource, /<body class="atlas-chapter" data-atlas-node-id="greedy-algorithms"/);
  assert.match(chapterSource, /data-atlas-lab="greedy-algorithms"/);
  assert.equal((chapterSource.match(/class="atlas-exercise"/g) || []).length, 10);
  assert.doesNotMatch(chapterSource, /atlas-(?:chapter-)?features?|feature-chip/);
  const intro = chapterSource.match(/<p class="atlas-chapter-intro">\s*([\s\S]*?)\s*<\/p>/)[1].trim();
  assert.doesNotMatch(intro, /[.!?]$/);
});

test("every key display formula declares exactly its interactive notation tokens", () => {
  const coverage = formulaCoverage(chapterSource);
  assert.ok(coverage.length >= 7);
  coverage.forEach(({ required, tokens }) => assert.deepEqual(tokens, required));
});
