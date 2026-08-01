const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const atlasRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(atlasRoot, "..");
const chapters = [
  {
    id: "sorting-and-lower-bounds",
    minimumWords: 3500,
    maximumWords: 5500,
    minimumExercises: 10,
  },
  {
    id: "selection-order-statistics",
    minimumWords: 2200,
    maximumWords: 3200,
    minimumExercises: 10,
  },
];

function read(relativePath) {
  return fs.readFileSync(path.join(atlasRoot, relativePath), "utf8");
}

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div class="atlas-math[^"]*"([\s\S]*?)>([\s\S]*?)<\/div>/g)
  ).map((match) => ({ attributes: match[1], body: match[2] }));
}

function mathErrors(source) {
  const errors = [];
  const delimiters = /\\\(|\\\)|\\\[|\\\]|\$\$|(?<!\\)\$/g;
  const rawCommand = /\\[A-Za-z]+/g;
  let mode = null;
  let previousEnd = 0;
  let match;

  function rawOutside(fragment) {
    if (rawCommand.test(fragment)) errors.push("raw TeX outside math");
    rawCommand.lastIndex = 0;
  }

  while ((match = delimiters.exec(source)) !== null) {
    if (mode === null) {
      rawOutside(source.slice(previousEnd, match.index));
      if (match[0] === "\\(") mode = "\\)";
      else if (match[0] === "\\[") mode = "\\]";
      else if (match[0] === "$") mode = "$";
      else if (match[0] === "$$") mode = "$$";
      else errors.push("closing delimiter without opener");
    } else if (match[0] === mode) {
      mode = null;
      previousEnd = delimiters.lastIndex;
    } else {
      errors.push("mismatched math delimiter");
    }
  }
  if (mode !== null) errors.push("unclosed math delimiter");
  else rawOutside(source.slice(previousEnd));
  return errors;
}

function visibleSource(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*?)?\/?>/g, " ");
}

test("sorting and selection chapters use the shared chapter and lab shell", () => {
  chapters.forEach(({ id, minimumExercises }) => {
    const html = read("chapters/" + id + ".html");
    assert.match(html, new RegExp('data-atlas-node-id="' + id + '"'));
    assert.match(html, /\.\.\/chapter\.css/);
    assert.match(html, /\.\.\/labs\/lab-common\.css/);
    assert.match(html, /\.\.\/labs\/lab-runtime\.js/);
    assert.match(html, /\.\.\/labs\/lab-svg\.js/);
    assert.match(html, new RegExp('data-atlas-lab="' + id + '"'));
    assert.match(html, /class="atlas-block atlas-block--fullwidth"/);
    assert.ok(
      (html.match(/<li><p>/g) || []).length >= minimumExercises,
      id + " has too few exercises"
    );
    assert.ok(
      (html.match(/<details><summary>Подсказка<\/summary>/g) || []).length >=
        minimumExercises,
      id + " has too few separate hints"
    );
    assert.ok(
      (html.match(/<details><summary>Решение<\/summary>/g) || []).length >=
        minimumExercises,
      id + " has too few separate solutions"
    );
    assert.ok(
      (html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 4,
      id + " has too few direct academic sources"
    );
    assert.deepEqual(mathErrors(visibleSource(html)), [], id + " exposes raw TeX");
  });
});

test("every display formula has reviewed metadata and matching interactive tokens", () => {
  chapters.forEach(({ id }) => {
    const html = read("chapters/" + id + ".html");
    const formulas = formulaBlocks(html);
    assert.ok(formulas.length >= 10, id + " needs substantial mathematical content");
    formulas.forEach(({ attributes, body }) => {
      assert.match(attributes, /\bdata-formula-id="[^"]+"/);
      assert.match(attributes, /\bdata-notation-coverage="interactive"/);
      const requiredMatch = attributes.match(/\bdata-required-notations="([^"]+)"/);
      assert.ok(requiredMatch, "missing required notation list");
      const required = new Set(requiredMatch[1].split(",").filter(Boolean));
      const tokens = new Set(
        Array.from(body.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1])
      );
      assert.deepEqual(tokens, required, "formula tokens do not match metadata");
    });
  });
});

test("theory word counts use the same parser as the site check", () => {
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics",
    "import json",
    "root=Path.cwd()",
    "names=['sorting-and-lower-bounds','selection-order-statistics']",
    "print(json.dumps({n: reading_metrics(parse_page((root/'algorithmic_atlas'/'chapters'/(n+'.html')).resolve()))['words'] for n in names}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const counts = JSON.parse(result.stdout);
  chapters.forEach(({ id, minimumWords, maximumWords }) => {
    assert.ok(counts[id] >= minimumWords, id + " is below its theory minimum");
    assert.ok(counts[id] <= maximumWords, id + " exceeds its theory maximum");
  });
});

test("laboratory code is deterministic, bounded and does not evaluate input", () => {
  chapters.forEach(({ id }) => {
    const core = read("labs/" + id + "-core.js");
    const adapter = read("labs/" + id + ".js");
    assert.doesNotMatch(core + adapter, /\beval\s*\(|\bFunction\s*\(/);
    assert.match(core, /seededRandom/);
    assert.match(adapter, /maxAutomaticSteps:\s*\d+/);
    assert.match(adapter, /AtlasLabRuntime/);
    assert.match(adapter, /AtlasLabSvg/);
  });
});
