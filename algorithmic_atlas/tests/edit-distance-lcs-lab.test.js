const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/edit-distance-lcs-core.js");

test("Levenshtein matrix and script agree on the optimal cost", () => {
  const matrix = core.editMatrix("kitten", "sitting");
  const script = core.editScript("kitten", "sitting", matrix);
  assert.equal(matrix.at(-1).at(-1), 3);
  assert.equal(script.operations.filter(({ kind }) => kind !== "keep").length, 3);
});

test("weighted edit costs change the chosen optimum exactly", () => {
  const costs = { insert: 1, delete: 1, substitute: 5 };
  const matrix = core.editMatrix("a", "b", costs);
  const script = core.editScript("a", "b", matrix, costs);
  assert.equal(matrix[1][1], 2);
  assert.deepEqual(script.operations.map(({ kind }) => kind).sort(), ["delete", "insert"]);
});

test("global and local alignment use their distinct boundaries", () => {
  const scores = { match: 2, mismatch: -1, gap: -2 };
  const global = core.alignmentMatrix("AC", "A", scores, false);
  assert.equal(global.best.value, 0);
  assert.equal(core.alignmentTrace("AC", "A", global).left.length,
    core.alignmentTrace("AC", "A", global).right.length);
  const local = core.alignmentMatrix("GGTT", "TT", scores, true);
  const trace = core.alignmentTrace("GGTT", "TT", local);
  assert.equal(local.best.value, 4);
  assert.equal(trace.left, "TT");
  assert.equal(trace.right, "TT");
});

test("all four laboratory modes produce finite playback matrices", () => {
  for (const mode of ["edit", "lcs", "global", "local"]) {
    const state = core.createState({ mode, left: "ab", right: "ac" });
    assert.ok(state.frame.matrix.flat().every(Number.isFinite));
  }
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
  assert.equal(core.cellIsVisible(state.frame, 3, 3), false);
  while (!state.frame.finished) state = core.step(state);
  assert.equal(core.cellIsVisible(state.frame, 3, 3), true);
  assert.equal(state.frame.matrix.at(-1).at(-1), 1);
});

test("edit-distance adapter hides the optimum until its cell is computed", () => {
  const source = fs.readFileSync(path.join(__dirname, "../labs/edit-distance-lcs.js"), "utf8");
  assert.match(source, /core\.cellIsVisible\(frame, frame\.answerCell\[0\], frame\.answerCell\[1\]\)/);
  assert.match(source, /"ещё не вычислено"/);
});

test("playback does not replace explicitly empty strings with examples", () => {
  const state = core.createState({ mode: "edit", left: "", right: "x" });
  assert.equal(state.left, "");
  assert.equal(state.right, "x");
  assert.equal(state.frames.at(-1).matrix.at(-1).at(-1), 1);
});
