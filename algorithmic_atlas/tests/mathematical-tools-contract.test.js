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

function canonicalChapters() {
  const pattern =
    /^\d+\.\s+\x60(\d+\.\d+)\x60\s+\*\*(.+?)\*\*(?:\s+—\s+(ядро|ветвь))?\s*$/gm;
  return Array.from(curriculum.matchAll(pattern), (match) => ({
    id: match[1],
    title: match[2],
    kind: match[3] === "ветвь" ? "branch" : "core",
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

test("the graph is a published subset of the 113 canonical curriculum chapters", () => {
  const chapters = canonicalChapters();
  assert.equal(chapters.length, 113);
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  assert.equal(byId.size, 113, "curriculum chapter ids must be unique");
  assert.equal(
    chapters.filter(({ kind }) => kind === "core").length,
    77
  );
  assert.equal(
    chapters.filter(({ kind }) => kind === "branch").length,
    36
  );

  graph.nodes.forEach((node) => {
    const canonical = byId.get(node.curriculumId);
    assert.ok(canonical, "unplanned graph node " + node.curriculumId);
    assert.equal(node.title, canonical.title);
  });
});

test("continent 02 contains exactly its eleven canonical published chapters", () => {
  const expected = canonicalChapters().filter(({ id }) => id.startsWith("2."));
  assert.equal(expected.length, 11);
  const actual = graph.nodes
    .filter(({ continentId }) => continentId === "mathematical-tools")
    .sort((left, right) => {
      return Number(left.curriculumId.split(".")[1]) -
        Number(right.curriculumId.split(".")[1]);
    });
  assert.deepEqual(
    actual.map(({ curriculumId }) => curriculumId),
    expected.map(({ id }) => id)
  );
  actual.forEach((node, index) => {
    assert.equal(node.title, expected[index].title);
    assert.equal(node.publication, "published");
    assert.match(node.route, /^\.\/chapters\/[a-z0-9-]+\.html$/);
    assert.equal(node.features.proof, true);
    assert.equal(node.features.interactive, true);
    assert.equal(node.features.exercises, true);
  });
});

test("continent 02 main route, probability branch, gates and exits match curriculum", () => {
  assert.deepEqual(routeIds("mathematical-tools-main"), [
    "growth-rates",
    "sums-products-recurrences",
    "sets-relations-functions-logic",
    "proof-methods-induction",
    "correctness-invariants-termination",
    "computation-models",
    "analysis-cases",
    "polynomial-efficiency",
  ]);
  assert.deepEqual(routeIds("mathematical-tools-probability"), [
    "combinatorics-counting",
    "probability-spaces",
    "random-variables-concentration",
  ]);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.deepEqual(byId.get("growth-rates").prerequisites, [
    "asymptotic-estimates",
  ]);
  assert.deepEqual(byId.get("combinatorics-counting").prerequisites, [
    "sets-relations-functions-logic",
  ]);
  assert.deepEqual(byId.get("probability-spaces").prerequisites, [
    "combinatorics-counting",
  ]);
  assert.deepEqual(byId.get("random-variables-concentration").prerequisites, [
    "probability-spaces",
  ]);

  const main = graph.routes.find(({ id }) => id === "mathematical-tools-main");
  const branch = graph.routes.find(
    ({ id }) => id === "mathematical-tools-probability"
  );
  assert.equal(main.continuation, undefined);
  assert.deepEqual(byId.get("linear-data-structures").prerequisites, [
    "polynomial-efficiency",
  ]);
  assert.equal(branch.continuation.curriculumId, "7.1");
  assert.equal(branch.continuation.kind, "related");
});

test("every mathematical-tools page uses the shared chapter and lab contracts", () => {
  const nodes = graph.nodes.filter(
    ({ continentId }) => continentId === "mathematical-tools"
  );
  nodes.forEach((node) => {
    const file = path.join(atlasRoot, node.route.replace(/^\.\//, ""));
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /<body[^>]+data-atlas-node-id="[^"]+"/);
    assert.match(html, /class="atlas-chapter-toc"/);
    assert.match(html, /id="atlas-route-previous"/);
    assert.match(html, /id="atlas-route-next"/);
    assert.match(html, /id="atlas-mark-complete"/);
    assert.match(
      html,
      new RegExp('data-atlas-lab="' + node.id + '"')
    );
    assert.match(html, /labs\/lab-runtime\.js/);
    assert.match(html, /labs\/lab-svg\.js/);
    assert.match(html, /labs\/mathematical-tools-core\.js/);
    assert.match(html, /labs\/lab-common\.css/);
    assert.match(html, /labs\/mathematical-tools-labs\.css/);
    assert.match(html, new RegExp("labs/" + node.id + "-core\\.js"));
    assert.match(html, new RegExp("labs/" + node.id + "\\.js"));
    assert.ok(
      (html.match(/class="atlas-exercise"/g) || []).length >= 8,
      node.id + " must have at least eight exercises"
    );
    assert.match(html, /class="atlas-sources"/);
    assert.match(
      html,
      /notation-id-[a-z0-9-]+/,
      node.id + " must annotate at least one key formula token"
    );

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
