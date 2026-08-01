const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/matroids-core.js");
const chapterSource = fs.readFileSync(
  path.join(__dirname, "../chapters/matroids.html"), "utf8"
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

test("uniform, partition and graphic examples satisfy every matroid axiom", () => {
  for (const name of ["uniform", "partition", "graphic"]) {
    const result = core.checkAxioms(core.SYSTEMS[name]);
    assert.equal(result.empty, true, name);
    assert.equal(result.hereditary, true, name);
    assert.equal(result.exchange, true, name);
    assert.equal(result.isMatroid, true, name);
  }
});

test("matchings of a path fail exchange with the advertised witness", () => {
  const data = core.SYSTEMS.matching;
  assert.equal(core.isIndependent(data, ["e2"]), true);
  assert.equal(core.isIndependent(data, ["e1", "e3"]), true);
  assert.deepEqual(core.exchangeCandidates(data, ["e2"], ["e1", "e3"]), []);
  const result = core.checkAxioms(data);
  assert.equal(result.hereditary, true);
  assert.equal(result.exchange, false);
  assert.equal(result.isMatroid, false);
});

test("exchange candidates extend the smaller independent set", () => {
  for (const name of ["uniform", "partition", "graphic"]) {
    const data = core.SYSTEMS[name];
    const candidates = core.exchangeCandidates(data, data.initialA, data.initialB);
    assert.ok(candidates.length > 0, name);
    for (const id of candidates) {
      assert.equal(core.isIndependent(data, data.initialA.concat(id)), true, name + ":" + id);
    }
  }
});

test("descending-weight greedy is exact on every matroid example", () => {
  for (const name of ["uniform", "partition", "graphic"]) {
    const data = core.SYSTEMS[name];
    assert.equal(core.greedyMaxWeight(data).weight, core.exactMaxWeight(data).weight, name);
  }
});

test("matching counterexample makes greedy strictly suboptimal", () => {
  const data = core.SYSTEMS.matching;
  assert.deepEqual(core.greedyMaxWeight(data).selected, ["e2"]);
  assert.equal(core.greedyMaxWeight(data).weight, 3);
  assert.deepEqual(core.exactMaxWeight(data).selected, ["e1", "e3"]);
  assert.equal(core.exactMaxWeight(data).weight, 4);
});

test("graphic independence rejects a cycle and accepts a forest", () => {
  const data = core.SYSTEMS.graphic;
  assert.equal(core.isIndependent(data, ["e12", "e23", "e13"]), false);
  assert.equal(core.isIndependent(data, ["e12", "e23", "e34"]), true);
});

test("runtime state terminates and retains the selected systems", () => {
  for (const name of Object.keys(core.SYSTEMS)) {
    let state = core.createState({ system: name });
    let steps = 0;
    while (!state.finished) {
      const previous = state.cursor;
      state = core.step(state);
      assert.equal(state.cursor, previous + 1);
      assert.ok(++steps < 30);
    }
    assert.equal(core.visualModel(state).options.system, name);
  }
});

test("unknown elements, systems and executable expressions are rejected", () => {
  assert.throws(() => core.normalizeOptions({ system: "unknown" }), /Неизвестная/);
  assert.throws(() => core.normalizeOptions({ system: "uniform", A: ["x"] }), /неизвестный/);
  const source = fs.readFileSync(path.join(__dirname, "../labs/matroids.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});

test("chapter uses the shared shell, full-width lab hook and substantial exercises", () => {
  assert.match(chapterSource, /<body class="atlas-chapter" data-atlas-node-id="matroids"/);
  assert.match(chapterSource, /data-atlas-lab="matroids"/);
  assert.equal((chapterSource.match(/class="atlas-exercise"/g) || []).length, 10);
  assert.doesNotMatch(chapterSource, /atlas-(?:chapter-)?features?|feature-chip/);
  const intro = chapterSource.match(/<p class="atlas-chapter-intro">\s*([\s\S]*?)\s*<\/p>/)[1].trim();
  assert.doesNotMatch(intro, /[.!?]$/);
});

test("every key display formula declares exactly its interactive notation tokens", () => {
  const coverage = formulaCoverage(chapterSource);
  assert.ok(coverage.length >= 8);
  coverage.forEach(({ required, tokens }) => assert.deepEqual(tokens, required));
});
