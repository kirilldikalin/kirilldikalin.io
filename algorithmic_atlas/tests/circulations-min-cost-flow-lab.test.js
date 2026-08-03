"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/circulations-min-cost-flow-core.js");

const atlasRoot = path.join(__dirname, "..");
const adapterPath = path.join(atlasRoot, "labs/circulations-min-cost-flow.js");
const chapterPath = path.join(atlasRoot, "chapters/circulations-min-cost-flow.html");

function bruteForce(network) {
  const normalized = core.normalizeNetwork(network);
  let best = null;
  let count = 0;
  const flow = {};
  function visit(index) {
    if (index === normalized.edges.length) {
      count += 1;
      const check = core.validateFlow(normalized, flow);
      if (check.valid && (best === null || BigInt(check.cost) < BigInt(best.cost))) {
        best = { cost: check.cost, flow: { ...flow } };
      }
      return;
    }
    const edge = normalized.edges[index];
    if (edge.upper === null) throw new Error("brute force requires finite capacities");
    for (let value = BigInt(edge.lower); value <= BigInt(edge.upper); value += 1n) {
      flow[edge.id] = value.toString();
      visit(index + 1);
    }
  }
  visit(0);
  return { best, count };
}

test("lower-bound elimination computes the exact residual balances", () => {
  const shifted = core.lowerShift(core.preset("lowerBounds"));
  assert.deepEqual({ ...shifted.adjusted }, { S: -4n, A: -1n, B: 1n, T: 4n });
  assert.equal(shifted.totalSupply, 5n);
  assert.equal(shifted.totalDemand, 5n);
  assert.deepEqual(shifted.variableEdges.map((edge) => edge.capacity), [4n, 4n, 2n, 4n, 4n]);
});

test("auxiliary max flow reconstructs a valid circulation", () => {
  const network = core.preset("lowerBounds");
  const trace = core.buildFeasibleTrace(network);
  assert.equal(trace.feasible, true);
  assert.equal(trace.unbounded, false);
  const check = core.validateFlow(network, trace.flow);
  assert.equal(check.valid, true);
  assert.deepEqual({ ...check.balances }, { S: "-5", A: "0", B: "0", T: "5" });
  assert.ok(trace.frames.some((frame) => frame.stage === "augment"));
  assert.equal(trace.frames.at(-1).stage, "feasible");
});

test("an unsaturated auxiliary demand proves infeasibility", () => {
  for (const mode of core.MODES) {
    const trace = core.buildTrace(core.preset("infeasible"), { mode });
    assert.equal(trace.feasible, false);
    assert.equal(trace.flow, null);
    assert.equal(trace.frames.at(-1).stage, "infeasible");
    assert.ok(BigInt(trace.frames.at(-1).sent) < BigInt(trace.frames.at(-1).required));
  }
});

test("min-cost solver matches exhaustive enumeration on finite presets", () => {
  for (const name of ["lowerBounds", "parallelZero", "negativeCosts", "finiteNegativeCycle"]) {
    const network = core.preset(name);
    const expected = bruteForce(network);
    assert.ok(expected.count > 0);
    assert.ok(expected.best, name);
    const actual = core.buildMinCostTrace(network);
    assert.equal(actual.feasible, true, name);
    assert.equal(actual.unbounded, false, name);
    assert.equal(actual.cost, expected.best.cost, name);
    assert.equal(core.validateFlow(network, actual.flow).valid, true, name);
  }
});

test("random tiny finite networks match exhaustive minimum-cost search", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    let state = seed >>> 0;
    const next = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0);
    const nodes = [{ id: "S", balance: -2 }, { id: "A", balance: 0 }, { id: "T", balance: 2 }];
    const pairs = [["S", "A"], ["A", "T"], ["S", "T"], ["A", "S"], ["T", "A"]];
    const edges = pairs.map((pair, index) => ({
      id: "e" + index,
      source: pair[0], target: pair[1], lower: 0,
      upper: index < 3 ? 2 : Number(next() % 2),
      cost: Number(next() % 9) - 4,
    }));
    const network = { nodes, edges };
    const expected = bruteForce(network).best;
    const actual = core.buildMinCostTrace(network);
    assert.ok(expected, "constructed direct paths make seed feasible " + seed);
    assert.equal(actual.feasible, true, "seed " + seed);
    assert.equal(actual.unbounded, false, "seed " + seed);
    assert.equal(actual.cost, expected.cost, "seed " + seed);
  }
});

