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

test("Z playback exposes copied bounds and every real extension comparison", () => {
  const frames = core.zFrames("aaaa", "aa");
  const actions = new Set(frames.map(({ action }) => action));
  assert.ok(actions.has("z-copy"));
  assert.ok(actions.has("z-extend"));
  assert.ok(actions.has("z-mismatch"));
  assert.ok(frames.at(-1).comparisons > 0);
  assert.deepEqual(frames.at(-1).matches, [0, 1, 2]);
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

test("playback preserves an explicit empty text but never accepts an empty pattern", () => {
  const state = core.createState({ algorithm: "kmp", text: "", pattern: "a" });
  assert.equal(state.text, "");
  assert.deepEqual(state.frame.matches, []);
  assert.throws(() => core.createState({ algorithm: "kmp", text: "abc", pattern: "" }),
    /не должен быть пустым/);
});
