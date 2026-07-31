const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../atlas-core.js");
const graph = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/atlas-graph.json"), "utf8")
);
core.validateGraph(graph);

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  let writes = 0;
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writes += 1;
      values.set(key, value);
    },
    value(key) {
      return values.get(key);
    },
    writes() {
      return writes;
    },
  };
}

function cloneGraph() {
  return structuredClone(graph);
}

test("the graph uses schema v2 and contains the complete world outline", () => {
  assert.equal(core.validateGraph(graph), graph);
  assert.equal(graph.schemaVersion, 2);
  assert.equal(graph.continents.length, 9);
  assert.equal(graph.nodes.length, 16);
  assert.equal(graph.routes.length, 4);
  assert.deepEqual(
    graph.continents.map(({ name }) => name),
    [
      "Истоки и эффективность",
      "Математические инструменты и анализ",
      "Структуры данных",
      "Методы построения алгоритмов",
      "Графы, сети и оптимизация",
      "Строки, геометрия и численные алгоритмы",
      "Рандомизация и аппроксимация",
      "Сложность и границы вычислений",
      "Большие данные и современные модели",
    ]
  );
  assert.equal(
    graph.continents.filter(({ publication }) => publication === "published").length,
    2
  );
});

test("route order is explicit and independent of every JSON array order", () => {
  const expectedWorld = [
    "origins-efficiency",
    "mathematical-tools",
    "data-structures",
    "algorithm-design",
    "graphs-networks-optimization",
    "strings-geometry-numerics",
    "randomization-approximation",
    "complexity-limits",
    "big-data-modern-models",
  ];
  const expectedOrigins = [
    "before-computers",
    "euclidean-algorithm",
    "turing-machine-transition",
    "input-size-and-cost",
    "asymptotic-estimates",
  ];
  const expectedMathematicalCore = [
    "growth-rates",
    "sums-products-recurrences",
    "sets-relations-functions-logic",
    "proof-methods-induction",
    "correctness-invariants-termination",
    "computation-models",
    "analysis-cases",
    "polynomial-efficiency",
  ];
  const expectedProbabilityBranch = [
    "combinatorics-counting",
    "probability-spaces",
    "random-variables-concentration",
  ];
  assert.deepEqual(
    core.routeOrder(graph, "world-main").map(({ id }) => id),
    expectedWorld
  );
  assert.deepEqual(
    core.routeOrder(graph, "origins-main").map(({ id }) => id),
    expectedOrigins
  );
  assert.deepEqual(
    core.routeOrder(graph, "mathematical-tools-main").map(({ id }) => id),
    expectedMathematicalCore
  );
  assert.deepEqual(
    core.routeOrder(graph, "mathematical-tools-probability").map(({ id }) => id),
    expectedProbabilityBranch
  );

  const shuffled = cloneGraph();
  shuffled.continents.reverse();
  shuffled.nodes.reverse();
  shuffled.routes.reverse();
  shuffled.routes.forEach((route) => route.entries.reverse());
  core.validateGraph(shuffled);
  assert.deepEqual(
    core.routeOrder(shuffled, "world-main").map(({ id }) => id),
    expectedWorld
  );
  assert.deepEqual(
    core.routeOrder(shuffled, "origins-main").map(({ id }) => id),
    expectedOrigins
  );
  assert.deepEqual(core.topologicalOrder(shuffled).map(({ id }) => id), [
    ...expectedOrigins,
    ...expectedMathematicalCore,
    ...expectedProbabilityBranch,
  ]);
});

test("main routes are discovered by model fields rather than hardcoded ids", () => {
  const renamed = cloneGraph();
  renamed.routes.find(({ scope }) => scope === "continents").id = "renamed-world";
  renamed.routes.find(({ scope }) => scope === "nodes").id = "renamed-origins";
  core.validateGraph(renamed);

  assert.equal(
    core.mainRoute(renamed, "continents").id,
    "renamed-world"
  );
  assert.equal(
    core.mainRoute(renamed, "nodes", "origins-efficiency").id,
    "renamed-origins"
  );
  assert.equal(
    core.mainRoute(renamed, "nodes", "mathematical-tools").id,
    "mathematical-tools-main"
  );
  assert.equal(
    core.routeForContinent(renamed, "origins-efficiency").id,
    "renamed-world"
  );
});

