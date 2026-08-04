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
  ["6.1", "exact-string-matching"],
  ["6.2", "string-hashing-multiple-patterns"],
  ["6.3", "suffix-indexes"],
  ["6.4", "bwt-fm-index"],
  ["6.5", "edit-distance-lcs"],
  ["6.6", "lossless-compression"],
  ["6.7", "geometric-predicates-convex-hull"],
  ["6.8", "sweep-line-closest-pair-range-search"],
  ["6.9", "voronoi-delaunay"],
  ["6.10", "integer-arithmetic-number-theory"],
  ["6.11", "modular-algorithms-primality"],
  ["6.12", "polynomials-fft-ntt"],
  ["6.13", "matrices-linear-systems-stability"],
]);

function canonicalChapters() {
  const section = curriculum.match(
    /## 06\. Строки, геометрия и численные алгоритмы([\s\S]*?)(?=\n---\n\n## 07\.)/
  );
  assert.ok(section, "curriculum has no continent 06 section");
  const pattern =
    /^\d+\.\s+\x60(6\.\d+)\x60\s+\*\*(.+?)\*\*\s+—\s+(ядро|ветвь)\s*$/gm;
  return Array.from(section[1].matchAll(pattern), (match) => ({
    curriculumId: match[1],
    title: match[2],
    kind: match[3] === "ядро" ? "core" : "branch",
  }));
}

function routeIds(routeId) {
  return core.routeOrder(graph, routeId).map(({ id }) => id);
}

test("continent 06 contains exactly the thirteen canonical published nodes", () => {
  const canonical = canonicalChapters();
  assert.equal(canonical.length, 13);
  assert.equal(canonical.filter(({ kind }) => kind === "core").length, 9);
  assert.equal(canonical.filter(({ kind }) => kind === "branch").length, 4);

  const continent = core.continentMap(graph).get("strings-geometry-numerics");
  assert.equal(continent.publication, "published");
  assert.ok(continent.localMap);
  assert.equal(continent.regions.length, 3);
  continent.regions.forEach((region) => {
    assert.ok(region.mapArea.path.length > 20);
    assert.ok(Number.isFinite(region.mapArea.labelPosition.x));
    assert.ok(Number.isFinite(region.mapArea.labelPosition.y));
  });

  const nodes = core.visibleNodes(graph, continent.id).slice().sort((left, right) =>
    Number(left.curriculumId.split(".")[1]) -
      Number(right.curriculumId.split(".")[1])
  );
  assert.deepEqual(
    nodes.map(({ curriculumId, title }) => ({ curriculumId, title })),
    canonical.map(({ curriculumId, title }) => ({ curriculumId, title }))
  );
  nodes.forEach((node) => {
    assert.equal(node.id, expectedIds.get(node.curriculumId));
    assert.equal(node.route, "./chapters/" + node.id + ".html");
    const html = fs.readFileSync(
      path.join(atlasRoot, "chapters", node.id + ".html"),
      "utf8"
    );
    assert.equal(
      html.match(/<h1>([^<]+)<\/h1>/)?.[1],
      node.title,
      node.id + " h1 must match the graph title"
    );
    assert.equal(
      html.match(/<title>([^<]+)<\/title>/)?.[1],
      node.title + " — Алгоритмический атлас",
      node.id + " document title must match the graph title"
    );
    assert.deepEqual(node.features, {
      proof: true,
      interactive: true,
      exercises: true,
    });
  });
});

test("three independent main routes and three branch routes match curriculum", () => {
  assert.deepEqual(routeIds("strings-geometry-numerics-strings-main"), [
    "exact-string-matching",
    "string-hashing-multiple-patterns",
    "edit-distance-lcs",
  ]);
  assert.deepEqual(routeIds("strings-geometry-numerics-geometry-main"), [
    "geometric-predicates-convex-hull",
    "sweep-line-closest-pair-range-search",
  ]);
  assert.deepEqual(routeIds("strings-geometry-numerics-numerics-main"), [
    "integer-arithmetic-number-theory",
    "modular-algorithms-primality",
    "polynomials-fft-ntt",
    "matrices-linear-systems-stability",
  ]);
  assert.deepEqual(routeIds("strings-geometry-numerics-indexes"), [
    "suffix-indexes",
    "bwt-fm-index",
  ]);
  assert.deepEqual(routeIds("strings-geometry-numerics-compression"), [
    "lossless-compression",
  ]);
  assert.deepEqual(routeIds("strings-geometry-numerics-voronoi"), [
    "voronoi-delaunay",
  ]);

  const byId = core.nodeMap(graph);
  for (const rootId of [
    "exact-string-matching",
    "geometric-predicates-convex-hull",
    "integer-arithmetic-number-theory",
  ]) {
    assert.deepEqual(byId.get(rootId).prerequisites, [
      "parallel-distributed-graphs",
    ]);
  }
  assert.equal(
    byId.get("geometric-predicates-convex-hull").prerequisites.includes(
      "edit-distance-lcs"
    ),
    false
  );
  assert.equal(
    byId.get("integer-arithmetic-number-theory").prerequisites.includes(
      "edit-distance-lcs"
    ),
    false
  );
});