test("finite negative cycles are saturated rather than called unbounded", () => {
  const trace = core.buildMinCostTrace(core.preset("finiteNegativeCycle"));
  const frame = trace.frames.find((item) => item.stage === "cycle-cancel");
  assert.ok(frame);
  assert.equal(frame.cycleCost, "-3");
  assert.equal(frame.amount, "3");
  assert.equal(trace.unbounded, false);
  assert.equal(trace.cost, "-5");
});

test("an all-infinite negative residual cycle is reported as unbounded", () => {
  const trace = core.buildMinCostTrace(core.preset("unbounded"));
  assert.equal(trace.feasible, true);
  assert.equal(trace.unbounded, true);
  assert.equal(trace.cost, null);
  assert.equal(trace.frames.at(-1).stage, "unbounded");
  assert.equal(trace.frames.at(-1).cycleCost, "-2");
});

test("infeasibility takes precedence over a disconnected unbounded cycle", () => {
  const network = {
    nodes: [
      { id: "S", balance: -1 }, { id: "T", balance: 1 },
      { id: "A", balance: 0 }, { id: "B", balance: 0 },
    ],
    edges: [
      { id: "ab", source: "A", target: "B", lower: 0, upper: null, cost: -2 },
      { id: "ba", source: "B", target: "A", lower: 0, upper: null, cost: 0 },
    ],
  };
  const trace = core.buildMinCostTrace(network);
  assert.equal(trace.feasible, false);
  assert.equal(trace.unbounded, false);
  assert.equal(trace.frames.at(-1).stage, "infeasible");
});

test("potentials certify nonnegative reduced costs in every certified frame", () => {
  for (const name of ["lowerBounds", "negativeCosts", "finiteNegativeCycle"]) {
    const trace = core.buildMinCostTrace(core.preset(name));
    const certified = trace.frames.filter((frame) => frame.reducedCostsValid);
    assert.ok(certified.length >= 1, name);
    for (const frame of certified) {
      for (const arc of frame.residual) {
        assert.ok(BigInt(arc.reducedCost) >= 0n, `${name}: ${arc.id}`);
      }
    }
  }
});

test("negative edge costs are accepted without confusing them with negative cycles", () => {
  const trace = core.buildMinCostTrace(core.preset("negativeCosts"));
  assert.equal(trace.feasible, true);
  assert.equal(trace.unbounded, false);
  assert.equal(trace.cost, "-4");
  assert.ok(trace.frames.some((frame) => frame.stage === "potentials"));
  assert.ok(trace.frames.some((frame) => frame.stage === "shortest-augment"));
});

test("zero capacities and parallel edges retain distinct identities", () => {
  const network = core.preset("parallelZero");
  const trace = core.buildMinCostTrace(network);
  assert.equal(trace.flow.e1, "0");
  assert.equal(trace.flow.e2, "1");
  assert.equal(trace.flow.e3, "2");
  assert.equal(trace.flow.e4, "3");
  assert.equal(core.validateFlow(network, trace.flow).valid, true);
});

test("large capacities and costs remain exact BigInt products", () => {
  const network = core.preset("huge");
  const trace = core.buildMinCostTrace(network);
  const amount = 900719925474099312345678n;
  const unitCost = 12345678901234567890n;
  assert.equal(trace.flow.e1, amount.toString());
  assert.equal(trace.cost, (amount * unitCost).toString());
  assert.doesNotMatch(JSON.stringify(trace), /Infinity|NaN|e\+/);
});

