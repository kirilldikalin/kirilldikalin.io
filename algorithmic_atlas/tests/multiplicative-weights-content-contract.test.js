"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const atlasRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(atlasRoot, "..");
const chapter = fs.readFileSync(path.join(atlasRoot, "chapters/multiplicative-weights.html"), "utf8");

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div\s+class="[^"]*\batlas-math\b[^"]*"([\s\S]*?)<\/div>/g),
    (match) => match[0]
  );
}

test("chapter 4.14 uses the existing page and full-width laboratory shell", () => {
  assert.match(chapter, /data-atlas-node-id="multiplicative-weights"/);
  assert.match(chapter, /<h1>Метод мультипликативных весов<\/h1>/);
  assert.match(chapter, /href="\.\.\/chapter\.css"/);
  assert.match(chapter, /href="\.\.\/labs\/lab-common\.css"/);
  assert.match(chapter, /href="\.\.\/labs\/multiplicative-weights\.css"/);
  assert.match(chapter, /src="\.\.\/labs\/multiplicative-weights-core\.js"/);
  assert.match(chapter, /src="\.\.\/labs\/multiplicative-weights\.js"/);
  assert.match(chapter, /<section id="laboratory" class="atlas-block atlas-block--fullwidth"[\s\S]*data-atlas-lab="multiplicative-weights"/);
  assert.match(chapter, /data-atlas-block="proof"/);
  assert.match(chapter, /data-atlas-block="exercises"/);
});

test("chapter contains twelve exercises with separate hints and solutions", () => {
  assert.equal((chapter.match(/<article class="atlas-exercise">/g) || []).length, 12);
  assert.equal((chapter.match(/<details>/g) || []).length, 24);
  assert.equal((chapter.match(/<summary>Показать подсказку<\/summary>/g) || []).length, 12);
  assert.equal((chapter.match(/<summary>Показать решение<\/summary>/g) || []).length, 12);
});

test("production parser keeps substantial theory and valid math delimiters", () => {
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics, math_delimiter_errors",
    "import json",
    "p=Path.cwd()/'algorithmic_atlas'/'chapters'/'multiplicative-weights.html'",
    "parser=parse_page(p)",
    "print(json.dumps({'metrics':reading_metrics(parser),'errors':math_delimiter_errors(' '.join(parser.visible_text)),'outside':parser.display_math_outside_wrapper}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.metrics.words >= 3500, String(report.metrics.words));
  assert.ok(report.metrics.words <= 5000, String(report.metrics.words));
  assert.equal(report.metrics.formulaBlocks, 13);
  assert.ok(report.metrics.proofBlocks >= 1);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.outside, []);
});

test("display formulas have unique stable ids and exact notation coverage", () => {
  const ids = new Set();
  const formulas = formulaBlocks(chapter);
  assert.equal(formulas.length, 13);
  for (const formula of formulas) {
    const id = formula.match(/data-formula-id="([a-z0-9-]+)"/)?.[1];
    assert.ok(id, "formula id is missing");
    assert.ok(!ids.has(id), `duplicate formula id ${id}`);
    ids.add(id);
    assert.match(formula, /data-notation-coverage="interactive"/);
    const required = (formula.match(/data-required-notations="([a-z0-9,-]+)"/)?.[1] || "").split(",").filter(Boolean);
    assert.equal(new Set(required).size, required.length, `${id} duplicates required ids`);
    const actual = Array.from(new Set(Array.from(formula.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1]))).sort();
    assert.deepEqual(actual, required.slice().sort(), id);
  }
});

test("academic sources use direct safe links", () => {
  const links = Array.from(
    chapter.matchAll(/<a\b([^>]*href="https:\/\/[^">]+"[^>]*)>/g),
    (match) => match[1]
  );
  assert.ok(links.length >= 5);
  for (const attributes of links) {
    assert.match(attributes, /target="_blank"/);
    assert.match(attributes, /rel="noopener noreferrer"/);
  }
  assert.match(chapter, /https:\/\/doi\.org\/10\.1006\/jcss\.1997\.1504/);
  assert.match(chapter, /https:\/\/theoryofcomputing\.org\/articles\/v008a006\//);
});

test("laboratory adapter is bounded and every teaching control resets state", () => {
  const core = fs.readFileSync(path.join(atlasRoot, "labs/multiplicative-weights-core.js"), "utf8");
  const adapter = fs.readFileSync(path.join(atlasRoot, "labs/multiplicative-weights.js"), "utf8");
  assert.doesNotMatch(core + adapter, /\beval\s*\(|\bFunction\s*\(/);
  assert.match(adapter, /maxAutomaticSteps:\s*45/);
  assert.match(adapter, /runtime\.createShell\(root,/);
  assert.match(adapter, /AtlasLabRuntime/);
  assert.match(adapter, /AtlasLabSvg/);
  assert.match(adapter, /fields\.scenario\.addEventListener\("change", api\.reset\)/);
  assert.match(adapter, /\[fields\.eta, fields\.rounds\]/);
});
