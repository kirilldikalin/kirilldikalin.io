const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const graph = JSON.parse(
  fs.readFileSync(path.join(atlasRoot, "data/atlas-graph.json"), "utf8")
);
const curriculum = fs.readFileSync(
  path.join(atlasRoot, "docs/curriculum.md"),
  "utf8"
);

const complexChapters = new Set([
  "hash-tables",
  "balanced-search-trees",
  "priority-queues-heaps",
  "disjoint-set-union",
  "b-trees-external-memory",
  "range-query-structures",
  "persistent-succinct-structures",
  "probabilistic-filters",
  "lsm-learned-indexes",
]);

function canonicalStructures() {
  const continent = curriculum.match(
    /## 03\. Структуры данных([\s\S]*?)(?=\n---\n\n## 04\.)/
  );
  assert.ok(continent, "curriculum has no continent 03 section");
  const pattern =
    /^\d+\.\s+\x60(3\.\d+)\x60\s+\*\*(.+?)\*\*\s+—\s+(ядро|ветвь)\s*$/gm;
  return Array.from(continent[1].matchAll(pattern), (match) => ({
    curriculumId: match[1],
    title: match[2],
    kind: match[3] === "ядро" ? "core" : "branch",
  }));
}

function routeIds(routeId) {
  const route = graph.routes.find(({ id }) => id === routeId);
  assert.ok(route, "missing route " + routeId);
  return route.entries
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ nodeId }) => nodeId);
}

test("continent 03 publishes exactly the thirteen canonical chapters", () => {
  const expected = canonicalStructures();
  assert.equal(expected.length, 13);
  assert.equal(expected.filter(({ kind }) => kind === "core").length, 7);
  assert.equal(expected.filter(({ kind }) => kind === "branch").length, 6);

  const actual = graph.nodes
    .filter(({ continentId }) => continentId === "data-structures")
    .sort((left, right) => {
      return Number(left.curriculumId.split(".")[1]) -
        Number(right.curriculumId.split(".")[1]);
    });
  assert.deepEqual(
    actual.map(({ curriculumId }) => curriculumId),
    expected.map(({ curriculumId }) => curriculumId)
  );
  actual.forEach((node, index) => {
    assert.equal(node.title, expected[index].title);
    assert.equal(node.publication, "published");
    assert.equal(node.allowFreeExplore, true);
    assert.match(node.route, /^\.\/chapters\/[a-z0-9-]+\.html$/);
    assert.deepEqual(node.features, {
      proof: true,
      interactive: true,
      exercises: true,
    });
  });
});

test("continent 03 routes and continuations match the curriculum", () => {
  assert.deepEqual(routeIds("data-structures-main"), [
    "linear-data-structures",
    "hash-tables",
    "balanced-search-trees",
    "priority-queues-heaps",
    "disjoint-set-union",
    "b-trees-external-memory",
    "range-query-structures",
  ]);
  assert.deepEqual(routeIds("data-structures-augmented"), [
    "augmented-search-trees",
  ]);
  assert.deepEqual(routeIds("data-structures-randomized"), [
    "randomized-data-structures",
  ]);
  assert.deepEqual(routeIds("data-structures-prefix-persistence"), [
    "tries-radix-trees",
    "persistent-succinct-structures",
  ]);
  assert.deepEqual(routeIds("data-structures-filters"), [
    "probabilistic-filters",
  ]);
  assert.deepEqual(routeIds("data-structures-storage"), [
    "lsm-learned-indexes",
  ]);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.deepEqual(byId.get("linear-data-structures").prerequisites, [
    "polynomial-efficiency",
  ]);
  assert.deepEqual(byId.get("augmented-search-trees").prerequisites, [
    "balanced-search-trees",
  ]);
  assert.deepEqual(byId.get("randomized-data-structures").prerequisites, [
    "hash-tables",
  ]);
  assert.deepEqual(byId.get("tries-radix-trees").prerequisites, [
    "range-query-structures",
  ]);
  assert.deepEqual(byId.get("persistent-succinct-structures").prerequisites, [
    "tries-radix-trees",
  ]);
  assert.deepEqual(byId.get("probabilistic-filters").prerequisites, [
    "hash-tables",
  ]);
  assert.deepEqual(byId.get("lsm-learned-indexes").prerequisites, [
    "b-trees-external-memory",
  ]);

  const continuation = (routeId) =>
    graph.routes.find(({ id }) => id === routeId).continuation;
  assert.equal(continuation("data-structures-main").curriculumId, "4.1");
  assert.equal(continuation("data-structures-main").kind, "route");
  assert.equal(continuation("data-structures-randomized").curriculumId, "7.3");
  assert.equal(continuation("data-structures-prefix-persistence").curriculumId, "6.3");
  assert.equal(continuation("data-structures-filters").curriculumId, "9.8");
  assert.equal(continuation("data-structures-storage").curriculumId, "9.13");
});