test("chapter neighbors come from route positions rather than node order", () => {
  const beginning = core.routeNeighbors(graph, "before-computers");
  assert.equal(beginning.previous, null);
  assert.equal(beginning.next.id, "euclidean-algorithm");
  assert.equal(beginning.route.id, "origins-main");

  const middle = core.routeNeighbors(graph, "turing-machine-transition");
  assert.equal(middle.previous.id, "euclidean-algorithm");
  assert.equal(middle.next.id, "input-size-and-cost");

  const fourth = core.routeNeighbors(graph, "input-size-and-cost");
  assert.equal(fourth.next.id, "asymptotic-estimates");
  assert.equal(fourth.next.publication, "published");

  const fifth = core.routeNeighbors(graph, "asymptotic-estimates");
  assert.equal(fifth.previous.id, "input-size-and-cost");
  assert.equal(fifth.next.id, "growth-rates");
  assert.deepEqual(fifth.nextAll.map(({ id }) => id), ["growth-rates"]);

  const branchPoint = core.routeNeighbors(graph, "sets-relations-functions-logic");
  assert.equal(branchPoint.next.id, "proof-methods-induction");
  assert.deepEqual(branchPoint.nextAll.map(({ id }) => id), [
    "proof-methods-induction",
    "combinatorics-counting",
  ]);

  const probabilityEnd = core.routeNeighbors(
    graph,
    "random-variables-concentration"
  );
  assert.equal(probabilityEnd.next, null);
  assert.equal(
    core.routeContinuation(graph, "random-variables-concentration").curriculumId,
    "7.1"
  );

  const continentRoute = core.routeForContinent(graph, "origins-efficiency");
  const continents = core.routeOrder(graph, continentRoute.id);
  const originsIndex = continents.findIndex(({ id }) => id === "origins-efficiency");
  assert.equal(continents[originsIndex + 1].id, "mathematical-tools");
});

test("duplicate positions and unknown route entries are rejected", () => {
  const duplicatePosition = cloneGraph();
  duplicatePosition.routes[1].entries[1].position =
    duplicatePosition.routes[1].entries[0].position;
  assert.throws(
    () => core.validateGraph(duplicatePosition),
    /duplicate route position/
  );

  const unknownEntry = cloneGraph();
  unknownEntry.routes[1].entries[0].nodeId = "missing-node";
  assert.throws(
    () => core.validateGraph(unknownEntry),
    /unknown route entry/
  );
});

test("route order must agree with required dependencies", () => {
  const disconnected = cloneGraph();
  disconnected.nodes.find(({ id }) => id === "euclidean-algorithm").prerequisites = [];
  assert.throws(
    () => core.validateGraph(disconnected),
    /route order lacks prerequisite/
  );
});

test("a node region must belong to the node continent", () => {
  const misplaced = cloneGraph();
  misplaced.nodes[0].continentId = "mathematical-tools";
  assert.throws(
    () => core.validateGraph(misplaced),
    /region does not belong to node continent/
  );
});

test("node and continent prerequisite cycles are rejected", () => {
  const cyclicNodes = cloneGraph();
  cyclicNodes.nodes[0].prerequisites = ["input-size-and-cost"];
  assert.throws(
    () => core.validateGraph(cyclicNodes),
    /prerequisite cycle/
  );

  const cyclicContinents = cloneGraph();
  cyclicContinents.continents[0].prerequisites = ["big-data-modern-models"];
  assert.throws(
    () => core.validateGraph(cyclicContinents),
    /continent prerequisite cycle/
  );
});

test("separate routes can branch and merge through the prerequisite DAG", () => {
  const branched = cloneGraph();
  const template = branched.nodes[0];
  let nextCurriculumId = 1;
  const makeNode = (id, prerequisites, route) => ({
    ...structuredClone(template),
    id,
    curriculumId: `99.${nextCurriculumId++}`,
    title: id,
    description: `Описание ${id}`,
    prerequisites,
    related: [],
    route,
    features: { proof: false, interactive: false, exercises: false },
    position: { x: 100, y: 100 },
  });
  branched.nodes.push(
    makeNode("branch-left", ["before-computers"], "./chapters/branch-left.html"),
    makeNode("branch-right", ["before-computers"], "./chapters/branch-right.html"),
    makeNode(
      "branch-merge",
      ["branch-left", "branch-right"],
      "./chapters/branch-merge.html"
    )
  );
  branched.routes.push(
    {
      id: "origins-branch-left",
      title: "Левая ветвь",
      scope: "nodes",
      kind: "branch",
      continentId: "origins-efficiency",
      entries: [{ nodeId: "branch-left", position: 10 }],
    },
    {
      id: "origins-branch-right",
      title: "Правая ветвь",
      scope: "nodes",
      kind: "branch",
      continentId: "origins-efficiency",
      entries: [{ nodeId: "branch-right", position: 10 }],
    },
    {
      id: "origins-branch-merge",
      title: "Объединение ветвей",
      scope: "nodes",
      kind: "branch",
      continentId: "origins-efficiency",
      entries: [{ nodeId: "branch-merge", position: 10 }],
    }
  );
  assert.equal(core.validateGraph(branched), branched);
  assert.deepEqual(
    core.routeNeighbors(branched, "branch-left").nextAll.map(({ id }) => id),
    ["branch-merge"]
  );
  assert.deepEqual(
    core.routeNeighbors(branched, "branch-merge").previousAll.map(({ id }) => id),
    ["branch-left", "branch-right"]
  );
});

