const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const atlasRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(atlasRoot, "..");
const chapters = [
  {
    id: "dynamic-programming",
    title: "Динамическое программирование",
    formulaCount: 10,
    minimumWords: 3500,
    maximumWords: 5000,
    minimumSources: 4,
  },
  {
    id: "advanced-dynamic-programming",
    title: "Продвинутое динамическое программирование",
    formulaCount: 12,
    minimumWords: 3500,
    maximumWords: 5000,
    minimumSources: 6,
  },
];

function read(relativePath) {
  return fs.readFileSync(path.join(atlasRoot, relativePath), "utf8");
}

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div\s+class="[^"]*\batlas-math\b[^"]*"([\s\S]*?)<\/div>/g)
  ).map((match) => ({
    full: match[0],
    attributes: match[0].slice(0, match[0].indexOf(">") + 1),
    body: match[0].slice(match[0].indexOf(">") + 1, -6),
  }));
}

function requiredNotationIds(attributes) {
  const match = attributes.match(/\bdata-required-notations="([^"]*)"/);
  assert.ok(match, "display formula is missing data-required-notations");
  const ids = match[1].split(",").filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "duplicate required notation id");
  return new Set(ids);
}

test("chapters 4.7 and 4.8 use the existing page and full-width lab contract", () => {
  for (const chapter of chapters) {
    const html = read(`chapters/${chapter.id}.html`);
    assert.match(html, new RegExp(`data-atlas-node-id="${chapter.id}"`));
    assert.match(html, new RegExp(`<h1>${chapter.title}</h1>`));
    assert.match(html, /href="\.\.\/chapter\.css"/);
    assert.match(html, /href="\.\.\/labs\/lab-common\.css"/);
    assert.match(html, /src="\.\.\/labs\/lab-runtime\.js"/);
    assert.match(html, /src="\.\.\/labs\/lab-svg\.js"/);
    assert.match(
      html,
      new RegExp(
        `<section id="laboratory" class="atlas-block atlas-block--fullwidth"[\\s\\S]*data-atlas-lab="${chapter.id}"`
      )
    );
    assert.equal(
      (html.match(/<article class="atlas-exercise">/g) || []).length,
      12,
      `${chapter.id} exercise count`
    );
    assert.equal(
      (html.match(/<details>/g) || []).length,
      24,
      `${chapter.id} has a separate hint and solution for every exercise`
    );
    assert.match(html, /data-atlas-block="exercises"/);
  }
});
test("theory word counts use the production site parser", () => {
  const names = chapters.map(({ id }) => id);
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics",
    "import json",
    "root=Path.cwd()",
    `names=${JSON.stringify(names)}`,
    "print(json.dumps({n: reading_metrics(parse_page((root/'algorithmic_atlas'/'chapters'/(n+'.html')).resolve()))['words'] for n in names}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const counts = JSON.parse(result.stdout);
  for (const chapter of chapters) {
    assert.ok(
      counts[chapter.id] >= chapter.minimumWords,
      `${chapter.id}: ${counts[chapter.id]} < ${chapter.minimumWords}`
    );
    assert.ok(
      counts[chapter.id] <= chapter.maximumWords,
      `${chapter.id}: ${counts[chapter.id]} > ${chapter.maximumWords}`
    );
  }
});

test("every display formula has a stable id and exact notation-token coverage", () => {
  for (const chapter of chapters) {
    const formulas = formulaBlocks(read(`chapters/${chapter.id}.html`));
    assert.equal(formulas.length, chapter.formulaCount, chapter.id);
    const formulaIds = new Set();
    for (const formula of formulas) {
      const id = formula.attributes.match(/\bdata-formula-id="([a-z0-9-]+)"/)?.[1];
      assert.ok(id, `${chapter.id} formula is missing a stable id`);
      assert.ok(!formulaIds.has(id), `${chapter.id} duplicates formula id ${id}`);
      formulaIds.add(id);
      assert.match(formula.attributes, /\bdata-notation-coverage="interactive"/);
      const required = requiredNotationIds(formula.attributes);
      const tokens = new Set(
        Array.from(
          formula.body.matchAll(/notation-id-([a-z0-9-]+)/g),
          (match) => match[1]
        )
      );
      assert.deepEqual(tokens, required, `${chapter.id}/${id} notation mismatch`);
    }
  }
});

test("chapter sources are direct and open in a safe separate context", () => {
  for (const chapter of chapters) {
    const html = read(`chapters/${chapter.id}.html`);
    const links = Array.from(
      html.matchAll(/<a\b([^>]*\bhref="https:\/\/[^">]+"[^>]*)>/g),
      (match) => match[1]
    );
    assert.ok(links.length >= chapter.minimumSources, chapter.id);
    for (const attributes of links) {
      assert.match(attributes, /\btarget="_blank"/);
      assert.match(attributes, /\brel="noopener noreferrer"/);
    }
  }
});

test("laboratory code is bounded and never evaluates authored input", () => {
  for (const chapter of chapters) {
    const core = read(`labs/${chapter.id}-core.js`);
    const adapter = read(`labs/${chapter.id}.js`);
    assert.doesNotMatch(core + adapter, /\beval\s*\(|\bFunction\s*\(/);
    assert.match(adapter, /maxAutomaticSteps:\s*\d+/);
    assert.match(adapter, /runtime\.createShell\(root,/);
    assert.match(adapter, /AtlasLabRuntime/);
    assert.match(adapter, /AtlasLabSvg/);
  }
});