test("every structures chapter uses the shared chapter and laboratory contracts", () => {
  const nodes = graph.nodes.filter(
    ({ continentId }) => continentId === "data-structures"
  );
  nodes.forEach((node) => {
    const file = path.join(atlasRoot, node.route.replace(/^\.\//, ""));
    const html = fs.readFileSync(file, "utf8");
    assert.match(
      html,
      new RegExp('<body[^>]+data-atlas-node-id="' + node.id + '"')
    );
    assert.match(html, /class="atlas-chapter-toc"/);
    assert.match(html, /id="atlas-route-previous"/);
    assert.match(html, /id="atlas-route-next"/);
    assert.match(html, /id="atlas-mark-complete"/);
    assert.match(html, new RegExp('data-atlas-lab="' + node.id + '"'));
    assert.match(html, /labs\/lab-runtime\.js/);
    assert.match(html, /labs\/lab-svg\.js/);
    assert.match(html, /labs\/lab-common\.css/);
    assert.match(html, /labs\/data-structures-labs\.css/);
    assert.match(html, new RegExp("labs/" + node.id + "-core\\.js"));
    assert.match(html, new RegExp("labs/" + node.id + "\\.js"));
    assert.ok(
      (html.match(/class="atlas-exercise"/g) || []).length >= 10,
      node.id + " must have at least ten exercises"
    );
    assert.ok(
      (html.match(/<li>[^]*?<a href="https?:\/\//g) || []).length >= 4,
      node.id + " must cite at least four direct sources"
    );
    assert.match(html, /notation-id-[a-z0-9-]+/);

    const intro = html.match(
      /<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/
    );
    assert.ok(intro, node.id + " has no chapter intro");
    const introText = intro[1].replace(/<[^>]+>/g, "").trim();
    assert.doesNotMatch(
      introText,
      /[.!?…]$/,
      node.id + " short intro must not end with punctuation"
    );
  });
});

test("derived reading metadata reflects the required chapter depth", () => {
  const nodes = graph.nodes.filter(
    ({ continentId }) => continentId === "data-structures"
  );
  nodes.forEach((node) => {
    assert.ok(node.reading, node.id + " has no derived reading metadata");
    const minimumWords = complexChapters.has(node.id) ? 3500 : 2200;
    assert.ok(
      node.reading.words >= minimumWords,
      node.id + " has only " + node.reading.words + " theory words"
    );
    const expectedTheory = Math.ceil(
      node.reading.words / 180 +
      0.35 * node.reading.formulaBlocks +
      0.75 * node.reading.proofBlocks
    );
    assert.equal(node.reading.theoryMinutes, expectedTheory);
    assert.ok(node.reading.labMinutes >= 8);
    assert.equal(
      node.minutes,
      node.reading.theoryMinutes + node.reading.labMinutes
    );
  });
});

test("structures laboratory code stays deterministic and avoids dynamic execution", () => {
  const nodes = graph.nodes.filter(
    ({ continentId }) => continentId === "data-structures"
  );
  nodes.forEach((node) => {
    ["-core.js", ".js"].forEach((suffix) => {
      const source = fs.readFileSync(
        path.join(atlasRoot, "labs", node.id + suffix),
        "utf8"
      );
      assert.doesNotMatch(source, /\beval\s*\(/, node.id + " uses eval");
      assert.doesNotMatch(
        source,
        /\bnew\s+Function\s*\(/,
        node.id + " uses dynamic Function"
      );
    });
  });
});