test("internal route neighbors retain every branch and merge edge", () => {
  const branched = cloneGraph();
  const template = branched.nodes[0];
  let nextCurriculumId = 1;
  const makeNode = (id, prerequisites, route) => ({
    ...structuredClone(template),
    id,
    curriculumId: `98.${nextCurriculumId++}`,
    title: id,
    description: `Описание ${id}`,
    prerequisites,
    related: [],
    route,
    features: { proof: false, interactive: false, exercises: false },
    position: { x: 100, y: 100 },
  });
  branched.nodes.push(
    makeNode("branch-left", ["before-computers"], "./chapters/branch-left.html"),
    makeNode("branch-right", ["before-computers"], "./chapters/branch-right.html"),
    makeNode(
      "branch-merge",
      ["branch-left", "branch-right"],
      "./chapters/branch-merge.html"
    )
  );
  branched.routes.push(
    {
      id: "origins-branch-left",
      title: "Левая ветвь",
      scope: "nodes",
      kind: "branch",
      continentId: "origins-efficiency",
      entries: [
        { nodeId: "branch-left", position: 10 },
        { nodeId: "branch-merge", position: 20 },
      ],
    },
    {
      id: "origins-branch-right",
      title: "Правая ветвь",
      scope: "nodes",
      kind: "branch",
      continentId: "origins-efficiency",
      entries: [{ nodeId: "branch-right", position: 10 }],
    }
  );
  core.validateGraph(branched);

  assert.deepEqual(
    core.routeNeighbors(branched, "before-computers").nextAll.map(({ id }) => id),
    ["euclidean-algorithm", "branch-left", "branch-right"]
  );
  assert.deepEqual(
    core.routeNeighbors(branched, "branch-merge").previousAll.map(({ id }) => id),
    ["branch-left", "branch-right"]
  );
  assert.equal(core.routeNeighbors(branched, "branch-merge").previous.id, "branch-left");
});

test("publication and access are independent states", () => {
  const completed = new Set();
  const before = core.nodeMap(graph).get("before-computers");
  const euclid = core.nodeMap(graph).get("euclidean-algorithm");
  const asymptotic = core.nodeMap(graph).get("asymptotic-estimates");
  const planned = structuredClone(asymptotic);
  planned.publication = "planned";
  planned.route = null;
  planned.features = { proof: false, interactive: false, exercises: false };

  assert.equal(
    core.nodeAccessState(graph, before, completed, false),
    "published-unlocked"
  );
  assert.equal(
    core.nodeAccessState(graph, euclid, completed, false),
    "published-gated"
  );
  assert.equal(
    core.nodeAccessState(graph, euclid, completed, true),
    "published-unlocked"
  );
  assert.equal(
    core.nodeAccessState(graph, planned, completed, true),
    "planned"
  );
  assert.equal(
    core.nodeAccessState(graph, asymptotic, completed, false),
    "published-gated"
  );
  assert.equal(
    core.nodeAccessState(graph, asymptotic, completed, true),
    "published-unlocked"
  );

  euclid.allowFreeExplore = false;
  assert.equal(
    core.nodeAccessState(graph, euclid, completed, true),
    "published-gated"
  );
  euclid.allowFreeExplore = true;

  completed.add("before-computers");
  assert.equal(
    core.nodeAccessState(graph, euclid, completed, false),
    "published-unlocked"
  );
});

test("completed chapters remain unlocked and free exploration never completes them", () => {
  const completed = new Set(["input-size-and-cost"]);
  const node = core.nodeMap(graph).get("input-size-and-cost");
  assert.equal(
    core.nodeAccessState(graph, node, completed, false),
    "published-unlocked"
  );

  const untouched = new Set();
  core.nodeAccessState(graph, node, untouched, true);
  assert.deepEqual(Array.from(untouched), []);
});

