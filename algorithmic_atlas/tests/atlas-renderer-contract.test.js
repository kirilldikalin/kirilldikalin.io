const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../atlas-core.js");

const atlasScript = fs.readFileSync(
  path.join(__dirname, "../atlas.js"),
  "utf8"
);
const atlasHtml = fs.readFileSync(
  path.join(__dirname, "../index.html"),
  "utf8"
);
const atlasStyles = fs.readFileSync(
  path.join(__dirname, "../atlas.css"),
  "utf8"
);
const chapterScript = fs.readFileSync(
  path.join(__dirname, "../chapter.js"),
  "utf8"
);
const graph = core.validateGraph(JSON.parse(fs.readFileSync(
  path.join(__dirname, "../data/atlas-graph.json"),
  "utf8"
)));

test("interactive world lands leave the hidden decorative layer only in world view", () => {
  assert.match(
    atlasScript,
    /elements\.lands\.removeAttribute\("aria-hidden"\)/
  );
  assert.match(
    atlasScript,
    /elements\.lands\.setAttribute\("aria-hidden", "true"\)/
  );
});

test("the renderer discovers main routes from graph fields", () => {
  assert.doesNotMatch(atlasScript, /routeOrder\(graph, "(?:world|origins)-main"\)/);
  assert.match(atlasScript, /core\.mainRoute\(graph, "continents"\)/);
  assert.match(atlasScript, /core\.mainRoute\(graph, "nodes", continentId\)/);
});

test("parallel continent regions render map areas and accessible progress", () => {
  assert.match(atlasHtml, /id="atlas-region-progress"/);
  assert.match(atlasScript, /core\.regionProgressSummary\(/);
  assert.match(atlasScript, /region\.mapArea\.path/);
  assert.match(atlasScript, /class: "atlas-region-area is-region-/);
  assert.match(atlasScript, /class: "atlas-region-label is-region-/);
  assert.match(atlasStyles, /\.atlas-region-progress\s*\{/);
  assert.match(atlasStyles, /\.atlas-region-area\s*\{/);
  assert.match(atlasStyles, /pointer-events:\s*none/);
});

test("the last chapter returns to the world map and names the next continent", () => {
  assert.match(chapterScript, /atlasCore\.routeForContinent\(graph, node\.continentId\)/);
  assert.match(chapterScript, /mapLink\.href = "\.\.\/index\.html"/);
  assert.match(chapterScript, /mapLink\.textContent = "Общая карта"/);
  assert.match(chapterScript, /"Следующий материк: " \+ continent\.name/);
  assert.match(chapterScript, /atlasCore\.routeContinuation\(graph, nodeId\)/);
  assert.match(chapterScript, /continuation\.curriculumId \+ " · "/);
  assert.match(chapterScript, /if \(!neighbors\.continentExit\)/);
  assert.match(chapterScript, /Конец области · выберите следующий маршрут на карте/);
});

test("feature metadata has no chip UI on the map page", () => {
  [atlasHtml, atlasScript, atlasStyles].forEach((source) => {
    assert.doesNotMatch(
      source,
      /atlas-node-features|atlas-feature-list|renderFeatures/
    );
  });
});

test("world and local maps use non-interactive route and development fog", () => {
  assert.match(atlasHtml, /id="atlas-route-fog-pattern"/);
  assert.match(atlasHtml, /id="atlas-development-fog-pattern"/);
  assert.match(atlasHtml, /id="atlas-water-pattern"/);
  assert.match(atlasHtml, /id="atlas-fog-soften"/);
  assert.match(
    atlasHtml,
    /id="atlas-nodes"[\s\S]*?id="atlas-fog-layer"/
  );
  assert.match(atlasScript, /atlas-world-fog/);
  assert.match(atlasScript, /atlas-node-fog/);
  assert.match(atlasScript, /elements\.fog\.appendChild/);
  assert.match(atlasScript, /state === "planned" \? "is-development-fog" : "is-route-fog"/);
  assert.match(
    atlasStyles,
    /\.atlas-water-texture,\s*\.atlas-world-terrain,\s*\.atlas-fog\s*\{[^}]*pointer-events:\s*none/s
  );
  assert.doesNotMatch(
    atlasStyles,
    /\.atlas-world-land\.is-(?:planned|published-gated)\s*\{[^}]*stroke-dasharray/s
  );
});

test("free exploration removes route fog but never development fog", () => {
  const completed = new Set();
  const published = graph.nodes.filter((node) => node.publication === "published");
  const planned = graph.nodes.filter((node) => node.publication === "planned");
  const continentsById = new Map(
    graph.continents.map((continent) => [continent.id, continent])
  );
  const initiallyUnlocked = published.filter((node) => {
    const continent = continentsById.get(node.continentId);
    return continent.prerequisites.length === 0 && node.prerequisites.length === 0;
  });
  assert.equal(
    published.filter((node) =>
      core.nodeAccessState(graph, node, completed, false) === "published-gated"
    ).length,
    published.length - initiallyUnlocked.length
  );
  assert.ok(published.every((node) =>
    core.nodeAccessState(graph, node, completed, true) === "published-unlocked"
  ));
  assert.ok(planned.every((node) =>
    core.nodeAccessState(graph, node, completed, true) === "planned"
  ));
  assert.equal(published.length + planned.length, graph.nodes.length);
  assert.deepEqual(
    core.continentContinuations(graph, "mathematical-tools")
      .map(({ continuation }) => continuation.curriculumId),
    ["7.1"]
  );
  assert.deepEqual(
    core.continentContinuations(graph, "data-structures")
      .map(({ continuation }) => continuation.curriculumId),
    ["9.8", "7.3", "9.13"]
  );
  assert.deepEqual(
    new Set(core.continentContinuations(graph, "algorithm-design")
      .map(({ continuation }) => continuation.curriculumId)),
    new Set(["7.13", "8.4", "8.9", "8.14"])
  );
  assert.deepEqual(
    new Set(core.continentContinuations(graph, "graphs-networks-optimization")
      .map(({ continuation }) => continuation.curriculumId)),
    new Set(["7.9", "7.11", "8.10", "9.3", "9.4"])
  );
  assert.match(
    atlasScript,
    /Все опубликованные главы уже доступны\. Запланированные материки останутся в тумане/
  );
});

test("local map renders canonical labels, branch edges and planned exits", () => {
  assert.match(atlasScript, /number\.textContent = completed \? "✓" : node\.curriculumId/);
  assert.match(atlasScript, /kind === "branch" \? " is-branch"/);
  assert.match(atlasScript, /core\.continentContinuations\(graph, continentId\)/);
  assert.match(atlasScript, /renderContinuationFog\(item\.continuation\)/);
  assert.match(atlasScript, /continentProgressSummary/);
  assert.match(atlasHtml, /id="atlas-continent-progress"/);
  assert.match(atlasStyles, /\.atlas-edge\.is-branch/);
  assert.match(atlasStyles, /\.atlas-route-exit__marker/);
});
