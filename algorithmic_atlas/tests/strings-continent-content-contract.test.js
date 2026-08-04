const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, "data", "atlas-graph.json"), "utf8"));

const chapters = [
  ["6.1", "exact-string-matching"],
  ["6.2", "string-hashing-multiple-patterns"],
  ["6.3", "suffix-indexes"],
  ["6.4", "bwt-fm-index"],
  ["6.5", "edit-distance-lcs"],
  ["6.6", "lossless-compression"],
];

function readChapter(slug) {
  return fs.readFileSync(path.join(atlasRoot, "chapters", slug + ".html"), "utf8");
}

function theoryWords(source) {
  const article = source.match(/<article class="atlas-chapter-content">([\s\S]*?)<section id="laboratory"/);
  assert.ok(article, "chapter content must precede the laboratory");
  return article[1]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

test("all six canonical string chapters are published under stable ids", () => {
  const nodes = graph.nodes.filter(({ regionId }) => regionId === "string-algorithms");
  assert.equal(nodes.length, 6);
  for (const [curriculumId, slug] of chapters) {
    const node = nodes.find(({ id }) => id === slug);
    assert.ok(node, slug);
    assert.equal(node.curriculumId, curriculumId);
    assert.equal(node.publication, "published");
    assert.equal(node.route, "./chapters/" + slug + ".html");
  }
});

for (const [curriculumId, slug] of chapters) {
  test(curriculumId + " " + slug + " keeps the common long-form chapter contract", () => {
    const source = readChapter(slug);
    assert.match(source, new RegExp('data-atlas-node-id="' + slug + '"'));
    assert.match(source, /<h1>[^<]+<\/h1>/);
    assert.match(source, /class="atlas-chapter-intro">[^<]+[^.]<\/p>/);
    assert.match(source, /class="atlas-block atlas-block--fullwidth" data-atlas-block="lab"/);
    assert.match(source, new RegExp('data-atlas-lab="' + slug + '"'));
    assert.match(source, new RegExp('src="\.\./labs/' + slug + '-core\\.js"'));
    assert.match(source, new RegExp('src="\.\./labs/' + slug + '\\.js"'));
    assert.match(source, /id="atlas-route-previous"/);
    assert.match(source, /id="atlas-route-next"/);
    assert.match(source, /id="atlas-mark-complete"/);
    assert.ok((source.match(/class="atlas-exercise"/g) || []).length >= 10);
    assert.ok((source.match(/<li>[^<]*.*target="_blank" rel="noopener noreferrer"/g) || []).length >= 4);
    assert.ok(theoryWords(source) >= 2500, slug + " theory must contain at least 2500 words");
  });
}

test("string laboratories load the shared styles and sequence runtime where used", () => {
  const sequenceRuntimeChapters = new Set([
    "exact-string-matching",
    "string-hashing-multiple-patterns",
    "bwt-fm-index",
    "edit-distance-lcs",
    "lossless-compression",
  ]);
  for (const [, slug] of chapters) {
    const source = readChapter(slug);
    assert.match(source, /href="\.\.\/labs\/strings-geometry-numerics-labs\.css"/);
    if (sequenceRuntimeChapters.has(slug)) {
      assert.match(source, /src="\.\.\/labs\/sequence-lab-runtime\.js"/);
    } else {
      assert.doesNotMatch(source, /src="\.\.\/labs\/sequence-lab-runtime\.js"/);
    }
  }
});

test("corrected string formulas state the intended mathematical contracts", () => {
  const exact = readChapter("exact-string-matching");
  assert.match(exact, /началом \$i-m\$: индекс \$i\$ уже указывает на следующий непрочитанный символ/);
  assert.doesNotMatch(exact, /началом \$i-m\+1\$/);

  const hashing = readChapter("string-hashing-multiple-patterns");
  assert.ok(hashing.includes("notation-id-string-hash-base-b}{b}^{i}"));
  assert.doesNotMatch(hashing, /\^\{,i\}/);

  const suffixes = readChapter("suffix-indexes");
  const interval = suffixes.match(/<div id="suffix-automaton-length-interval"[\s\S]*?<\/div>/);
  assert.ok(interval);
  assert.doesNotMatch(interval[0], /Longleftrightarrow/);
  assert.ok(interval[0].includes("\\left\\{|x|:x\\text{ принадлежит классу состояния }"));

  const compressionAdapter = fs.readFileSync(
    path.join(atlasRoot, "labs", "lossless-compression.js"), "utf8"
  );
  assert.match(compressionAdapter, /известной длиной сообщения либо специальным символом конца/);
});
