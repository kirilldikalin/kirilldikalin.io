const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const atlasRoot = path.join(__dirname, "..");
const core = require("../atlas-core.js");
const graph = core.validateGraph(JSON.parse(fs.readFileSync(
  path.join(atlasRoot, "data/atlas-graph.json"),
  "utf8"
)));
const curriculum = fs.readFileSync(
  path.join(atlasRoot, "docs/curriculum.md"),
  "utf8"
);
const publishedChapterIds = new Set([
  "exhaustive-search",
  "divide-and-conquer",
  "sorting-and-lower-bounds",
  "selection-order-statistics",
  "greedy-algorithms",
  "matroids",
  "dynamic-programming",
  "advanced-dynamic-programming",
  "local-search",
  "meet-in-the-middle",
  "online-algorithms",
  "reductions-and-formulations",
]);

function canonicalAlgorithmDesign() {
  const section = curriculum.match(
    /## 04\. Методы построения алгоритмов([\s\S]*?)(?=\n---\n\n## 05\.)/
  );
  assert.ok(section, "curriculum has no continent 04 section");
  const pattern =
    /^\d+\.\s+\x60(4\.\d+)\x60\s+\*\*(.+?)\*\*\s+—\s+(ядро|ветвь)\s*$/gm;
  return Array.from(section[1].matchAll(pattern), (match) => ({
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

test("continent 04 is a published shell for exactly fourteen canonical chapters", () => {
  const expected = canonicalAlgorithmDesign();
  assert.equal(expected.length, 14);
  assert.equal(expected.filter(({ kind }) => kind === "core").length, 9);
  assert.equal(expected.filter(({ kind }) => kind === "branch").length, 5);

  const continent = core.continentMap(graph).get("algorithm-design");
  assert.equal(continent.publication, "published");
  assert.equal(continent.regions.length, 4);
  assert.ok(continent.localMap);

  const actual = core.visibleNodes(graph, "algorithm-design")
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
    const published = publishedChapterIds.has(node.id);
    assert.equal(node.publication, published ? "published" : "planned");
    if (published) {
      assert.equal(node.route, "./chapters/" + node.id + ".html");
      assert.ok(node.reading);
      assert.deepEqual(node.features, {
        proof: true,
        interactive: true,
        exercises: true,
      });
      assert.equal(
        core.nodeAccessState(graph, node, new Set(), true),
        "published-unlocked"
      );
    } else {
      assert.equal(node.route, null);
      assert.equal(node.reading, null);
      assert.deepEqual(node.features, {
        proof: false,
        interactive: false,
        exercises: false,
      });
      assert.equal(
        core.nodeAccessState(graph, node, new Set(), true),
        "planned"
      );
    }
  });
});

test("continent 04 routes and branch dependencies match the curriculum", () => {
  assert.deepEqual(routeIds("algorithm-design-main"), [
    "exhaustive-search",
    "divide-and-conquer",
    "sorting-and-lower-bounds",
    "selection-order-statistics",
    "greedy-algorithms",
    "dynamic-programming",
    "local-search",
    "online-algorithms",
    "reductions-and-formulations",
  ]);
  assert.deepEqual(routeIds("algorithm-design-matroids"), ["matroids"]);
  assert.deepEqual(routeIds("algorithm-design-advanced-dp"), [
    "advanced-dynamic-programming",
  ]);
  assert.deepEqual(routeIds("algorithm-design-meet-in-the-middle"), [
    "meet-in-the-middle",
  ]);
  assert.deepEqual(routeIds("algorithm-design-optimization"), [
    "linear-convex-optimization",
    "multiplicative-weights",
  ]);

  const byId = core.nodeMap(graph);
  assert.deepEqual(byId.get("exhaustive-search").prerequisites, [
    "range-query-structures",
  ]);
  assert.deepEqual(byId.get("matroids").prerequisites, ["greedy-algorithms"]);
  assert.deepEqual(byId.get("advanced-dynamic-programming").prerequisites, [
    "dynamic-programming",
  ]);
  assert.deepEqual(byId.get("meet-in-the-middle").prerequisites, [
    "exhaustive-search",
  ]);
  assert.deepEqual(byId.get("linear-convex-optimization").prerequisites, [
    "reductions-and-formulations",
  ]);
  assert.deepEqual(byId.get("multiplicative-weights").prerequisites, [
    "linear-convex-optimization",
  ]);

  const edges = core.graphEdges(graph, "algorithm-design");
  const edge = (sourceId, targetId) => edges.find((item) =>
    item.sourceId === sourceId && item.targetId === targetId
  );
  assert.equal(edge("greedy-algorithms", "matroids").kind, "branch");
  assert.equal(edge(
    "dynamic-programming",
    "advanced-dynamic-programming"
  ).kind, "branch");
  assert.equal(edge("exhaustive-search", "meet-in-the-middle").kind, "branch");
  assert.equal(edge(
    "reductions-and-formulations",
    "linear-convex-optimization"
  ).kind, "branch");
  assert.equal(edge(
    "linear-convex-optimization",
    "multiplicative-weights"
  ).kind, "route");
});

test("continent 04 exposes only the seven canonical future exits", () => {
  const continuations = core.continentContinuations(graph, "algorithm-design");
  const byCurriculumId = new Map(continuations.map((item) => [
    item.continuation.curriculumId,
    item,
  ]));
  assert.deepEqual(
    Array.from(byCurriculumId.keys()).sort(),
    ["5.1", "5.5", "6.5", "7.13", "8.14", "8.4", "8.9"].sort()
  );
  assert.equal(byCurriculumId.get("5.1").continuation.kind, "route");
  ["5.5", "6.5", "7.13", "8.4", "8.9", "8.14"].forEach((id) => {
    assert.equal(byCurriculumId.get(id).continuation.kind, "related");
  });
  assert.equal(byCurriculumId.get("8.4").source.id, "reductions-and-formulations");
  assert.equal(byCurriculumId.get("8.14").source.id, "reductions-and-formulations");
  assert.equal(
    graph.routes.find(({ id }) => id === "data-structures-main").continuation,
    undefined
  );
});

test("published chapters enter progress while planned chapters stay outside", () => {
  assert.equal(core.continentCoreNodeIds(graph, "algorithm-design").length, 9);
  assert.deepEqual(
    core.continentProgressSummary(graph, "algorithm-design", new Set()),
    {
      completed: 0,
      total: 12,
      percent: 0,
      coreCompleted: 0,
      coreTotal: 9,
      branchCompleted: 0,
      branchTotal: 3,
      coreReady: false,
      complete: false,
    }
  );
  assert.equal(
    core.progressSummary(graph, new Set()).total,
    41
  );
});

test("all continent 04 nodes and exits stay inside its local viewBox", () => {
  const continent = core.continentMap(graph).get("algorithm-design");
  const [minX, minY, width, height] = continent.localMap.viewBox
    .split(/\s+/)
    .map(Number);
  const positions = core.visibleNodes(graph, "algorithm-design")
    .map(({ position }) => position)
    .concat(core.continentContinuations(graph, "algorithm-design")
      .map(({ continuation }) => continuation.position));
  positions.forEach(({ x, y }) => {
    assert.ok(x >= minX && x <= minX + width, "x coordinate is outside viewBox");
    assert.ok(y >= minY && y <= minY + height, "y coordinate is outside viewBox");
  });
});
