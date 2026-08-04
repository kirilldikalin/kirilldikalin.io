const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/bwt-fm-index-core.js");

test("BWT is reversible with a unique sentinel", () => {
  const transformed = core.transform("banana");
  assert.equal(transformed.last, "annb$aa");
  assert.equal(core.inverse(transformed.last), "banana");
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
});
