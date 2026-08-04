const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/bwt-fm-index-core.js");

test("BWT is reversible with a unique sentinel", () => {
  const transformed = core.transform("banana");
  assert.equal(transformed.last, "annb$aa");
  assert.equal(core.inverse(transformed.last), "banana");
});

test("BWT uses a stable code-point order and keeps the sentinel strictly minimal", () => {
  for (const text of ["", "\u0301", "ÅaÅ"]) {
    assert.equal(core.inverse(core.transform(text).last), text);
  }
  assert.equal(core.backwardSearch("ÅaÅ", "ÅÅ").frames.at(-1).count, 0);
  assert.equal(core.backwardSearch("🙂🙂", "🙂").frames.at(-1).count, 2);
});

test("FM backward search returns the exact interval size", () => {
  const result = core.backwardSearch("banana", "ana");
  assert.equal(result.frames.at(-1).count, 2);
  assert.equal(core.backwardSearch("banana", "xyz").frames.at(-1).count, 0);
});

test("Occ counts prefixes and RLE preserves the transformed length", () => {
  const index = core.buildIndex("mississippi");
  for (const symbol of index.alphabet) {
    assert.equal(index.occ[symbol].length, index.last.length + 1);
  }
  const runs = core.runLength(index.last);
  assert.equal(runs.reduce((sum, run) => sum + run.length, 0), index.last.length);
});

test("sentinel contract rejects ambiguous input", () => {
  assert.throws(() => core.transform("a$b"), /зарезервирован/);
  assert.throws(() => core.backwardSearch("banana", "$"), /не может входить/);
  assert.throws(() => core.inverse("$a"), /корректным BWT/);
});

test("playback preserves explicit empty text and rejects an empty pattern", () => {
  const state = core.createState({ text: "", pattern: "a" });
  assert.equal(state.text, "");
  assert.equal(state.indexData.last, "$");
  assert.throws(() => core.createState({ text: "banana", pattern: "" }), /не должен быть пустым/);
});