test("empty and singleton zero-balance networks are feasible and terminate", () => {
  for (const network of [
    { nodes: [], edges: [] },
    { nodes: [{ id: "A", balance: 0 }], edges: [] },
  ]) {
    for (const mode of core.MODES) {
      const trace = core.buildTrace(network, { mode });
      assert.equal(trace.feasible, true);
      assert.deepEqual({ ...trace.flow }, {});
      assert.equal(trace.frames.at(-1).finished, true);
    }
  }
});

test("unbalanced total demand is rejected as infeasible without augmentation", () => {
  const network = { nodes: [{ id: "A", balance: 1 }], edges: [] };
  const trace = core.buildFeasibleTrace(network);
  assert.equal(trace.feasible, false);
  assert.equal(trace.frames.length, 2);
  assert.match(trace.frames.at(-1).message, /Суммарный спрос/);
});

test("normalization and flow validation fail closed", () => {
  assert.throws(() => core.normalizeNetwork(null), /объектом/);
  assert.throws(() => core.normalizeNetwork({ nodes: [{ id: "A" }], edges: [{ source: "A", target: "Z" }] }), /неизвестную/);
  assert.throws(() => core.normalizeNetwork({ nodes: [{ id: "A" }], edges: [{ source: "A", target: "A", lower: 4, upper: 3 }] }), /больше верхней/);
  assert.throws(() => core.parseInteger(Number.MAX_SAFE_INTEGER + 1, "x", true), /строкой/);
  assert.throws(() => core.parseInteger("1.5", "x", true), /целое/);
  assert.throws(() => core.buildTrace(core.preset("lowerBounds"), { mode: "mystery" }), /Неизвестный/);
  assert.throws(() => core.validateFlow(core.preset("lowerBounds"), { e1: "99" }), /границы/);
});

test("playback is immutable, bounded and does not leak a future verdict", () => {
  const initial = core.createState(core.preset("infeasible"), { mode: "feasible" });
  assert.equal(initial.playback.current.feasible, null);
  const next = core.step(initial);
  assert.equal(initial.playback.cursor, 0);
  assert.equal(next.playback.cursor, 1);
  assert.ok(Object.isFrozen(next));
  assert.throws(() => core.seek(initial, 999), /целое число/);
  const final = core.seek(initial, initial.playback.frames.length - 1);
  assert.equal(core.visualModel(final).frame.feasible, false);
});

test("chapter and adapter use the shared full-width graph runtime without eval", () => {
  assert.equal(fs.existsSync(adapterPath), true);
  assert.equal(fs.existsSync(chapterPath), true);
  const adapter = fs.readFileSync(adapterPath, "utf8");
  const chapter = fs.readFileSync(chapterPath, "utf8");
  assert.match(adapter, /AtlasGraphLabRuntime/);
  assert.match(adapter, /graphRuntime\.mount/);
  assert.match(adapter, /runtime\.mount/);
  assert.match(adapter, /maxAutomaticSteps:\s*256/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new Function/);
  assert.match(chapter, /atlas-block--fullwidth/);
  assert.match(chapter, /data-atlas-lab="circulations-min-cost-flow"/);
});

test("chapter provides strict formulas, semantic pseudocode and exercises", () => {
  const chapter = fs.readFileSync(chapterPath, "utf8");
  assert.ok((chapter.match(/data-formula-id="mcf-/g) || []).length >= 12);
  assert.ok((chapter.match(/notation-id-mcf-/g) || []).length >= 36);
  assert.ok((chapter.match(/class="atlas-exercise"/g) || []).length >= 10);
  assert.match(chapter, /FeasibleCirculation/);
  assert.match(chapter, /SuccessiveShortestPaths/);
  assert.match(chapter, /https:\/\/doi\.org\/10\.1287\/mnsc\.14\.3\.205/);
  assert.match(chapter, /https:\/\/doi\.org\/10\.1145\/76359\.76368/);
  assert.match(chapter, /9780136175490/);
});
