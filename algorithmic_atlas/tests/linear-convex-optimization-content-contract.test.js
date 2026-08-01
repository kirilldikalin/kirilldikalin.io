const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const atlasRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(atlasRoot, "..");
const chapterPath = path.join(atlasRoot, "chapters", "linear-convex-optimization.html");
const html = fs.readFileSync(chapterPath, "utf8");

function visibleSource(source) {
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*?)?\/?>/g, " ");
}

function mathErrors(source) {
  const errors = [];
  const delimiters = /\\\(|\\\)|\\\[|\\\]|\$\$|(?<!\\)\$/g;
  const rawCommand = /\\[A-Za-z]+/g;
  let mode = null;
  let previousEnd = 0;
  let match;
  function rawOutside(fragment) {
    rawCommand.lastIndex = 0;
    if (rawCommand.test(fragment)) errors.push("raw TeX outside math");
  }
  while ((match = delimiters.exec(source)) !== null) {
    if (mode === null) {
      rawOutside(source.slice(previousEnd, match.index));
      if (match[0] === "\\(") mode = "\\)";
      else if (match[0] === "\\[") mode = "\\]";
      else if (match[0] === "$") mode = "$";
      else if (match[0] === "$$") mode = "$$";
      else errors.push("unexpected closing delimiter");
    } else if (match[0] === mode) {
      mode = null;
      previousEnd = delimiters.lastIndex;
    } else errors.push("mismatched delimiter");
  }
  if (mode !== null) errors.push("unclosed math delimiter");
  else rawOutside(source.slice(previousEnd));
  return errors;
}

function malformedMathCommands(source) {
  const errors = [];
  const fragments = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|(?<!\\)\$(?!\$)([\s\S]*?)(?<!\\)\$(?!\$)/g;
  const missingSlash = /(?<![\\A-Za-z])(class|operatorname|lfloor|rfloor|lceil|rceil|frac|Theta|Omega|leq|geq|times|cdot|sqrt|infty|mathbb|mathcal|nabla|lambda|sum|log)(?=[{_\s\\0-9A-Z(])/g;
  let fragment;
  while ((fragment = fragments.exec(source)) !== null) {
    const tex = fragment.slice(1).find((value) => value !== undefined);
    let command;
    missingSlash.lastIndex = 0;
    while ((command = missingSlash.exec(tex)) !== null) errors.push("possible missing slash: " + command[1]);
  }
  return errors;
}

function formulaBlocks(source) {
  return Array.from(source.matchAll(/<div class="atlas-math[^"]*"([\s\S]*?)>([\s\S]*?)<\/div>/g))
    .map((match) => ({ attributes: match[1], body: match[2] }));
}

test("chapter 4.13 uses the shared chapter and full-width lab shell", () => {
  assert.match(html, /data-atlas-node-id="linear-convex-optimization"/);
  assert.match(html, /\.\.\/chapter\.css/);
  assert.match(html, /\.\.\/labs\/lab-common\.css/);
  assert.match(html, /\.\.\/labs\/lab-runtime\.js/);
  assert.match(html, /\.\.\/labs\/lab-svg\.js/);
  assert.match(html, /class="atlas-block atlas-block--fullwidth"/);
  assert.match(html, /data-atlas-lab="linear-convex-optimization"/);
  assert.match(html, /id="exercises"[^>]+data-atlas-block="exercises"/);
  assert.equal((html.match(/<details><summary>Подсказка<\/summary>/g) || []).length, 12);
  assert.equal((html.match(/<details><summary>Решение<\/summary>/g) || []).length, 12);
  assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 5);
  assert.doesNotMatch(html.match(/<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/)[1].trim(), /[.!?…]$/);
});

test("all display formulas have stable metadata and matching notation hooks", () => {
  const formulas = formulaBlocks(html);
  assert.equal(formulas.length, 14);
  const ids = new Set();
  formulas.forEach(({ attributes, body }) => {
    const id = attributes.match(/data-formula-id="([^"]+)"/);
    assert.ok(id);
    assert.equal(ids.has(id[1]), false);
    ids.add(id[1]);
    assert.match(attributes, /data-notation-coverage="interactive"/);
    const requiredMatch = attributes.match(/data-required-notations="([^"]+)"/);
    assert.ok(requiredMatch);
    const required = new Set(requiredMatch[1].split(",").filter(Boolean));
    const tokens = new Set(Array.from(body.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1]));
    assert.deepEqual(tokens, required);
  });
});

test("visible prose has balanced delimiters and no malformed TeX", () => {
  const source = visibleSource(html);
  assert.deepEqual(mathErrors(source), []);
  assert.deepEqual(malformedMathCommands(source), []);
});

test("complex theory depth is measured by the production parser", () => {
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics",
    "import json",
    "p=Path('algorithmic_atlas/chapters/linear-convex-optimization.html').resolve()",
    "print(json.dumps(reading_metrics(parse_page(p))))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const metrics = JSON.parse(result.stdout);
  assert.ok(metrics.words >= 3900, "chapter is below the complex-depth target");
  assert.ok(metrics.words <= 5500, "chapter needs editorial splitting rather than more prose");
  assert.equal(metrics.formulaBlocks, 14);
  assert.ok(metrics.proofBlocks >= 2);
});

test("committed notation registry covers every explicit formula token", () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(atlasRoot, "data", "math-notations.json"), "utf8")
  );
  const tokenIds = new Set(Array.from(html.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1]));
  const entries = registry.entries.filter((entry) => tokenIds.has(entry.id));
  assert.deepEqual(new Set(entries.map((entry) => entry.id)), tokenIds);
  entries.forEach((entry) => {
    assert.equal(entry.scope, "local");
    assert.equal(entry.chapterId, "linear-convex-optimization");
    assert.equal(entry.firstDefinition.chapterId, "linear-convex-optimization");
    assert.match(html, new RegExp('id="' + entry.firstDefinition.anchor + '"'));
  });
});

test("laboratory code is bounded, shared and never evaluates expressions", () => {
  const core = fs.readFileSync(path.join(atlasRoot, "labs", "linear-convex-optimization-core.js"), "utf8");
  const adapter = fs.readFileSync(path.join(atlasRoot, "labs", "linear-convex-optimization.js"), "utf8");
  assert.doesNotMatch(core + adapter, /\beval\s*\(|\bFunction\s*\(/);
  assert.match(adapter, /AtlasLabRuntime/);
  assert.match(adapter, /AtlasLabSvg/);
  assert.match(adapter, /maxAutomaticSteps:\s*12/);
  assert.match(core, /\bBigInt\b/);
  assert.match(core, /complementaryProducts/);
});
