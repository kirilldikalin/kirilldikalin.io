"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/max-flow-min-cut-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterPath = path.join(atlasRoot, "labs/max-flow-min-cut.js");
const chapterPath = path.join(atlasRoot, "chapters/max-flow-min-cut.html");

function finish(options) {
  return core.runToEnd(core.createState(options));
}

function minCutByEnumeration(rawNetwork, source, sink) {
  const network = core.normalizeNetwork(rawNetwork);
  const middle = network.nodes.map(({ id }) => id).filter((id) => id !== source && id !== sink);
  let best = null;
  for (let mask = 0; mask < 2 ** middle.length; mask += 1) {
    const sourceSide = new Set([source]);
    middle.forEach((id, index) => {
      if (mask & (2 ** index)) sourceSide.add(id);
    });
    let capacity = 0n;
    network.edges.forEach((edge) => {
      if (sourceSide.has(edge.source) && !sourceSide.has(edge.target)) {
        capacity += BigInt(edge.capacity);
      }
    });
    if (best === null || capacity < best) best = capacity;
  }
  return best;
}

function generatedNetwork(seed) {
  const nodes = Array.from({ length: 6 }, (_, index) => ({
    id: index === 0 ? "s" : index === 5 ? "t" : "v" + index,
  }));
  const edges = [];
  let state = seed >>> 0;
  function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  for (let source = 0; source < nodes.length; source += 1) {
    for (let target = 0; target < nodes.length; target += 1) {
      if (source === target || next() % 5 > 1) continue;
      edges.push({
        id: "e" + edges.length,
        source: nodes[source].id,
        target: nodes[target].id,
        capacity: String(next() % 10),
      });
    }
  }
  return { nodes, edges };
}

function shortestResidualLength(frame, source, sink) {
  const outgoing = new Map();
  for (const arc of frame.residual) {
    if (BigInt(arc.capacity) === 0n) continue;
    if (!outgoing.has(arc.source)) outgoing.set(arc.source, []);
    outgoing.get(arc.source).push(arc);
  }
  const queue = [[source, 0]];
  const seen = new Set([source]);
  for (let index = 0; index < queue.length; index += 1) {
    const [vertex, distance] = queue[index];
    if (vertex === sink) return distance;
    for (const arc of outgoing.get(vertex) || []) {
      if (seen.has(arc.target)) continue;
      seen.add(arc.target);
      queue.push([arc.target, distance + 1]);
    }
  }
  return null;
}

function assertNoUnsafeNumericPayload(value) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    assert.ok(Number.isSafeInteger(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoUnsafeNumericPayload);
    return;
  }
  if (value && typeof value === "object") Object.values(value).forEach(assertNoUnsafeNumericPayload);
}

test("all three algorithms agree with an independent exhaustive min cut", () => {
  for (let seed = 1; seed <= 18; seed += 1) {
    const network = generatedNetwork(seed);
    const expected = minCutByEnumeration(network, "s", "t").toString();
    for (const mode of core.MODES) {
      const state = finish({ mode, network, source: "s", sink: "t" });
      assert.equal(state.current.phase, "finish", mode + " seed " + seed);
      assert.equal(state.current.value, expected, mode + " seed " + seed);
      assert.equal(state.current.cut.capacity, expected, mode + " seed " + seed);
      assert.equal(state.current.cut.isSeparating, true);
      assert.equal(
        core.validateFlow(state.network, state.current.flows, "s", "t").valid,
        true
      );
    }
  }
});

test("a reverse residual arc cancels a locally bad Ford–Fulkerson choice", () => {
  const state = core.createState({
    mode: "ford-fulkerson",
    preset: "cancellation",
    pathOrder: "input",
  });
  const augmentations = state.frames.filter(({ phase }) => phase === "augment");
  assert.deepEqual(augmentations[0].activePathVertices, ["s", "a", "b", "t"]);
  assert.deepEqual(augmentations[1].activePathVertices, ["s", "b", "a", "t"]);
  assert.equal(augmentations[1].usesReverseArc, true);
  assert.ok(augmentations[1].activeArcIds.includes("e3:reverse"));
  assert.equal(finish({
    mode: "ford-fulkerson",
    preset: "cancellation",
    pathOrder: "input",
  }).current.value, "2");

  const reverseOrder = core.createState({
    mode: "ford-fulkerson",
    preset: "cancellation",
    pathOrder: "reverse",
  });
  assert.notDeepEqual(
    reverseOrder.frames.filter(({ phase }) => phase === "augment")[0].activePathVertices,
    augmentations[0].activePathVertices
  );
});

test("Edmonds–Karp always augments on a shortest residual path", () => {
  const state = core.createState({ mode: "edmonds-karp", preset: "classic" });
  state.frames.forEach((frame, index) => {
    if (frame.phase !== "augment") return;
    const previous = state.frames[index - 1];
    const shortest = shortestResidualLength(previous, state.source, state.sink);
    assert.equal(frame.activeArcIds.length, shortest);
  });
});

test("Dinic exposes increasing sink levels and blocking-flow boundaries", () => {
  const state = core.createState({ mode: "dinic", preset: "classic" });
  const reachableLevels = state.frames
    .filter(({ phase, levels }) => phase === "level" && levels.t !== null)
    .map(({ levels }) => levels.t);
  for (let index = 1; index < reachableLevels.length; index += 1) {
    assert.ok(reachableLevels[index] > reachableLevels[index - 1]);
  }
  assert.ok(state.frames.some(({ phase }) => phase === "blocking"));
  state.frames.filter(({ phase }) => phase === "augment").forEach((frame) => {
    frame.activeArcIds.forEach((arcId) => {
      const arc = frame.residual.find(({ id }) => id === arcId);
      assert.equal(frame.levels[arc.target], frame.levels[arc.source] + 1);
    });
  });
});

