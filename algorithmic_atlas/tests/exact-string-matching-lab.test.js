const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/exact-string-matching-core.js");

test("prefix and Z functions preserve borders and overlaps", () => {
  assert.deepEqual(core.prefixFunction("абабака"), [0, 0, 1, 2, 3, 0, 1]);
  assert.deepEqual(core.zFunction("aaaaa"), [5, 4, 3, 2, 1]);
});

test("naive, KMP and Z search return the same overlapping matches", () => {
  const expected = [0, 1, 2];
  assert.deepEqual(core.naiveFrames("aaaa", "aa").at(-1).matches, expected);
  assert.deepEqual(core.kmpFrames("aaaa", "aa").at(-1).matches, expected);
  assert.deepEqual(core.zFrames("aaaa", "aa").at(-1).matches, expected);
});

test("search handles a pattern longer than text and rejects empty patterns", () => {
  assert.deepEqual(core.kmpFrames("ab", "abcd").at(-1).matches, []);
  assert.throws(() => core.naiveFrames("abc", ""), /не должен быть пустым/);
});

test("playback reaches a finite terminal frame", () => {
  let state = core.createState({ algorithm: "kmp", text: "abcabc", pattern: "abc" });
  while (!state.frame.finished) state = core.step(state);
  assert.deepEqual(state.frame.matches, [0, 3]);
});
