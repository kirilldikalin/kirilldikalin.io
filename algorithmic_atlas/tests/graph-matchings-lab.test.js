"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/graph-matchings-core.js");

function finish(state) {
  let current = state;
  let guard = 0;
  while (!current.finished && guard < 5000) {
    current = core.step(current);
    guard += 1;
  }
  assert.ok(current.finished, "трасса обязана завершаться");
  return current;
}

function randomGraph(seed, bipartite) {
  let value = seed >>> 0;
  function random() {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  }
  const nodes = [];
  const leftCount = bipartite ? 1 + Math.floor(random() * 4) : 0;
  const count = bipartite ? leftCount + 1 + Math.floor(random() * 4) : 1 + Math.floor(random() * 8);
  for (let i = 0; i < count; i += 1) {
    nodes.push({ id: "v" + i, label: "v" + i, partition: bipartite ? (i < leftCount ? "L" : "R") : null });
  }
  const edges = [];
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      if (bipartite && (a < leftCount) === (b < leftCount)) continue;
      if (random() < 0.38) edges.push({ id: "e" + (edges.length + 1), source: "v" + a, target: "v" + b });
    }
  }
  return { nodes: nodes, edges: edges };
}

test("редактор сохраняет параллельные рёбра и проверяет доли", function () {
  const graph = core.parseGraphText("A:L, B:R", "A B\nA B", "bipartite");
  assert.equal(graph.edges.length, 2);
  assert.throws(function () { core.parseGraphText("A:L, B:L", "A B", "bipartite"); }, /должно соединять L и R/);
  assert.throws(function () { core.parseGraphText("A, B", "A B", "bipartite"); }, /укажите долю/);
});

test("пустой граф и одиночная вершина завершаются с нулевым ответом", function () {
  [
    core.createState({ mode: "bipartite", graph: core.graphFromPreset("empty") }),
    core.createState({ mode: "blossom", graph: core.graphFromPreset("singleton") }),
  ].forEach(function (state) {
    const done = finish(state);
    assert.deepEqual(done.finalMatchingEdgeIds, []);
    assert.equal(done.analysis.size, 0);
  });
});

test("двудольная трасса находит увеличивающий путь и покрытие Кёнига", function () {
  const graph = core.graphFromPreset("augmenting");
  const state = core.createState({ mode: "bipartite", graph: graph });
  const done = finish(state);
  assert.equal(done.finalMatchingEdgeIds.length, 2);
  assert.equal(done.analysis.size, 2);
  assert.ok(state.frames.some(function (frame) { return frame.phase === "augment" && frame.augmentingPathEdgeIds.length >= 3; }));
  assert.equal(done.minVertexCoverIds.length, 2);
  assert.ok(core.coverIsValid(graph, done.minVertexCoverIds));
});

test("дефицит Холла не выдаётся за совершенное паросочетание", function () {
  const graph = core.graphFromPreset("deficient");
  const done = finish(core.createState({ mode: "bipartite", graph: graph }));
  assert.equal(done.finalMatchingEdgeIds.length, 2);
  assert.equal(done.analysis.size, 2);
  assert.ok(core.coverIsValid(graph, done.minVertexCoverIds));
});

test("несколько оптимумов и параллельные рёбра считаются по ID", function () {
  const multiple = core.createState({ mode: "bipartite", graph: core.graphFromPreset("multiple") });
  const parallel = core.createState({ mode: "bipartite", graph: core.graphFromPreset("parallel") });
  assert.equal(multiple.analysis.size, 2);
  assert.equal(multiple.analysis.count, 2);
  assert.equal(parallel.analysis.size, 2);
  assert.ok(parallel.analysis.count >= 2);
});

test("цветок действительно сжимается и итог совпадает с полным перебором", function () {
  const graph = core.graphFromPreset("blossom");
  const state = core.createState({ mode: "blossom", graph: graph });
  const done = finish(state);
  assert.ok(state.frames.some(function (frame) { return frame.phase === "contract" && frame.blossomVertexIds.length % 2 === 1; }));
  assert.equal(done.finalMatchingEdgeIds.length, done.analysis.size);
  assert.doesNotThrow(function () { core.matchingInfo(graph, done.finalMatchingEdgeIds); });
});

test("пятицикл имеет максимум два и не имеет совершенного паросочетания", function () {
  const graph = core.graphFromPreset("oddCycle");
  const done = finish(core.createState({ mode: "blossom", graph: graph }));
  assert.equal(done.analysis.size, 2);
  assert.equal(done.finalMatchingEdgeIds.length, 2);
  assert.ok(done.analysis.count >= 5);
});

test("двудольный алгоритм совпадает с независимым перебором на малых графах", function () {
  for (let seed = 1; seed <= 80; seed += 1) {
    const graph = randomGraph(seed, true);
    const state = core.createState({ mode: "bipartite", graph: graph });
    assert.equal(state.finalMatchingEdgeIds.length, state.analysis.size, "seed=" + seed);
    assert.doesNotThrow(function () { core.matchingInfo(graph, state.finalMatchingEdgeIds); });
    assert.equal(state.minVertexCoverIds.length, state.analysis.size, "теорема Кёнига, seed=" + seed);
    assert.ok(core.coverIsValid(graph, state.minVertexCoverIds));
  }
});

test("алгоритм цветков совпадает с независимым перебором на малых общих графах", function () {
  for (let seed = 1; seed <= 100; seed += 1) {
    const graph = randomGraph(1000 + seed, false);
    const state = core.createState({ mode: "blossom", graph: graph });
    assert.equal(state.finalMatchingEdgeIds.length, state.analysis.size, "seed=" + seed);
    assert.doesNotThrow(function () { core.matchingInfo(graph, state.finalMatchingEdgeIds); });
  }
});

test("петля игнорируется, а неверное паросочетание отклоняется", function () {
  const graph = core.parseGraphText("a, b", "a a\na b", "blossom");
  const state = core.createState({ mode: "blossom", graph: graph });
  assert.equal(state.finalMatchingEdgeIds.length, 1);
  assert.throws(function () { core.matchingInfo(graph, ["e1"]); }, /Петля/);
  assert.throws(function () { core.matchingInfo(graph, ["e2", "e2"]); }, /не образуют/);
});

test("состояние неизменяемо, step и reset соблюдают общий playback-контракт", function () {
  const state = core.createState({ mode: "bipartite", graph: core.graphFromPreset("augmenting") });
  assert.ok(Object.isFrozen(state));
  const next = core.step(state);
  assert.equal(next.cursor, 1);
  assert.equal(state.cursor, 0);
  assert.equal(core.reset(next).cursor, 0);
  assert.equal(core.seek(state, state.frames.length - 1).finished, true);
});

test("ограничения входа не допускают бесконтрольную трассу", function () {
  const vertices = Array.from({ length: core.MAX_NODES + 1 }, function (_, i) { return "v" + i; }).join(",");
  assert.throws(function () { core.parseGraphText(vertices, "", "blossom"); }, /не более/);
  assert.throws(function () { core.parseGraphText("a,b", "a c", "blossom"); }, /неизвестную вершину/);
  assert.throws(function () { core.createState({ mode: "unknown", graph: { nodes: [], edges: [] } }); }, /Неизвестный режим/);
});
