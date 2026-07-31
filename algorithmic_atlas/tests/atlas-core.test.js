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
  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.routes.length, 2);
  assert.deepEqual(
    graph.continents.map(({ name }) => name),
    [
      "Истоки и эффективность",
      "Математические инструменты",
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
    1
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
  assert.deepEqual(
    core.routeOrder(graph, "world-main").map(({ id }) => id),
    expectedWorld
  );
  assert.deepEqual(
    core.routeOrder(graph, "origins-main").map(({ id }) => id),
    expectedOrigins
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
  assert.deepEqual(
    core.topologicalOrder(shuffled).map(({ id }) => id),
    expectedOrigins
  );
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
  assert.equal(fifth.next, null);
  assert.deepEqual(fifth.nextAll, []);

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
  const makeNode = (id, prerequisites, route) => ({
    ...structuredClone(template),
    id,
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
  const makeNode = (id, prerequisites, route) => ({
    ...structuredClone(template),
    id,
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

test("the fifth chapter gates on chapter four and ends the first continent route", () => {
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
  assert.equal(core.routeNeighbors(graph, fifth.id).next, null);
  assert.equal(core.nodeMap(graph).has("growth-rates"), false);
  assert.equal(core.nodeMap(graph).has("analysis-cases"), false);
  assert.equal(core.nodeMap(graph).has("polynomial-efficiency"), false);
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
    core.continentAccessState(graph, math, new Set(), true),
    "planned"
  );

  const publishedMath = structuredClone(math);
  publishedMath.publication = "published";
  assert.equal(
    core.continentAccessState(graph, publishedMath, new Set(), false),
    "published-gated"
  );
  assert.equal(
    core.continentAccessState(graph, publishedMath, new Set(), true),
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
    { completed: 5, total: 5, percent: 100 }
  );
});