test("the fifth chapter gates on chapter four and continues to continent two", () => {
  const completedBeforeFourth = new Set([
    "before-computers",
    "euclidean-algorithm",
    "turing-machine-transition",
  ]);
  const fifth = core.nodeMap(graph).get("asymptotic-estimates");

  assert.equal(
    core.nodeAccessState(graph, fifth, completedBeforeFourth, false),
    "published-gated"
  );
  assert.equal(
    core.nodeAccessState(graph, fifth, completedBeforeFourth, true),
    "published-unlocked"
  );
  assert.equal(core.routeNeighbors(graph, fifth.id).next.id, "growth-rates");
  assert.equal(core.nodeMap(graph).get("growth-rates").curriculumId, "2.1");
  assert.equal(core.nodeMap(graph).get("analysis-cases").curriculumId, "2.10");
  assert.equal(
    core.nodeMap(graph).get("polynomial-efficiency").curriculumId,
    "2.11"
  );
  assert.deepEqual(Array.from(completedBeforeFourth), [
    "before-computers",
    "euclidean-algorithm",
    "turing-machine-transition",
  ]);
});

test("continent access uses publication, prerequisites and free exploration", () => {
  const origins = core.continentMap(graph).get("origins-efficiency");
  const math = core.continentMap(graph).get("mathematical-tools");
  assert.equal(
    core.continentAccessState(graph, origins, new Set(), false),
    "published-unlocked"
  );
  assert.equal(
    core.continentAccessState(graph, math, new Set(), false),
    "published-gated"
  );
  assert.equal(
    core.continentAccessState(graph, math, new Set(), true),
    "published-unlocked"
  );

  const completedOrigins = new Set(core.continentCoreNodeIds(
    graph,
    "origins-efficiency"
  ));
  assert.equal(
    core.continentAccessState(graph, math, completedOrigins, false),
    "published-unlocked"
  );
});

test("planned material cannot claim a page or content features", () => {
  const withPage = cloneGraph();
  withPage.nodes.find(({ id }) => id === "asymptotic-estimates").publication =
    "planned";
  assert.throws(
    () => core.validateGraph(withPage),
    /planned node route must be null/
  );

  const withFeature = cloneGraph();
  const planned = withFeature.nodes.find(({ id }) => id === "asymptotic-estimates");
  planned.publication = "planned";
  planned.route = null;
  planned.features.proof = true;
  assert.throws(
    () => core.validateGraph(withFeature),
    /planned node must not claim content features/
  );
});

test("derived reading metrics match the content formula and separate lab time", () => {
  const measured = cloneGraph();
  const node = measured.nodes[0];
  node.reading = {
    words: 2200,
    formulaBlocks: 8,
    proofBlocks: 3,
    theoryMinutes: 18,
    labMinutes: 7,
  };
  node.minutes = 25;
  assert.equal(core.validateGraph(measured), measured);

  const staleTheory = structuredClone(measured);
  staleTheory.nodes[0].reading.theoryMinutes = 17;
  assert.throws(
    () => core.validateGraph(staleTheory),
    /theoryMinutes does not match content formula/
  );

  const staleTotal = structuredClone(measured);
  staleTotal.nodes[0].minutes = 24;
  assert.throws(
    () => core.validateGraph(staleTotal),
    /minutes must equal theory plus laboratory time/
  );
});

test("content feature labels are conditional and preserve their common order", () => {
  const turing = core.nodeMap(graph).get("turing-machine-transition");
  const planned = structuredClone(core.nodeMap(graph).get("asymptotic-estimates"));
  planned.features = { proof: false, interactive: false, exercises: false };
  assert.deepEqual(
    core.contentFeatures(turing).map(({ id }) => id),
    ["interactive", "exercises"]
  );
  assert.deepEqual(core.contentFeatures(planned), []);
  assert.deepEqual(core.contentFeatures(null), []);
});

test("schema v1 progress migrates in place without losing stable ids", () => {
  const storage = memoryStorage({
    [core.STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      datasetVersion: "old",
      completedNodeIds: ["before-computers", "unknown"],
    }),
  });
  const loaded = core.loadProgress(storage, graph);
  assert.deepEqual(Array.from(loaded.completedNodeIds), ["before-computers"]);
  assert.equal(loaded.freeExplore, false);
  assert.equal(loaded.migrated, true);
  assert.equal(storage.writes(), 1);

  const migrated = JSON.parse(storage.value(core.STORAGE_KEY));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.datasetVersion, graph.datasetVersion);
  assert.deepEqual(migrated.completedNodeIds, ["before-computers"]);
  assert.equal(migrated.freeExplore, false);
});

