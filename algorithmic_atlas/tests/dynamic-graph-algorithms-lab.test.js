"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/dynamic-graph-algorithms-core.js");

function finish(state) {
  let current = state;
  let guard = 0;
  while (!current.finished && guard < 1000) { current = core.step(current); guard += 1; }
  assert.ok(current.finished);
  return current;
}

function edgeMap(edges) { return new Map(edges.map(function (edge) { return [edge.id, edge]; })); }

function bruteConnected(nodes, active, source, target) {
  if (source === target) return true;
  const queue = [source];
  const seen = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const edge of active.values()) {
      let next = null;
      if (edge.source === queue[cursor]) next = edge.target;
      else if (edge.target === queue[cursor]) next = edge.source;
      if (next === null || seen.has(next)) continue;
      if (next === target) return true;
      seen.add(next); queue.push(next);
    }
  }
  return false;
}

function assertForest(nodes, active, forestIds) {
  const parent = Object.create(null);
  nodes.forEach(function (node) { parent[node.id] = node.id; });
  function find(id) { while (parent[id] !== id) id = parent[id]; return id; }
  forestIds.forEach(function (id) {
    const edge = active.get(id);
    assert.ok(edge, "древесное ребро активно");
    assert.notEqual(edge.source, edge.target, "петля не входит в лес");
    const a = find(edge.source); const b = find(edge.target);
    assert.notEqual(a, b, "лес не содержит цикл");
    parent[a] = b;
  });
}

test("парсер различает ID параллельных рёбер и отклоняет неверную шкалу", function () {
  const timeline = core.parseTimeline("A,B", "+ e1 A B\n+ e2 A B\n- e1\n? A B");
  assert.equal(timeline.edges.length, 2);
  assert.equal(timeline.operations.length, 4);
  assert.throws(function () { core.parseTimeline("A,B", "- e1"); }, /ещё не добавленное/);
  assert.throws(function () { core.parseTimeline("A,B", "+ e1 A B\n- e1\n- e1"); }, /уже удалено/);
  assert.throws(function () { core.parseTimeline("A,B", "+ e1 A C"); }, /неизвестную вершину/);
  assert.throws(function () { core.parseTimeline("A,B", "+ e1 A B\n- e1\n+ e1 A B"); }, /уже использован/);
});

test("удаление древесного ребра повышает пересекающий разрез резерв", function () {
  const state = core.createState({ timeline: core.timelineFromPreset("replacement") });
  const deletion = state.frames.find(function (frame) { return frame.operation && frame.operation.type === "remove"; });
  assert.equal(deletion.phase, "remove-tree");
  assert.equal(deletion.promotedEdgeId, "e4");
  assert.ok(deletion.replacementCandidateIds.includes("e4"));
  assert.ok(deletion.invariantHolds);
  const done = finish(state);
  assert.equal(done.current.dynamicResult, true);
  assert.equal(done.current.baselineResult, true);
});

test("параллельное ребро служит настоящей заменой", function () {
  const state = core.createState({ timeline: core.timelineFromPreset("parallel") });
  const deletion = state.frames.find(function (frame) { return frame.operation && frame.operation.type === "remove" && frame.operation.edgeId === "e1"; });
  assert.equal(deletion.promotedEdgeId, "e2");
  const final = finish(state).current;
  assert.equal(final.dynamicResult, false);
  assert.equal(final.baselineResult, false);
});

test("петля не входит в лес, но запрос вершины к себе истинен", function () {
  const state = core.createState({ timeline: core.timelineFromPreset("loop") });
  const loopFrame = state.frames[1];
  assert.deepEqual(loopFrame.forestEdgeIds, []);
  assert.deepEqual(loopFrame.nonTreeEdgeIds, ["loop"]);
  assert.equal(finish(state).current.dynamicResult, true);
});

test("пустая шкала и одиночная вершина безопасны", function () {
  const empty = core.createState({ timeline: core.timelineFromPreset("empty") });
  assert.equal(empty.frames.length, 1);
  assert.ok(empty.finished);
  const singleton = finish(core.createState({ timeline: core.timelineFromPreset("singleton") }));
  assert.equal(singleton.current.dynamicResult, true);
  assert.equal(singleton.current.baselineResult, true);
});

test("обратное время точно отвечает на deletion-only последовательность", function () {
  const nodes = ["A", "B", "C", "D"];
  const edges = [
    { id: "e1", source: "A", target: "B" },
    { id: "e2", source: "B", target: "C" },
    { id: "e3", source: "C", target: "D" },
    { id: "e4", source: "A", target: "D" },
  ];
  const operations = [
    { type: "query", source: "A", target: "C" },
    { type: "remove", edgeId: "e2" },
    { type: "query", source: "B", target: "C" },
    { type: "remove", edgeId: "e4" },
    { type: "query", source: "A", target: "D" },
  ];
  assert.deepEqual(core.solveDeletionOnlyReverse(nodes, edges, operations), [true, null, true, null, false]);
});

