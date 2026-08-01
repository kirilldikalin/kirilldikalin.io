const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/local-search-core.js");

test("landscape generation is seeded and its global maximum is locally optimal", () => {
  const first = core.createLandscape(41);
  const second = core.createLandscape(41);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.cells, core.createLandscape(42).cells);
  const optimumKeys = new Set(
    core.localOptima(first).map((cell) => cell.x + ":" + cell.y)
  );
  assert.ok(optimumKeys.has(first.maximum.x + ":" + first.maximum.y));
});

test("first and best improvement never decrease potential between restarts", () => {
  ["first", "best"].forEach((strategy) => {
    const trace = core.buildTrace({
      strategy,
      seed: 41,
      restarts: 0,
      startX: 1,
      startY: 1,
    });
    let previous = trace.frames[0].current.value;
    trace.frames.forEach((frame) => {
      if (frame.action === "move") {
        assert.ok(frame.current.value > previous);
        previous = frame.current.value;
      }
    });
    assert.equal(trace.frames.at(-1).action, "finish");
    assert.ok(trace.frames.length < 160);
  });
});

test("hill climbing may stop at a strict local optimum below the global one", () => {
  const landscape = core.createLandscape(41);
  const local = core.localOptima(landscape).find(
    (cell) => cell.value < landscape.maximum.value
  );
  assert.ok(local, "the teaching landscape needs a suboptimal local peak");
  const trace = core.buildTrace({
    strategy: "best",
    seed: 41,
    restarts: 0,
    startX: local.x,
    startY: local.y,
  });
  assert.ok(trace.frames.some(
    (frame) => frame.action === "local-optimum" &&
      frame.current.value < landscape.maximum.value
  ));
  assert.ok(trace.result.value < landscape.maximum.value);
});

test("simulated annealing is reproducible and can accept a worsening move", () => {
  const options = {
    strategy: "anneal",
    seed: 17,
    restarts: 1,
    temperatureTenths: 90,
    startX: 1,
    startY: 1,
  };
  const first = core.buildTrace(options);
  const second = core.buildTrace(options);
  assert.deepEqual(first, second);
  assert.ok(first.frames.some(
    (frame) => frame.action === "move" && frame.accepted && frame.delta < 0
  ));
  assert.ok(first.frames.filter((frame) => frame.action === "restart").length <= 1);
});

test("runtime state is immutable, bounded and terminates", () => {
  let state = core.createState({
    strategy: "anneal",
    seed: 73,
    restarts: 3,
    temperatureTenths: 50,
    startX: 0,
    startY: 0,
  });
  const first = state;
  let steps = 0;
  while (!state.finished && steps < 200) {
    state = core.step(state);
    steps += 1;
  }
  assert.ok(state.finished);
  assert.ok(steps < 160);
  assert.equal(first.cursor, 0);
  assert.ok(Object.isFrozen(state));
  const model = core.visualModel(state);
  assert.equal(model.cells.length, core.WIDTH * core.HEIGHT);
});

test("unsafe options fail closed", () => {
  assert.throws(() => core.buildTrace({ strategy: "eval(user)" }), /стратег/);
  assert.throws(() => core.buildTrace({ seed: 0 }), /Seed/);
  assert.throws(() => core.buildTrace({ restarts: 4 }), /рестарт/);
  assert.throws(() => core.buildTrace({ startX: 12 }), /координат/);
});
