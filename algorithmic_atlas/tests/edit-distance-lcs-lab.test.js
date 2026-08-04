const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/edit-distance-lcs-core.js");

test("Levenshtein matrix and script agree on the optimal cost", () => {
  const matrix = core.editMatrix("kitten", "sitting");
  const script = core.editScript("kitten", "sitting", matrix);
  assert.equal(matrix.at(-1).at(-1), 3);
  assert.equal(script.operations.filter(({ kind }) => kind !== "keep").length, 3);
});

test("LCS reconstruction and Hirschberg have optimal length", () => {
  const matrix = core.lcsMatrix("ABCBDAB", "BDCABA");
  const reconstructed = core.lcs("ABCBDAB", "BDCABA", matrix).value;
  const linearSpace = core.hirschberg("ABCBDAB", "BDCABA");
  assert.equal(reconstructed.length, 4);
  assert.equal(linearSpace.length, 4);
});

test("empty and Unicode inputs are handled exactly", () => {
  assert.equal(core.editMatrix("", "🙂🙂").at(-1).at(-1), 2);
  assert.equal(core.lcs("абв", "бг").value, "б");
});

test("playback fills a finite matrix and reaches the traceback", () => {
  let state = core.createState({ mode: "edit", left: "кот", right: "кит" });
  while (!state.frame.finished) state = core.step(state);
  assert.equal(state.frame.matrix.at(-1).at(-1), 1);
});
