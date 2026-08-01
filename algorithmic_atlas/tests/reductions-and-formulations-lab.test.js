const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("../labs/reductions-and-formulations-core.js");

const chapterPath = path.join(__dirname, "../chapters/reductions-and-formulations.html");

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div class="atlas-math[^"]*"([\s\S]*?)>([\s\S]*?)<\/div>/g)
  ).map((match) => ({ attributes: match[1], body: match[2] }));
}

test("graph, SAT and MIP formulations agree on every assignment and preset", () => {
  for (const [presetId, preset] of Object.entries(core.PRESETS)) {
    const options = core.normalizeOptions({ preset: presetId });
    const clauses = core.satClauses(core.VERTICES, options.edges, options.budget);
    for (const selected of core.allAssignments(core.VERTICES)) {
      const expected = core.isVertexCover(options.edges, selected) && selected.length <= options.budget;
      assert.equal(core.evaluateSAT(clauses, selected).satisfied, expected, presetId + ":SAT:" + selected);
      assert.equal(core.mipEvaluation(core.VERTICES, options.edges, options.budget, selected).feasible, expected, presetId + ":MIP:" + selected);
    }
  }
});

test("equivalence holds for all 64 graphs, every budget and every assignment", () => {
  const edgeUniverse = core.ALL_EDGES.map((edge) => edge.id);
  for (let mask = 0; mask < (1 << edgeUniverse.length); mask += 1) {
    const edgeIds = edgeUniverse.filter((_, index) => (mask & (1 << index)) !== 0);
    for (let budget = 0; budget <= core.VERTICES.length; budget += 1) {
      const options = core.normalizeOptions({ edgeIds, budget });
      const clauses = core.satClauses(core.VERTICES, options.edges, budget);
      for (const selected of core.allAssignments(core.VERTICES)) {
        const expected = core.isVertexCover(options.edges, selected) && selected.length <= budget;
        assert.equal(core.evaluateSAT(clauses, selected).satisfied, expected);
        assert.equal(core.mipEvaluation(core.VERTICES, options.edges, budget, selected).feasible, expected);
      }
      const optimum = core.exactMinimumCover(core.VERTICES, options.edges).length;
      const found = core.buildSearch(core.VERTICES, options.edges, budget).nodes.some(
        (node) => node.status === "solution"
      );
      assert.equal(found, optimum <= budget);
    }
  }
});

test("minimum covers match the four teaching graphs", () => {
  const expected = { path: 2, cycle: 2, triangleTail: 2, complete: 3 };
  for (const [presetId, size] of Object.entries(expected)) {
    const options = core.normalizeOptions({ preset: presetId });
    assert.equal(core.exactMinimumCover(core.VERTICES, options.edges).length, size, presetId);
  }
});

test("SAT encoding contains one edge clause and exact combinational budget clauses", () => {
  const options = core.normalizeOptions({ preset: "path", budget: 2 });
  const clauses = core.satClauses(core.VERTICES, options.edges, options.budget);
  assert.equal(clauses.filter((clause) => clause.kind === "edge").length, 3);
  assert.equal(clauses.filter((clause) => clause.kind === "budget").length, 4);
  assert.deepEqual(clauses.find((clause) => clause.id === "edge-ab").literals, ["a", "b"]);
});

test("editing one edge synchronously changes graph, SAT and MIP constraints", () => {
  const without = core.buildTrace({ preset: "path", edgeIds: ["ab", "bc"], budget: 1, selected: ["b"] });
  const withEdge = core.buildTrace({ preset: "path", edgeIds: ["ab", "bc", "cd"], budget: 1, selected: ["b"] });
  assert.equal(without.graphFeasible, true);
  assert.equal(without.sat.satisfied, true);
  assert.equal(without.mip.feasible, true);
  assert.equal(withEdge.graphFeasible, false);
  assert.equal(withEdge.sat.satisfied, false);
  assert.equal(withEdge.mip.feasible, false);
  assert.equal(withEdge.clauses.length, without.clauses.length + 1);
});

