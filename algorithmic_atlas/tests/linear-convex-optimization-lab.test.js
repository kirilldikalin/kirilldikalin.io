const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/linear-convex-optimization-core.js");

test("fraction arithmetic remains reduced and exact", () => {
  const oneThird = core.fraction(2n, 6n);
  const oneSixth = core.fraction(1n, 6n);
  assert.deepEqual(oneThird, { n: 1n, d: 3n });
  assert.deepEqual(core.add(oneThird, oneSixth), { n: 1n, d: 2n });
  assert.deepEqual(core.multiply(oneThird, core.fraction(-9n, 2n)), { n: -3n, d: 2n });
  assert.equal(core.compare(core.fraction(7n, 5n), core.fraction(4n, 3n)), 1);
});

test("every preset has feasible exact primal and dual optima", () => {
  Object.keys(core.PRESETS).forEach((preset) => {
    const solved = core.solve({ preset });
    assert.ok(solved.primal.vertices.length >= 3);
    assert.ok(solved.dual.vertices.length >= 2);
    assert.equal(core.compare(solved.primal.value, solved.dual.value), 0);
    assert.ok(solved.complementaryProducts.every((value) => value.n === 0n));
  });
});

test("strong duality survives every boundary control value", () => {
  const values = [
    { c1: 1, c2: 1, b1: 3, b2: 3 },
    { c1: 9, c2: 1, b1: 18, b2: 3 },
    { c1: 1, c2: 9, b1: 3, b2: 18 },
    { c1: 9, c2: 9, b1: 18, b2: 18 },
    { c1: 4, c2: 7, b1: 11, b2: 13 },
  ];
  Object.keys(core.PRESETS).forEach((preset) => {
    values.forEach((options) => {
      const solved = core.solve({ preset, ...options });
      assert.equal(core.compare(solved.primal.value, solved.dual.value), 0);
      assert.ok(solved.primal.slacks.every((value) => value.n >= 0n));
      assert.ok(solved.dual.slacks.every((value) => value.n >= 0n));
    });
  });
});

test("objective and resource controls affect both synchronized views", () => {
  const base = core.solve({ preset: "balanced", c1: 4, c2: 3, b1: 10, b2: 8 });
  const objective = core.solve({ preset: "balanced", c1: 8, c2: 3, b1: 10, b2: 8 });
  const resources = core.solve({ preset: "balanced", c1: 4, c2: 3, b1: 16, b2: 8 });
  assert.notDeepEqual(objective.options.c, base.options.c);
  assert.notDeepEqual(objective.dual.constraints, base.dual.constraints);
  assert.notDeepEqual(objective.primal.value, base.primal.value);
  assert.notDeepEqual(resources.primal.constraints, base.primal.constraints);
  assert.notDeepEqual(resources.dual.value, base.dual.value);
  assert.notDeepEqual(resources.options.b, base.options.b);
});

test("the crossed scenario exposes a non-integral optimum exactly", () => {
  const solved = core.solve({ preset: "crossed" });
  assert.equal(core.formatFraction(solved.primal.value), "124/5");
  assert.equal(core.formatFraction(solved.dual.value), "124/5");
  assert.ok(solved.primal.optimum.x.d > 1n || solved.primal.optimum.y.d > 1n);
});

test("clipped display regions satisfy every visible half-plane", () => {
  let state = core.createState({ preset: "balanced" });
  for (let index = 0; index < 5; index += 1) state = core.step(state);
  const model = core.visualModel(state);
  [model.primal, model.dual].forEach((side) => {
    assert.ok(side.polygon.length >= 3);
    side.polygon.forEach((point) => {
      assert.ok(point.x >= -1e-8 && point.y >= -1e-8);
      side.numericConstraints.forEach((constraint) => {
        assert.ok(constraint.p * point.x + constraint.q * point.y <= constraint.r + 1e-7);
      });
    });
  });
});

test("the shared runtime trace is immutable, deterministic and bounded", () => {
  const options = { preset: "scarceFirst", c1: 7, c2: 2, b1: 14, b2: 9 };
  assert.deepEqual(core.buildTrace(options), core.buildTrace(options));
  let state = core.createState(options);
  let steps = 0;
  while (!state.finished) {
    const previous = state;
    state = core.step(state);
    assert.notEqual(state, previous);
    steps += 1;
    assert.ok(steps <= 7);
  }
  assert.equal(steps, 7);
  assert.ok(Object.isFrozen(state));
  assert.equal(core.step(state), state);
});

test("unsafe and malformed controls fail before solving", () => {
  assert.throws(() => core.solve({ preset: "eval(user)" }), /сценарий/);
  assert.throws(() => core.solve({ c1: 0 }), /c₁/);
  assert.throws(() => core.solve({ c2: 10 }), /c₂/);
  assert.throws(() => core.solve({ b1: "run()" }), /b₁/);
  assert.throws(() => core.solve({ b2: 2 }), /b₂/);
});
