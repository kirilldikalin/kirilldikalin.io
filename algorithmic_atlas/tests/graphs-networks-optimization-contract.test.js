"use strict";

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

const expectedIds = new Map([
  ["5.1", "graph-language-traversals"],
  ["5.2", "dag-topological-scc"],
  ["5.3", "single-source-shortest-paths"],
  ["5.4", "all-pairs-shortest-paths"],
  ["5.5", "minimum-spanning-trees"],
  ["5.6", "max-flow-min-cut"],
  ["5.7", "circulations-min-cost-flow"],
  ["5.8", "graph-matchings"],
  ["5.9", "connectivity-cuts-network-design"],
  ["5.10", "traveling-salesman-exact"],
  ["5.11", "dynamic-graph-algorithms"],
  ["5.12", "linear-algebra-for-graphs"],
  ["5.13", "spectral-graph-algorithms"],
  ["5.14", "parallel-distributed-graphs"],
]);

// The map/runtime commit introduces the complete plan first. Add an id here
// only in the same commit that adds the real page, laboratory and tests.
const publishedChapterIds = new Set([
  "graph-language-traversals",
  "dag-topological-scc",
  "single-source-shortest-paths",
]);

function canonicalChapters() {
  const section = curriculum.match(
    /## 05\. Графы, сети и оптимизация([\s\S]*?)(?=\n---\n\n## 06\.)/
  );
  assert.ok(section, "curriculum has no continent 05 section");
  const pattern =
    /^\d+\.\s+\x60(5\.\d+)\x60\s+\*\*(.+?)\*\*\s+—\s+(ядро|ветвь)\s*$/gm;
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

test("continent 05 contains exactly the fourteen canonical graph chapters", () => {
  const canonical = canonicalChapters();
  assert.equal(canonical.length, 14);
  assert.equal(canonical.filter(({ kind }) => kind === "core").length, 9);
  assert.equal(canonical.filter(({ kind }) => kind === "branch").length, 5);

  const continent = core.continentMap(graph).get("graphs-networks-optimization");
  assert.equal(continent.publication, "published");
  assert.equal(continent.regions.length, 4);
  assert.ok(continent.localMap);
  assert.deepEqual(continent.related, [
    "randomization-approximation",
    "big-data-modern-models",
  ]);
  assert.ok(!core.continentMap(graph).get("complexity-limits").related.includes(
    "graphs-networks-optimization"
  ));

  const actual = core.visibleNodes(graph, continent.id).slice().sort((left, right) =>
    Number(left.curriculumId.split(".")[1]) -
      Number(right.curriculumId.split(".")[1])
  );
  assert.deepEqual(
    actual.map(({ curriculumId, title }) => ({ curriculumId, title })),
    canonical.map(({ curriculumId, title }) => ({ curriculumId, title }))
  );
  actual.forEach((node) => {
    assert.equal(node.id, expectedIds.get(node.curriculumId));
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
    } else {
      assert.equal(node.route, null);
      assert.equal(node.reading, null);
      assert.deepEqual(node.features, {
        proof: false,
        interactive: false,
        exercises: false,
      });
    }
  });
});