test("integral capacities keep every flow and bottleneck integral", () => {
  for (const preset of Object.keys(core.PRESETS)) {
    const state = finish({ mode: "edmonds-karp", preset });
    state.frames.forEach((frame) => {
      Object.values(frame.flows).forEach((value) => assert.match(value, /^\d+$/));
      if (frame.bottleneck !== null) assert.match(frame.bottleneck, /^\d+$/);
    });
  }
});

test("zero capacity, parallel arcs, unreachable sink and multiple optima are explicit", () => {
  const parallel = finish({ mode: "edmonds-karp", preset: "parallelZero" });
  assert.equal(parallel.current.value, "7");
  assert.equal(parallel.current.flows.e3, "0");
  assert.equal(parallel.current.cut.capacity, "7");

  const unreachable = finish({ mode: "dinic", preset: "unreachable" });
  assert.equal(unreachable.current.value, "0");
  assert.equal(unreachable.current.cut.capacity, "0");
  assert.equal(unreachable.current.cut.isSeparating, true);

  const multiple = finish({ mode: "ford-fulkerson", preset: "multiple" });
  assert.equal(multiple.current.value, "6");
  assert.equal(multiple.current.cut.capacity, "6");
});

test("huge capacities remain exact and never enter Number arithmetic", () => {
  for (const mode of core.MODES) {
    const state = finish({ mode, preset: "huge" });
    assert.equal(state.current.value, "1700719925474099312345678");
    assert.equal(state.current.cut.capacity, state.current.value);
    assertNoUnsafeNumericPayload(state);
    assert.doesNotMatch(JSON.stringify(state), /Infinity|NaN|e\+/);
  }
  assert.throws(() => core.parseCapacity(Number.MAX_SAFE_INTEGER + 1), /строкой/);
});

test("the augmentation guard stops safely without claiming optimality", () => {
  const state = finish({
    mode: "ford-fulkerson",
    preset: "classic",
    maxAugmentations: 1,
  });
  assert.equal(state.current.phase, "limit");
  assert.equal(state.current.stoppedByLimit, true);
  assert.equal(state.current.cut.isSeparating, false);
  assert.match(state.current.message, /не сертификат/);
});

test("parser is deterministic and rejects malformed networks", () => {
  const network = core.parseNetworkText(
    "s, a, t",
    "s a 0; s a 7; a t 7"
  );
  assert.deepEqual(core.networkText(network), {
    vertices: "s, a, t",
    edges: "s a 0; s a 7; a t 7",
  });
  assert.throws(() => core.parseNetworkText("s,a", "s a -1"), /неотрицательное/);
  assert.throws(() => core.parseNetworkText("s,a", "s a 1 extra"), /формат/);
  assert.throws(() => core.parseNetworkText("s,a", "s z 1"), /неизвестную вершину/);
  assert.throws(() => core.parseNetworkText("s,a", "s s 1"), /Петля/);
  assert.throws(() => core.parseCapacity("9".repeat(41)), /40 цифр/);
  assert.throws(() => core.createState({
    mode: "edmonds-karp",
    network,
    source: "s",
    sink: "s",
  }), /различаться/);
});

test("residual capacities preserve forward and reverse values per parallel edge", () => {
  const network = core.networkFromPreset("parallelZero");
  const first = core.createState({ mode: "edmonds-karp", network, source: "s", sink: "t" });
  const frame = first.frames.find(({ phase }) => phase === "augment");
  for (const edge of network.edges) {
    const forward = frame.residual.find(({ edgeId, kind }) => edgeId === edge.id && kind === "forward");
    const reverse = frame.residual.find(({ edgeId, kind }) => edgeId === edge.id && kind === "reverse");
    assert.equal(
      BigInt(forward.capacity) + BigInt(reverse.capacity),
      BigInt(edge.capacity)
    );
  }
});

test("adapter uses shared full-width graph runtimes and all required modes", () => {
  const adapterSource = fs.readFileSync(adapterPath, "utf8");
  for (const mode of core.MODES) assert.match(adapterSource, new RegExp('value="' + mode + '"'));
  assert.match(adapterSource, /AtlasGraphLabRuntime/);
  assert.equal((adapterSource.match(/graphRuntime\.mount/g) || []).length, 2);
  assert.match(adapterSource, /runtime\.mount/);
  assert.match(adapterSource, /maxAutomaticSteps:\s*4096/);
  assert.match(adapterSource, /path-order/);
  assert.doesNotMatch(adapterSource, /\beval\s*\(|new Function/);
});

test("chapter contract includes formulas, semantic hooks, exercises and primary sources", () => {
  const chapterSource = fs.readFileSync(chapterPath, "utf8");
  assert.match(chapterSource, /atlas-block--fullwidth/);
  assert.match(chapterSource, /data-atlas-lab="max-flow-min-cut"/);
  assert.match(chapterSource, /max-flow-min-cut-core\.js/);
  assert.match(chapterSource, /graph-lab-runtime\.js/);
  assert.ok((chapterSource.match(/data-formula-id=/g) || []).length >= 14);
  assert.ok((chapterSource.match(/notation-id-(?:flow|graph)-/g) || []).length >= 38);
  assert.ok((chapterSource.match(/class="atlas-exercise"/g) || []).length >= 10);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.4153\/CJM-1956-045-5/);
  assert.match(chapterSource, /https:\/\/doi\.org\/10\.1145\/321694\.321699/);
  assert.match(chapterSource, /https:\/\/www\.mathnet\.ru\/eng\/dan35701/);
});