test("dataset migration preserves free exploration and chapter saves preserve it too", () => {
  const storage = memoryStorage({
    [core.STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      datasetVersion: "old",
      completedNodeIds: ["before-computers"],
      freeExplore: true,
    }),
  });
  const loaded = core.loadProgress(storage, graph);
  assert.equal(loaded.freeExplore, true);
  assert.equal(loaded.migrated, true);

  assert.equal(
    core.saveProgress(
      storage,
      graph,
      new Set(["before-computers", "euclidean-algorithm"])
    ),
    true
  );
  const saved = JSON.parse(storage.value(core.STORAGE_KEY));
  assert.equal(saved.freeExplore, true);
  assert.deepEqual(
    saved.completedNodeIds,
    ["before-computers", "euclidean-algorithm"]
  );
});

test("a dataset update preserves progress for all five published chapters", () => {
  const completed = [
    "before-computers",
    "euclidean-algorithm",
    "turing-machine-transition",
    "input-size-and-cost",
    "asymptotic-estimates",
  ];
  const storage = memoryStorage({
    [core.STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      datasetVersion: "2026.07.31-1",
      completedNodeIds: completed,
      freeExplore: false,
    }),
  });

  const loaded = core.loadProgress(storage, graph);
  assert.deepEqual(Array.from(loaded.completedNodeIds), completed);
  assert.equal(loaded.migrated, true);

  const saved = JSON.parse(storage.value(core.STORAGE_KEY));
  assert.equal(saved.datasetVersion, graph.datasetVersion);
  assert.deepEqual(saved.completedNodeIds, completed.slice().sort());
});

test("unknown future storage is not overwritten", () => {
  const raw = JSON.stringify({
    schemaVersion: 99,
    completedNodeIds: ["before-computers"],
    freeExplore: true,
  });
  const storage = memoryStorage({ [core.STORAGE_KEY]: raw });
  const loaded = core.loadProgress(storage, graph);
  assert.equal(loaded.unsupported, true);
  assert.equal(loaded.completedNodeIds.size, 0);
  assert.equal(storage.writes(), 0);
  assert.equal(storage.value(core.STORAGE_KEY), raw);
  assert.equal(
    core.saveProgress(storage, graph, new Set(["before-computers"]), false),
    false
  );
  assert.equal(storage.writes(), 0);
  assert.equal(storage.value(core.STORAGE_KEY), raw);
});

test("corrupt or unavailable storage leaves the atlas usable", () => {
  const corrupt = memoryStorage({
    [core.STORAGE_KEY]: "{not json",
  });
  assert.equal(core.loadProgress(corrupt, graph).completedNodeIds.size, 0);
  assert.equal(core.loadProgress(null, graph).persistent, false);
});

test("the first continent is complete after exactly five published chapters", () => {
  const origins = core.visibleNodes(graph, "origins-efficiency");
  const completed = new Set(origins.map(({ id }) => id));

  assert.equal(origins.length, 5);
  assert.equal(
    core.continentCompleted(
      graph,
      "origins-efficiency",
      new Set(Array.from(completed).slice(0, 4))
    ),
    false
  );
  assert.equal(
    core.continentCompleted(graph, "origins-efficiency", completed),
    true
  );
  assert.deepEqual(
    core.progressSummary(graph, completed),
    { completed: 5, total: 16, percent: 31 }
  );
  assert.deepEqual(
    core.continentProgressSummary(graph, "origins-efficiency", completed),
    {
      completed: 5,
      total: 5,
      percent: 100,
      coreCompleted: 5,
      coreTotal: 5,
      branchCompleted: 0,
      branchTotal: 0,
      coreReady: true,
      complete: true,
    }
  );
});

test("continent two has eleven unique canonical curriculum ids", () => {
  const nodes = core.visibleNodes(graph, "mathematical-tools");
  const ids = nodes.map(({ curriculumId }) => curriculumId);
  assert.equal(nodes.length, 11);
  assert.equal(new Set(graph.nodes.map(({ curriculumId }) => curriculumId)).size, 16);
  assert.deepEqual(ids.slice().sort((left, right) => {
    const leftNumber = Number(left.split(".")[1]);
    const rightNumber = Number(right.split(".")[1]);
    return leftNumber - rightNumber;
  }), [
    "2.1", "2.2", "2.3", "2.4", "2.5", "2.6",
    "2.7", "2.8", "2.9", "2.10", "2.11",
  ]);
});

