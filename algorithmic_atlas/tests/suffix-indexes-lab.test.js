const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/suffix-indexes-core.js");

test("suffix array and Kasai LCP agree for banana", () => {
  const sa = core.suffixArray("banana");
  assert.deepEqual(sa, [5, 3, 1, 0, 4, 2]);
  assert.deepEqual(core.lcpArray("banana", sa), [0, 1, 3, 0, 0, 2]);
});

test("binary interval finds all suffixes starting with pattern", () => {
  assert.deepEqual(core.search("banana", "ana").positions, [1, 3]);
  assert.deepEqual(core.search("banana", "xyz").positions, []);
});

test("suffix ordering compares exact code points rather than locale-equivalent symbols", () => {
  assert.deepEqual(core.suffixArray("ÅÅ"), [1, 0]);
  assert.deepEqual(core.search("Å", "Å").positions, []);
});

test("caller-supplied suffix arrays must be a sorted permutation", () => {
  assert.throws(() => core.lcpArray("banana", [0, 1, 2, 3, 4, 5]), /не упорядочен/);
  assert.throws(() => core.search("banana", "ana", [0, 1, 2, 3, 4, 5]), /не упорядочен/);
  assert.throws(() => core.search("banana", "ana", [5, 3, 1, 0, 4, 4]), /перестановкой/);
});

test("suffix automaton has at most 2n-1 states and accepts every substring", () => {
  const text = "ababa";
  const states = core.buildSuffixAutomaton(text);
  assert.ok(states.length <= 2 * text.length - 1);
  for (const pattern of ["a", "bab", "ababa"]) {
    let state = 0;
    for (const symbol of pattern) state = states[state].next[symbol];
    assert.notEqual(state, undefined);
  }
});

test("playback exposes every suffix without changing the source", () => {
  let state = core.createState({ mode: "array", text: "банан" });
  while (!state.frame.finished) state = core.step(state);
  assert.equal(state.frame.visible, 5);
  assert.equal(state.text, "банан");
});

test("playback distinguishes an omitted text from an explicitly empty text", () => {
  assert.throws(() => core.createState({ mode: "array", text: "" }), /не должна быть пустой/);
  assert.equal(core.createState({ mode: "array" }).text, "банан");
});
