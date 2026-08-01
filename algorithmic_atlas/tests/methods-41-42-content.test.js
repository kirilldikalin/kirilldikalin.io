const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

const CHAPTERS = [
  {
    id: "exhaustive-search",
    title: "Полный перебор, backtracking и branch and bound",
    minWords: 2200,
    maxWords: 3200,
    formulaCount: 8,
    core: "exhaustive-search-core.js",
    dom: "exhaustive-search.js",
  },
  {
    id: "divide-and-conquer",
    title: "Разделяй и властвуй",
    minWords: 3500,
    maxWords: 5500,
    formulaCount: 12,
    core: "divide-and-conquer-core.js",
    dom: "divide-and-conquer.js",
  },
];

function sourceFor(id) {
  return fs.readFileSync(
    path.join(ROOT, "algorithmic_atlas/chapters", `${id}.html`),
    "utf8"
  );
}

function withoutExcludedSections(source) {
  const excluded = new Set(["laboratory", "exercises", "sources"]);
  const tag = /<\/?section\b[^>]*>/gi;
  const stack = [];
  const chunks = [];
  let cursor = 0;
  let excludedDepth = 0;
  let match;

  while ((match = tag.exec(source)) !== null) {
    if (excludedDepth === 0) chunks.push(source.slice(cursor, match.index));
    const closing = /^<\//.test(match[0]);
    if (closing) {
      const wasExcluded = stack.pop() || false;
      if (wasExcluded) excludedDepth -= 1;
    } else {
      const id = /\bid="([^"]+)"/.exec(match[0])?.[1];
      const isExcluded = excludedDepth > 0 || excluded.has(id);
      stack.push(isExcluded);
      if (isExcluded) excludedDepth += 1;
    }
    cursor = tag.lastIndex;
  }
  if (excludedDepth === 0) chunks.push(source.slice(cursor));
  return chunks.join(" ");
}

function visibleText(source) {
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|shy);/g, " ")
    .replace(/&(?:lt|gt|amp|quot);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countRussianTheoryWords(source) {
  const theory = visibleText(withoutExcludedSections(source));
  return theory.match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-‑–—'][A-Za-zА-Яа-яЁё0-9]+)*/g)?.length || 0;
}

function mathWrappers(source) {
  return Array.from(
    source.matchAll(/<div\b([^>]*\bclass="[^"]*\batlas-math\b[^"]*"[^>]*)>/g),
    (match) => match[1]
  );
}

function textOutsideMath(source) {
  return visibleText(
    source
      .replace(/\\\[[\s\S]*?\\\]/g, " ")
      .replace(/\$[^$]*\$/g, " ")
  );
}

test("chapters 4.1 and 4.2 keep the canonical page and laboratory contract", () => {
  for (const chapter of CHAPTERS) {
    const html = sourceFor(chapter.id);
    assert.match(html, new RegExp(`data-atlas-node-id="${chapter.id}"`));
    assert.match(html, new RegExp(`<h1>${chapter.title}</h1>`));
    assert.match(html, new RegExp(`labs/${chapter.core.replace(".", "\\.")}`));
    assert.match(html, new RegExp(`labs/${chapter.dom.replace(".", "\\.")}`));
    const labScript = fs.readFileSync(
      path.join(ROOT, "algorithmic_atlas/labs", chapter.dom),
      "utf8"
    );
    assert.match(html, /href="\.\.\/labs\/lab-common\.css"/);
    assert.match(labScript, /runtime\.createShell\(root,/);
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
  }
});

test("both theory texts stay inside the agreed editorial ranges", () => {
  for (const chapter of CHAPTERS) {
    const words = countRussianTheoryWords(sourceFor(chapter.id));
    assert.ok(words >= chapter.minWords, `${chapter.id}: ${words} < ${chapter.minWords}`);
    assert.ok(words <= chapter.maxWords, `${chapter.id}: ${words} > ${chapter.maxWords}`);
  }
});

test("every display formula has stable metadata for in-formula notation", () => {
  for (const chapter of CHAPTERS) {
    const wrappers = mathWrappers(sourceFor(chapter.id));
    assert.equal(wrappers.length, chapter.formulaCount, chapter.id);
    for (const attributes of wrappers) {
      assert.match(attributes, /\bdata-formula-id="[a-z0-9-]+"/);
      assert.match(attributes, /\bdata-notation-coverage="interactive"/);
      assert.match(attributes, /\bdata-required-notations="[a-z0-9,-]+"/);
    }
  }
});

test("visible prose contains no raw TeX commands outside math delimiters", () => {
  for (const chapter of CHAPTERS) {
    const text = textOutsideMath(sourceFor(chapter.id));
    assert.doesNotMatch(text, /\\[A-Za-z]+/, chapter.id);
  }
});

test("external references use a separate safe browser context", () => {
  for (const chapter of CHAPTERS) {
    const html = sourceFor(chapter.id);
    const externalLinks = Array.from(
      html.matchAll(/<a\b([^>]*\bhref="https:\/\/[^">]+"[^>]*)>/g),
      (match) => match[1]
    );
    assert.ok(externalLinks.length >= 4, chapter.id);
    for (const attributes of externalLinks) {
      assert.match(attributes, /\btarget="_blank"/);
      assert.match(attributes, /\brel="noopener noreferrer"/);
    }
  }
});

test("laboratory scripts do not evaluate user-authored code", () => {
  for (const chapter of CHAPTERS) {
    for (const file of [chapter.core, chapter.dom]) {
      const source = fs.readFileSync(
        path.join(ROOT, "algorithmic_atlas/labs", file),
        "utf8"
      );
      assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
    }
  }
});