test("каждый кадр примеров хранит остовный лес с теми же компонентами", function () {
  Object.keys(core.PRESETS).forEach(function (name) {
    const timeline = core.timelineFromPreset(name);
    const state = core.createState({ timeline: timeline });
    state.frames.forEach(function (frame) {
      const active = edgeMap(frame.activeEdges);
      assertForest(timeline.nodes, active, frame.forestEdgeIds);
      assert.equal(core.partitionsAgree(timeline.nodes, active, frame.forestEdgeIds), true, name);
      assert.equal(frame.invariantHolds, true, name);
    });
  });
});

function randomTimeline(seed) {
  let value = seed >>> 0;
  function random() { value = (1664525 * value + 1013904223) >>> 0; return value / 0x100000000; }
  const count = 1 + Math.floor(random() * 8);
  const vertices = Array.from({ length: count }, function (_, i) { return "v" + i; });
  const active = new Map();
  const operations = [];
  let edgeCounter = 0;
  for (let step = 0; step < 35; step += 1) {
    const roll = random();
    if (roll < 0.47 || active.size === 0) {
      const source = vertices[Math.floor(random() * count)];
      const target = vertices[Math.floor(random() * count)];
      edgeCounter += 1;
      const id = "e" + edgeCounter;
      active.set(id, [source, target]);
      operations.push("+ " + id + " " + source + " " + target);
    } else if (roll < 0.72) {
      const ids = Array.from(active.keys());
      const id = ids[Math.floor(random() * ids.length)];
      active.delete(id);
      operations.push("- " + id);
    } else {
      const source = vertices[Math.floor(random() * count)];
      const target = vertices[Math.floor(random() * count)];
      operations.push("? " + source + " " + target);
    }
  }
  return core.parseTimeline(vertices.join(","), operations.join("\n"));
}

test("динамический лес совпадает с независимым BFS на случайных последовательностях", function () {
  for (let seed = 1; seed <= 120; seed += 1) {
    const timeline = randomTimeline(seed);
    const state = core.createState({ timeline: timeline });
    const allEdges = edgeMap(timeline.edges);
    const active = new Map();
    let frameIndex = 1;
    timeline.operations.forEach(function (operation) {
      if (operation.type === "add") active.set(operation.edgeId, allEdges.get(operation.edgeId));
      else if (operation.type === "remove") active.delete(operation.edgeId);
      const frame = state.frames[frameIndex++];
      assertForest(timeline.nodes, active, frame.forestEdgeIds);
      assert.equal(core.partitionsAgree(timeline.nodes, active, frame.forestEdgeIds), true, "seed=" + seed);
      if (operation.type === "query") {
        assert.equal(frame.dynamicResult, bruteConnected(timeline.nodes, active, operation.source, operation.target), "seed=" + seed);
        assert.equal(frame.baselineResult, frame.dynamicResult, "seed=" + seed);
      }
    });
  }
});

test("счётчики работы конечны и накопительные суммы точны", function () {
  const state = core.createState({ timeline: core.timelineFromPreset("adversarial") });
  let baseline = 0; let dynamic = 0;
  state.frames.slice(1).forEach(function (frame) {
    assert.ok(Number.isSafeInteger(frame.baselineWork) && frame.baselineWork >= 0);
    assert.ok(Number.isSafeInteger(frame.dynamicWork) && frame.dynamicWork >= 0);
    baseline += frame.baselineWork; dynamic += frame.dynamicWork;
    assert.equal(frame.cumulativeBaselineWork, baseline);
    assert.equal(frame.cumulativeDynamicWork, dynamic);
  });
});

test("playback неизменяем и поддерживает step, seek и reset", function () {
  const state = core.createState({ timeline: core.timelineFromPreset("replacement") });
  assert.ok(Object.isFrozen(state));
  assert.equal(core.step(state).cursor, 1);
  assert.equal(state.cursor, 0);
  assert.equal(core.seek(state, state.frames.length - 1).finished, true);
  assert.equal(core.reset(core.step(state)).cursor, 0);
});

test("размеры ввода ограничены до построения трассы", function () {
  const tooManyNodes = Array.from({ length: core.MAX_NODES + 1 }, function (_, i) { return "v" + i; }).join(",");
  assert.throws(function () { core.parseTimeline(tooManyNodes, ""); }, /не более/);
  const tooManyOperations = Array.from({ length: core.MAX_OPERATIONS + 1 }, function (_, i) { return "? A A"; }).join("\n");
  assert.throws(function () { core.parseTimeline("A", tooManyOperations); }, /не более/);
});
