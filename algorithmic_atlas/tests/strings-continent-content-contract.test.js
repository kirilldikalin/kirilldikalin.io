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
    const minimumWords = ["string-hashing-multiple-patterns", "suffix-indexes",
      "bwt-fm-index", "edit-distance-lcs"].includes(slug) ? 4000 : 2500;
    assert.ok(theoryWords(source) >= minimumWords,
      slug + " theory must contain at least " + minimumWords + " words");
    assert.match(source, /<pre\b[^>]*>[\s\S]*?<code\b[^>]*>[\s\S]+<\/code>\s*<\/pre>/,
      slug + " must include structured pseudocode");
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

test("all six laboratories expose the required explanatory views", () => {
  const exact = fs.readFileSync(path.join(atlasRoot, "labs", "exact-string-matching.js"), "utf8");
  assert.match(exact, /option value="prefix">Префикс-функция/);

  const hashing = fs.readFileSync(path.join(atlasRoot, "labs", "string-hashing-multiple-patterns.js"), "utf8");
  assert.match(hashing, /data-powers/);
  assert.match(hashing, /Степенные вклады текущего окна/);

  const suffixes = fs.readFileSync(path.join(atlasRoot, "labs", "suffix-indexes.js"), "utf8");
  assert.doesNotMatch(suffixes, /data-field="mode"/);
  assert.match(suffixes, /Пять синхронных суффиксных представлений/);
  assert.match(suffixes, /Сжатое суффиксное дерево/);
  assert.match(suffixes, /Суффиксный автомат/);

  const bwt = fs.readFileSync(path.join(atlasRoot, "labs", "bwt-fm-index.js"), "utf8");
  assert.match(bwt, /LF\(" \+ lfSource/);
  assert.match(bwt, /isFirst/);
  assert.match(bwt, /isLast/);

  const edit = fs.readFileSync(path.join(atlasRoot, "labs", "edit-distance-lcs.js"), "utf8");
  for (const mode of ["edit", "lcs", "global", "local"]) {
    assert.match(edit, new RegExp('option value="' + mode + '"'));
  }
  for (const field of ["insert", "delete", "substitute", "match", "mismatch", "gap"]) {
    assert.match(edit, new RegExp('data-field="' + field + '"'));
  }

  const compression = fs.readFileSync(path.join(atlasRoot, "labs", "lossless-compression.js"), "utf8");
  assert.match(compression, /offset=[\s\S]*length=[\s\S]*next=/);
  assert.match(compression, /option value="lz78">LZ78/);
  assert.match(compression, /drawLz78/);
});

test("advanced string topics and their primary sources remain explicit", () => {
  const bwt = readChapter("bwt-fm-index");
  assert.match(bwt, /id="read-alignment"/);
  assert.match(bwt, /выравнивании чтений/);

  const edit = readChapter("edit-distance-lcs");
  assert.match(edit, /Укконен/);
  assert.match(edit, /Strong Exponential Time Hypothesis/);
  assert.match(edit, /10\.1145\/2746539\.2746612/);

  const compression = readChapter("lossless-compression");
  assert.match(compression, /id="lz78"/);
  assert.match(compression, /\$\(dictionaryIndex,nextSymbol\)\$/);
  assert.match(compression, /\$\(offset,length,nextSymbol\)\$/);
  assert.match(compression, /10\.1109\/TIT\.1978\.1055934/);

  const exact = readChapter("exact-string-matching");
  assert.match(exact, /Exact String Matching: The Fundamental String Algorithms/);
  assert.match(exact, /10\.1016\/0196-6774\(84\)90021-X/);
});