test("core, branch and regional progress are calculated independently", () => {
  assert.deepEqual(
    core.continentProgressSummary(
      graph,
      "strings-geometry-numerics",
      new Set()
    ),
    {
      completed: 0,
      total: 13,
      percent: 0,
      coreCompleted: 0,
      coreTotal: 9,
      branchCompleted: 0,
      branchTotal: 4,
      coreReady: false,
      complete: false,
    }
  );

  const expectedRegions = new Map([
    ["string-algorithms", [3, 3, 6]],
    ["computational-geometry", [2, 1, 3]],
    ["numerical-algebraic-algorithms", [4, 0, 4]],
  ]);
  for (const [regionId, [coreTotal, branchTotal, total]] of expectedRegions) {
    const summary = core.regionProgressSummary(
      graph,
      "strings-geometry-numerics",
      regionId,
      new Set()
    );
    assert.equal(summary.coreTotal, coreTotal);
    assert.equal(summary.branchTotal, branchTotal);
    assert.equal(summary.total, total);
  }

  const completedCore = new Set(core.continentCoreNodeIds(
    graph,
    "strings-geometry-numerics"
  ));
  const coreOnly = core.continentProgressSummary(
    graph,
    "strings-geometry-numerics",
    completedCore
  );
  assert.equal(coreOnly.coreCompleted, 9);
  assert.equal(coreOnly.coreReady, true);
  assert.equal(coreOnly.branchCompleted, 0);
  assert.equal(coreOnly.complete, false);

  const completedAll = new Set(core.visibleNodes(
    graph,
    "strings-geometry-numerics"
  ).map(({ id }) => id));
  assert.equal(
    core.continentProgressSummary(
      graph,
      "strings-geometry-numerics",
      completedAll
    ).complete,
    true
  );
});

test("sequential access unlocks all three roots without coupling the areas", () => {
  const continent = core.continentMap(graph).get("strings-geometry-numerics");
  const completed = new Set(core.continentCoreNodeIds(
    graph,
    "graphs-networks-optimization"
  ));
  assert.equal(
    core.continentAccessState(graph, continent, new Set(), false),
    "published-gated"
  );
  assert.equal(
    core.continentAccessState(graph, continent, new Set(), true),
    "published-unlocked"
  );
  assert.equal(
    core.continentAccessState(graph, continent, completed, false),
    "published-unlocked"
  );

  for (const rootId of [
    "exact-string-matching",
    "geometric-predicates-convex-hull",
    "integer-arithmetic-number-theory",
  ]) {
    assert.equal(
      core.nodeAccessState(graph, core.nodeMap(graph).get(rootId), completed, false),
      "published-unlocked"
    );
  }
  assert.equal(
    core.nodeAccessState(
      graph,
      core.nodeMap(graph).get("string-hashing-multiple-patterns"),
      completed,
      false
    ),
    "published-gated"
  );
});

test("only canonical future exits remain continuation metadata", () => {
  assert.deepEqual(
    new Set(core.continentContinuations(graph, "strings-geometry-numerics")
      .map(({ continuation }) => continuation.curriculumId)),
    new Set(["7.1", "7.4", "7.7", "9.11"])
  );
  assert.equal(
    core.routeContinuation(graph, "matrices-linear-systems-stability").curriculumId,
    "7.1"
  );
  assert.equal(core.routeContinuation(graph, "edit-distance-lcs"), null);
  assert.equal(core.routeNeighbors(graph, "edit-distance-lcs").continentExit, false);
});

test("mapArea validation rejects incomplete region geometry", () => {
  const invalid = structuredClone(graph);
  delete invalid.continents.find(({ id }) =>
    id === "strings-geometry-numerics"
  ).regions[0].mapArea.labelPosition;
  assert.throws(
    () => core.validateGraph(invalid),
    /region mapArea needs a label position/
  );
});
