const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const atlasRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(atlasRoot, "..");
const chapters = [
  { id: "local-search", minimumWords: 2200, maximumWords: 3400 },
  { id: "meet-in-the-middle", minimumWords: 2200, maximumWords: 3400 },
];

function read(relativePath) {
  return fs.readFileSync(path.join(atlasRoot, relativePath), "utf8");
}

function visibleSource(html) {
  return html
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
    } else {
      errors.push("mismatched delimiter");
    }
  }
  if (mode !== null) errors.push("unclosed math delimiter");
  else rawOutside(source.slice(previousEnd));
  return errors;
}

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div class="atlas-math[^"]*"([\s\S]*?)>([\s\S]*?)<\/div>/g)
  ).map((match) => ({ attributes: match[1], body: match[2] }));
}

function malformedMathCommands(source) {
  const errors = [];
  const fragments =
    /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|(?<!\\)\$(?!\$)([\s\S]*?)(?<!\\)\$(?!\$)/g;
  const missingSlash =
    /(?<![\\A-Za-z])(class|operatorname|lfloor|rfloor|lceil|rceil|frac|Theta|Omega|leq|geq|times|cdot|sqrt|infty|mathbb|mathcal|exp|arg|max)(?=[{_\s\\0-9A-Z(])/g;
  let fragment;
  while ((fragment = fragments.exec(source)) !== null) {
    const tex = fragment.slice(1).find((value) => value !== undefined);
    let command;
    missingSlash.lastIndex = 0;
    while ((command = missingSlash.exec(tex)) !== null) {
      errors.push("possible missing slash: " + command[1]);
    }
  }
  return errors;
}

test("chapters 4.9 and 4.10 use the shared full-width chapter contract", () => {
  chapters.forEach(({ id }) => {
    const html = read("chapters/" + id + ".html");
    assert.match(html, new RegExp('data-atlas-node-id="' + id + '"'));
    assert.match(html, /\.\.\/chapter\.css/);
    assert.match(html, /\.\.\/labs\/lab-common\.css/);
    assert.match(html, /\.\.\/labs\/lab-runtime\.js/);
    assert.match(html, /\.\.\/labs\/lab-svg\.js/);
    assert.match(html, new RegExp('data-atlas-lab="' + id + '"'));
    assert.match(html, /class="atlas-block atlas-block--fullwidth"/);
    assert.match(html, /id="exercises"[^>]+data-atlas-block="exercises"/);
    assert.equal((html.match(/<details><summary>Подсказка<\/summary>/g) || []).length, 10);
    assert.equal((html.match(/<details><summary>Решение<\/summary>/g) || []).length, 10);
    assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 4);
    assert.deepEqual(mathErrors(visibleSource(html)), [], id + " exposes raw TeX");
    assert.deepEqual(
      malformedMathCommands(visibleSource(html)),
      [],
      id + " contains a likely malformed TeX command"
    );
    assert.doesNotMatch(
      html.match(/<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/)[1].trim(),
      /[.!?…]$/
    );
  });
});

test("every new display formula has metadata and matching notation hooks", () => {
  chapters.forEach(({ id }) => {
    const formulas = formulaBlocks(read("chapters/" + id + ".html"));
    assert.ok(formulas.length >= 10);
    formulas.forEach(({ attributes, body }) => {
      assert.match(attributes, /data-formula-id="[^"]+"/);
      assert.match(attributes, /data-notation-coverage="interactive"/);
      const requiredMatch = attributes.match(/data-required-notations="([^"]+)"/);
      assert.ok(requiredMatch);
      const required = new Set(requiredMatch[1].split(",").filter(Boolean));
      const tokens = new Set(
        Array.from(body.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1])
      );
      assert.deepEqual(tokens, required);
    });
  });
});

test("theory depth is measured by the production parser with hidden answers excluded", () => {
  const names = chapters.map(({ id }) => id);
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics",
    "import json",
    "root=Path.cwd()",
    "names=" + JSON.stringify(names),
    "print(json.dumps({n: reading_metrics(parse_page((root/'algorithmic_atlas'/'chapters'/(n+'.html')).resolve()))['words'] for n in names}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const counts = JSON.parse(result.stdout);
  chapters.forEach(({ id, minimumWords, maximumWords }) => {
    assert.ok(counts[id] >= minimumWords, id + " is below the chapter minimum");
    assert.ok(counts[id] <= maximumWords, id + " exceeds the ordinary-depth maximum");
  });
});

test("laboratories are bounded and never execute user-authored expressions", () => {
  chapters.forEach(({ id }) => {
    const core = read("labs/" + id + "-core.js");
    const adapter = read("labs/" + id + ".js");
    assert.doesNotMatch(core + adapter, /\beval\s*\(|\bFunction\s*\(/);
    assert.match(adapter, /maxAutomaticSteps:\s*\d+/);
    assert.match(adapter, /AtlasLabRuntime/);
    assert.match(adapter, /AtlasLabSvg/);
  });
  assert.match(read("labs/local-search-core.js"), /seededRandom/);
  assert.match(read("labs/meet-in-the-middle-core.js"), /\bBigInt\b/);
});