test("continent 05 core and branch routes match the curriculum", () => {
  assert.deepEqual(routeIds("graphs-main"), [
    "graph-language-traversals",
    "dag-topological-scc",
    "single-source-shortest-paths",
    "minimum-spanning-trees",
    "max-flow-min-cut",
    "graph-matchings",
    "connectivity-cuts-network-design",
    "traveling-salesman-exact",
    "parallel-distributed-graphs",
  ]);
  assert.deepEqual(routeIds("graphs-all-pairs"), [
    "all-pairs-shortest-paths",
  ]);
  assert.deepEqual(routeIds("graphs-min-cost-flow"), [
    "circulations-min-cost-flow",
  ]);
  assert.deepEqual(routeIds("graphs-dynamic"), [
    "dynamic-graph-algorithms",
  ]);
  assert.deepEqual(routeIds("graphs-spectral"), [
    "linear-algebra-for-graphs",
    "spectral-graph-algorithms",
  ]);

  const byId = core.nodeMap(graph);
  const expectedPrerequisites = {
    "graph-language-traversals": ["reductions-and-formulations"],
    "dag-topological-scc": ["graph-language-traversals"],
    "single-source-shortest-paths": ["dag-topological-scc"],
    "all-pairs-shortest-paths": ["single-source-shortest-paths"],
    "minimum-spanning-trees": ["single-source-shortest-paths"],
    "max-flow-min-cut": ["minimum-spanning-trees"],
    "circulations-min-cost-flow": ["max-flow-min-cut"],
    "graph-matchings": ["max-flow-min-cut"],
    "connectivity-cuts-network-design": ["graph-matchings"],
    "traveling-salesman-exact": ["connectivity-cuts-network-design"],
    "dynamic-graph-algorithms": ["connectivity-cuts-network-design"],
    "linear-algebra-for-graphs": ["minimum-spanning-trees"],
    "spectral-graph-algorithms": ["linear-algebra-for-graphs"],
    "parallel-distributed-graphs": ["traveling-salesman-exact"],
  };
  Object.entries(expectedPrerequisites).forEach(([id, dependencies]) => {
    assert.deepEqual(byId.get(id).prerequisites, dependencies);
  });

  const edges = core.graphEdges(graph, "graphs-networks-optimization");
  const edge = (sourceId, targetId) => edges.find((item) =>
    item.sourceId === sourceId && item.targetId === targetId
  );
  assert.equal(edge("single-source-shortest-paths", "all-pairs-shortest-paths").kind, "branch");
  assert.equal(edge("max-flow-min-cut", "circulations-min-cost-flow").kind, "branch");
  assert.equal(edge("connectivity-cuts-network-design", "dynamic-graph-algorithms").kind, "branch");
  assert.equal(edge("minimum-spanning-trees", "linear-algebra-for-graphs").kind, "branch");
  assert.equal(edge("linear-algebra-for-graphs", "spectral-graph-algorithms").kind, "route");
});

test("continent 05 exposes all six canonical future exits from exact sources", () => {
  const continuations = core.continentContinuations(
    graph,
    "graphs-networks-optimization"
  );
  const sources = new Map(continuations.map(({ source, continuation }) => [
    continuation.curriculumId,
    { sourceId: source.id, kind: continuation.kind },
  ]));
  assert.deepEqual(sources, new Map([
    ["6.1", { sourceId: "parallel-distributed-graphs", kind: "route" }],
    ["7.9", { sourceId: "max-flow-min-cut", kind: "related" }],
    ["7.11", { sourceId: "traveling-salesman-exact", kind: "related" }],
    ["9.3", { sourceId: "parallel-distributed-graphs", kind: "related" }],
    ["9.4", { sourceId: "parallel-distributed-graphs", kind: "related" }],
    ["8.10", { sourceId: "dynamic-graph-algorithms", kind: "related" }],
  ]));
});

test("continent 05 map coordinates fit the local viewBox", () => {
  const continent = core.continentMap(graph).get("graphs-networks-optimization");
  const [minX, minY, width, height] = continent.localMap.viewBox
    .split(/\s+/)
    .map(Number);
  const positions = core.visibleNodes(graph, continent.id)
    .map(({ position }) => position)
    .concat(core.continentContinuations(graph, continent.id)
      .map(({ continuation }) => continuation.position));
  positions.forEach(({ x, y }) => {
    assert.ok(x >= minX && x <= minX + width, "x outside viewBox");
    assert.ok(y >= minY && y <= minY + height, "y outside viewBox");
  });
});

test("planned graph chapters stay outside progress without losing old ids", () => {
  const coreTotal = routeIds("graphs-main")
    .filter((id) => publishedChapterIds.has(id)).length;
  const branchTotal = publishedChapterIds.size - coreTotal;
  const progress = core.continentProgressSummary(
    graph,
    "graphs-networks-optimization",
    new Set()
  );
  assert.deepEqual(progress, {
    completed: 0,
    total: publishedChapterIds.size,
    percent: 0,
    coreCompleted: 0,
    coreTotal,
    branchCompleted: 0,
    branchTotal,
    coreReady: false,
    complete: false,
  });

  const oldCompleted = new Set([
    "before-computers",
    "polynomial-efficiency",
    "range-query-structures",
    "reductions-and-formulations",
  ]);
  const storage = {
    value: JSON.stringify({
      schemaVersion: 2,
      datasetVersion: "2026.08.01-10",
      completedNodeIds: Array.from(oldCompleted),
      freeExplore: false,
    }),
    getItem() { return this.value; },
    setItem(_, value) { this.value = value; },
  };
  assert.deepEqual(
    core.loadProgress(storage, graph).completedNodeIds,
    oldCompleted
  );
});