test("eight core chapters unlock the next continent but eleven make 100 percent", () => {
  const coreIds = core.continentCoreNodeIds(graph, "mathematical-tools");
  const completedCore = new Set(coreIds);
  const coreOnly = core.continentProgressSummary(
    graph,
    "mathematical-tools",
    completedCore
  );
  assert.equal(coreIds.length, 8);
  assert.equal(core.continentCoreCompleted(
    graph,
    "mathematical-tools",
    completedCore
  ), true);
  assert.equal(core.continentCompleted(
    graph,
    "mathematical-tools",
    completedCore
  ), false);
  assert.deepEqual(coreOnly, {
    completed: 8,
    total: 11,
    percent: 73,
    coreCompleted: 8,
    coreTotal: 8,
    branchCompleted: 0,
    branchTotal: 3,
    coreReady: true,
    complete: false,
  });

  const all = new Set(core.visibleNodes(graph, "mathematical-tools").map(({ id }) => id));
  assert.equal(core.continentCompleted(graph, "mathematical-tools", all), true);
  assert.equal(
    core.continentProgressSummary(graph, "mathematical-tools", all).percent,
    100
  );

  const next = structuredClone(core.continentMap(graph).get("data-structures"));
  next.publication = "published";
  assert.equal(
    core.continentAccessState(graph, next, completedCore, false),
    "published-unlocked"
  );
});

test("probability branch entry is dotted while its internal edges are required", () => {
  const edges = core.graphEdges(graph, "mathematical-tools");
  const edge = (sourceId, targetId) => edges.find((item) =>
    item.sourceId === sourceId && item.targetId === targetId
  );
  assert.equal(edge(
    "sets-relations-functions-logic",
    "combinatorics-counting"
  ).kind, "branch");
  assert.equal(edge("combinatorics-counting", "probability-spaces").kind, "route");
  assert.equal(edge(
    "probability-spaces",
    "random-variables-concentration"
  ).kind, "route");

  const continentReady = new Set(core.continentCoreNodeIds(
    graph,
    "origins-efficiency"
  ));
  const branchStart = core.nodeMap(graph).get("combinatorics-counting");
  assert.equal(
    core.nodeAccessState(graph, branchStart, continentReady, false),
    "published-gated"
  );
  continentReady.add("sets-relations-functions-logic");
  assert.equal(
    core.nodeAccessState(graph, branchStart, continentReady, false),
    "published-unlocked"
  );
});

test("future continuations are metadata and never fake published nodes", () => {
  assert.deepEqual(
    core.continentContinuations(graph, "mathematical-tools")
      .map(({ continuation }) => continuation.curriculumId),
    ["3.1", "7.1"]
  );
  assert.equal(core.routeContinuation(graph, "analysis-cases"), null);
  assert.equal(
    core.routeContinuation(graph, "polynomial-efficiency").curriculumId,
    "3.1"
  );
  assert.ok(graph.nodes.every(({ curriculumId }) =>
    curriculumId !== "3.1" && curriculumId !== "7.1"
  ));

  const duplicate = cloneGraph();
  duplicate.routes.find(({ id }) => id === "mathematical-tools-main")
    .continuation.curriculumId = "2.11";
  assert.throws(
    () => core.validateGraph(duplicate),
    /continuation duplicates a published node/
  );

  const unknownTarget = cloneGraph();
  unknownTarget.routes.find(({ id }) => id === "mathematical-tools-main")
    .continuation.targetContinentId = "missing-continent";
  assert.throws(
    () => core.validateGraph(unknownTarget),
    /unknown route continuation continent/
  );
});

test("dataset migration preserves stable progress ids across both continents", () => {
  const completed = [
    "before-computers",
    "asymptotic-estimates",
    "growth-rates",
    "analysis-cases",
    "random-variables-concentration",
  ];
  const storage = memoryStorage({
    [core.STORAGE_KEY]: JSON.stringify({
      schemaVersion: 2,
      datasetVersion: "2026.07.31-2",
      completedNodeIds: completed,
      freeExplore: true,
    }),
  });
  const loaded = core.loadProgress(storage, graph);
  assert.deepEqual(Array.from(loaded.completedNodeIds), completed);
  assert.equal(loaded.freeExplore, true);
  assert.equal(loaded.migrated, true);
});
