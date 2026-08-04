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
  "all-pairs-shortest-paths",
  "minimum-spanning-trees",
  "max-flow-min-cut",
  "circulations-min-cost-flow",
  "graph-matchings",
  "connectivity-cuts-network-design",
  "traveling-salesman-exact",
  "dynamic-graph-algorithms",
  "linear-algebra-for-graphs",
  "spectral-graph-algorithms",
  "parallel-distributed-graphs",
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

function chapterFile(node) {
  return path.join(atlasRoot, node.route.replace(/^\.\//, ""));
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

test("every graph chapter uses the shared page and laboratory contracts", () => {
  const nodes = core.visibleNodes(graph, "graphs-networks-optimization")
    .filter(({ publication }) => publication === "published");
  assert.equal(nodes.length, 14);

  nodes.forEach((node) => {
    const file = chapterFile(node);
    const html = fs.readFileSync(file, "utf8");
    assert.match(
      html,
      new RegExp('<body[^>]+data-atlas-node-id="' + node.id + '"')
    );
    assert.match(html, /class="atlas-chapter-layout"/);
    assert.match(html, /class="atlas-chapter-toc"/);
    assert.match(html, /class="atlas-route-nav"/);
    assert.match(html, /class="atlas-completion"/);
    assert.match(html, /id="atlas-route-previous"/);
    assert.match(html, /id="atlas-route-next"/);
    assert.match(html, /id="atlas-mark-complete"/);
    assert.match(html, /data-atlas-block="lab"/);
    assert.match(html, /atlas-block--fullwidth/);
    assert.match(html, new RegExp('data-atlas-lab="' + node.id + '"'));

    [
      "../chapter.css",
      "../labs/lab-common.css",
      "../labs/graph-labs.css",
    ].forEach((href) => {
      assert.match(html, new RegExp('href="' + href.replace(/\./g, "\\.") + '"'));
    });
    [
      "../labs/lab-runtime.js",
      "../labs/lab-svg.js",
      "../labs/graph-lab-core.js",
      "../labs/graph-lab-runtime.js",
      "../labs/" + node.id + "-core.js",
      "../labs/" + node.id + ".js",
    ].forEach((src) => {
      assert.match(html, new RegExp('src="' + src.replace(/\./g, "\\.") + '"'));
    });

    const exercises = html.match(
      /<section id="exercises"[^>]*data-atlas-block="exercises"[^>]*>[\s\S]*?<\/section>/
    );
    assert.ok(exercises, node.id + " has no exercise section");
    assert.ok(
      (exercises[0].match(/<article\b/g) || []).length >= 10,
      node.id + " must have at least ten exercises"
    );
    const sources = html.match(
      /<section id="sources"[^>]*data-atlas-block="sources"[^>]*>[\s\S]*?<\/section>/
    );
    assert.ok(sources, node.id + " has no source section");
    assert.ok(
      (sources[0].match(/href="https?:\/\//g) || []).length >= 3,
      node.id + " must cite direct academic or primary sources"
    );
    assert.match(html, /notation-id-[a-z0-9-]+/);
    assert.match(html, /<pre\b[^>]*>\s*<code>/);

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

test("continent 05 keeps only unresolved canonical future exits", () => {
  const continuations = core.continentContinuations(
    graph,
    "graphs-networks-optimization"
  );
  const sources = new Map(continuations.map(({ source, continuation }) => [
    continuation.curriculumId,
    { sourceId: source.id, kind: continuation.kind },
  ]));
  assert.deepEqual(sources, new Map([
    ["7.9", { sourceId: "max-flow-min-cut", kind: "related" }],
    ["7.11", { sourceId: "traveling-salesman-exact", kind: "related" }],
    ["9.3", { sourceId: "parallel-distributed-graphs", kind: "related" }],
    ["9.4", { sourceId: "parallel-distributed-graphs", kind: "related" }],
    ["8.10", { sourceId: "dynamic-graph-algorithms", kind: "related" }],
  ]));
});

test("sequential and free exploration keep graph access separate from progress", () => {
  const byId = core.nodeMap(graph);
  const previousCore = new Set(routeIds("algorithm-design-main"));
  const first = byId.get("graph-language-traversals");
  assert.equal(
    core.nodeAccessState(graph, first, previousCore, false),
    "published-unlocked"
  );
  publishedChapterIds.forEach((id) => {
    if (id !== first.id) {
      assert.equal(
        core.nodeAccessState(graph, byId.get(id), previousCore, false),
        "published-gated",
        id + " must stay gated before its graph prerequisites"
      );
    }
  });

  const freeProgress = new Set();
  publishedChapterIds.forEach((id) => {
    assert.equal(
      core.nodeAccessState(graph, byId.get(id), freeProgress, true),
      "published-unlocked",
      id + " must open in free exploration"
    );
  });
  assert.deepEqual(Array.from(freeProgress), []);
});

test("each graph branch opens only after its canonical entry prerequisite", () => {
  const byId = core.nodeMap(graph);
  const previousCore = new Set(routeIds("algorithm-design-main"));
  const entries = [
    ["all-pairs-shortest-paths", "single-source-shortest-paths"],
    ["circulations-min-cost-flow", "max-flow-min-cut"],
    ["dynamic-graph-algorithms", "connectivity-cuts-network-design"],
    ["linear-algebra-for-graphs", "minimum-spanning-trees"],
    ["spectral-graph-algorithms", "linear-algebra-for-graphs"],
  ];

  function completeDependencies(nodeId, completed) {
    byId.get(nodeId).prerequisites.forEach((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (dependency && dependency.continentId === "graphs-networks-optimization") {
        completeDependencies(dependencyId, completed);
      }
      completed.add(dependencyId);
    });
  }

  entries.forEach(([targetId, sourceId]) => {
    const completed = new Set(previousCore);
    completeDependencies(sourceId, completed);
    assert.equal(completed.has(sourceId), false);
    assert.equal(
      core.nodeAccessState(graph, byId.get(targetId), completed, false),
      "published-gated",
      targetId + " must wait for " + sourceId
    );
    assert.equal(
      core.nodeAccessState(graph, byId.get(sourceId), completed, false),
      "published-unlocked",
      sourceId + " must itself be reachable"
    );
    completed.add(sourceId);
    assert.equal(
      core.nodeAccessState(graph, byId.get(targetId), completed, false),
      "published-unlocked",
      targetId + " must open after " + sourceId
    );
  });
});

test("the published continent 06 waits for the graph core while free exploration stays optional", () => {
  const previousCore = new Set(routeIds("algorithm-design-main"));
  const graphCore = routeIds("graphs-main");
  const completedCore = new Set(previousCore);
  graphCore.forEach((id) => completedCore.add(id));
  assert.equal(core.routeContinuation(graph, "parallel-distributed-graphs"), null);
  const first = core.nodeMap(graph).get("exact-string-matching");
  assert.equal(first.curriculumId, "6.1");
  assert.deepEqual(first.prerequisites, ["parallel-distributed-graphs"]);

  const published = core.continentMap(graph).get("strings-geometry-numerics");
  assert.equal(
    core.continentAccessState(graph, published, previousCore, false),
    "published-gated"
  );
  assert.equal(
    core.continentAccessState(graph, published, previousCore, true),
    "published-unlocked"
  );
  assert.equal(
    core.continentAccessState(graph, published, completedCore, false),
    "published-unlocked"
  );
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

test("published graph progress separates the nine core chapters and five branches", () => {
  const coreTotal = routeIds("graphs-main")
    .filter((id) => publishedChapterIds.has(id)).length;
  const branchTotal = publishedChapterIds.size - coreTotal;
  assert.equal(coreTotal, 9);
  assert.equal(branchTotal, 5);
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

  const coreCompleted = new Set(routeIds("graphs-main"));
  assert.deepEqual(
    core.continentProgressSummary(
      graph,
      "graphs-networks-optimization",
      coreCompleted
    ),
    {
      completed: 9,
      total: 14,
      percent: 64,
      coreCompleted: 9,
      coreTotal: 9,
      branchCompleted: 0,
      branchTotal: 5,
      coreReady: true,
      complete: false,
    }
  );

  const allCompleted = new Set(publishedChapterIds);
  assert.deepEqual(
    core.continentProgressSummary(
      graph,
      "graphs-networks-optimization",
      allCompleted
    ),
    {
      completed: 14,
      total: 14,
      percent: 100,
      coreCompleted: 9,
      coreTotal: 9,
      branchCompleted: 5,
      branchTotal: 5,
      coreReady: true,
      complete: true,
    }
  );

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