test("state-space search agrees with exact feasibility for every budget", () => {
  for (const presetId of Object.keys(core.PRESETS)) {
    const base = core.normalizeOptions({ preset: presetId });
    const optimum = core.exactMinimumCover(core.VERTICES, base.edges).length;
    for (let budget = 0; budget <= core.VERTICES.length; budget += 1) {
      const search = core.buildSearch(core.VERTICES, base.edges, budget);
      const found = search.nodes.some((node) => node.status === "solution");
      assert.equal(found, optimum <= budget, presetId + ":" + budget);
    }
  }
});

test("partial state prunes budget excess and irrevocably uncovered edges", () => {
  const edges = core.normalizeOptions({ preset: "path" }).edges;
  assert.equal(core.partialStatus(core.VERTICES, edges, 1, 2, ["a", "b"]), "budget");
  assert.equal(core.partialStatus(core.VERTICES, edges, 2, 2, []), "uncovered");
  assert.equal(core.partialStatus(core.VERTICES, edges, 2, 1, ["b"]), "open");
});

test("runtime reveals one visited search node per step and terminates", () => {
  let state = core.createState({ preset: "triangleTail", budget: 2, selected: ["b", "c"] });
  let steps = 0;
  while (!state.finished) {
    const before = state.cursor;
    state = core.step(state);
    assert.equal(state.cursor, before + 1);
    assert.equal(core.visualModel(state).frame.visitedIds.length, state.cursor + 1);
    assert.ok(++steps < 40);
  }
});

test("unknown identifiers and invalid budgets are rejected", () => {
  assert.throws(() => core.normalizeOptions({ preset: "mystery" }), /Неизвестный/);
  assert.throws(() => core.normalizeOptions({ edgeIds: ["ax"] }), /неизвестный/);
  assert.throws(() => core.normalizeOptions({ selected: ["z"] }), /неизвестный/);
  assert.throws(() => core.normalizeOptions({ budget: 5 }), /budget/);
});

test("browser layer contains no executable expression parser", () => {
  const source = fs.readFileSync(path.join(__dirname, "../labs/reductions-and-formulations.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});

test("chapter 4.12 follows the shared long-form chapter contract", () => {
  const html = fs.readFileSync(chapterPath, "utf8");
  assert.match(html, /data-atlas-node-id="reductions-and-formulations"/);
  assert.match(html, /class="atlas-block atlas-block--fullwidth" data-atlas-block="lab"/);
  assert.match(html, /data-atlas-lab="reductions-and-formulations"/);
  assert.equal((html.match(/<article class="atlas-exercise">/g) || []).length, 12);
  assert.equal((html.match(/<summary>Показать подсказку<\/summary>/g) || []).length, 12);
  assert.equal((html.match(/<summary>Показать решение<\/summary>/g) || []).length, 12);
  assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 4);
  assert.doesNotMatch(
    html.match(/<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/)[1].trim(),
    /[.!?…]$/
  );
});

test("every display formula in chapter 4.12 has exact notation coverage", () => {
  const formulas = formulaBlocks(fs.readFileSync(chapterPath, "utf8"));
  assert.ok(formulas.length >= 9);
  formulas.forEach(({ attributes, body }) => {
    assert.match(attributes, /data-formula-id="[^"]+"/);
    assert.match(attributes, /data-notation-coverage="interactive"/);
    const required = new Set(
      attributes.match(/data-required-notations="([^"]+)"/)[1].split(",").filter(Boolean)
    );
    const tokens = new Set(
      Array.from(body.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1])
    );
    assert.deepEqual(tokens, required);
  });
});

test("production parser accepts chapter 4.12 math and measured depth", () => {
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics, math_delimiter_errors",
    "import json",
    "p=parse_page(Path('algorithmic_atlas/chapters/reductions-and-formulations.html'))",
    "print(json.dumps({'metrics':reading_metrics(p),'errors':math_delimiter_errors(' '.join(p.visible_text)),'outside':p.display_math_outside_wrapper}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], {
    cwd: path.join(__dirname, "../.."), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.metrics.words >= 3500);
  assert.ok(report.metrics.words <= 5000);
  assert.equal(report.metrics.proofBlocks >= 3, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.outside, []);
});
