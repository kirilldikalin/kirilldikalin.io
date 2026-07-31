const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../labs/turing-machine-core.js");

test("both published machines satisfy the deterministic machine contract", () => {
  assert.equal(core.validateMachines(), true);
  assert.deepEqual(Object.keys(core.MACHINES), [
    "unary-increment",
    "ones-parity",
  ]);

  const broken = structuredClone(core.MACHINES["unary-increment"]);
  broken.transitions.push(structuredClone(broken.transitions[0]));
  broken.transitions[2].id = "another-id";
  assert.throws(() => core.validateMachine(broken), /nondeterministic/);
});

test("input validation follows each finite alphabet and length limit", () => {
  assert.equal(core.parseInput("unary-increment", " 111 "), "111");
  assert.equal(core.parseInput("ones-parity", ""), "");
  assert.throws(
    () => core.parseInput("unary-increment", "101"),
    /не входит во входной алфавит/
  );
  assert.throws(
    () => core.parseInput("ones-parity", "1".repeat(core.MAX_INPUT_LENGTH + 1)),
    /не должен быть длиннее/
  );
});

test("unary increment appends exactly one symbol, including for zero", () => {
  for (const input of ["", "1", "111", "1".repeat(120)]) {
    const run = core.runWithLimit(
      core.createState("unary-increment", input),
      core.MAX_RUN_STEPS
    );
    assert.equal(run.state.status, "accepted");
    assert.equal(core.tapeContents(run.state), input + "1");
    assert.equal(run.stepsExecuted, input.length + 1);
  }
});

test("the parity decider accepts exactly strings with an even number of ones", () => {
  for (const input of ["", "0", "11", "1010", "1111"]) {
    const run = core.runWithLimit(
      core.createState("ones-parity", input),
      core.MAX_RUN_STEPS
    );
    assert.equal(run.state.status, "accepted");
  }
  for (const input of ["1", "00100", "1011", "111"]) {
    const run = core.runWithLimit(
      core.createState("ones-parity", input),
      core.MAX_RUN_STEPS
    );
    assert.equal(run.state.status, "rejected");
  }
});

test("each step applies the unique transition for state and scanned symbol", () => {
  let state = core.createState("ones-parity", "101");
  const expected = [
    ["q_even", "1", "parity-even-one"],
    ["q_odd", "0", "parity-odd-zero"],
    ["q_odd", "1", "parity-odd-one"],
    ["q_even", core.BLANK, "parity-even-blank"],
  ];

  expected.forEach(([stateId, symbol, transitionId]) => {
    assert.equal(state.state, stateId);
    assert.equal(core.readSymbol(state), symbol);
    assert.equal(core.transitionFor(state).id, transitionId);
    state = core.step(state);
  });
  assert.equal(state.status, "accepted");
});

test("a wrong manual rule explains the mismatch without changing configuration", () => {
  const state = core.createState("ones-parity", "1");
  const wrong = core.manualStep(state, "parity-odd-one");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.state, state);
  assert.match(wrong.message, /q_even/);
  assert.match(wrong.message, /Конфигурация не изменилась/);

  const correct = core.manualStep(state, "parity-even-one");
  assert.equal(correct.ok, true);
  assert.equal(correct.state.state, "q_odd");
  assert.equal(correct.state.stepNumber, 1);
});

test("an automatic step limit pauses a long computation without losing it", () => {
  const initial = core.createState("ones-parity", "1".repeat(200));
  const firstRun = core.runWithLimit(initial, 20);
  assert.equal(firstRun.stoppedByLimit, true);
  assert.equal(firstRun.state.status, "running");
  assert.equal(firstRun.state.stepNumber, 20);

  const continued = core.runWithLimit(firstRun.state, 500);
  assert.equal(continued.state.status, "accepted");
  assert.equal(continued.state.stepNumber, 201);
});

test("the visible tape stays bounded while configuration data remains exact", () => {
  const initial = core.createState("unary-increment", "1".repeat(240));
  const snapshot = core.tapeSnapshot(initial);
  assert.equal(snapshot.length, 17);
  assert.equal(snapshot.filter(({ isHead }) => isHead).length, 1);
  assert.equal(snapshot[8].position, 0);

  const run = core.runWithLimit(initial, 241);
  assert.equal(core.tapeContents(run.state).length, 241);
  assert.match(core.configuration(run.state).text, /q_acc/);
  assert.match(core.resultDescription(run.state), /Принято/);
});

test("state graph is derived from the same states and transitions as execution", () => {
  for (const machineId of Object.keys(core.MACHINES)) {
    const machine = core.machineById(machineId);
    const state = core.createState(machineId, machine.defaultInput);
    const graph = core.graphModel(machineId, state);

    assert.deepEqual(
      graph.nodes.map(({ id }) => id),
      machine.states
    );
    assert.deepEqual(
      graph.edges.map(({ id }) => id),
      machine.transitions.map(({ id }) => id)
    );
    assert.equal(graph.nodes.filter(({ current }) => current).length, 1);
    assert.equal(graph.currentStateId, state.state);
    assert.equal(
      graph.nodes.find(({ kind }) => kind === "accept").id,
      machine.acceptState
    );
    assert.equal(
      graph.nodes.find(({ kind }) => kind === "reject").id,
      machine.rejectState
    );
    graph.nodes.forEach((node) => {
      assert.ok(node.x > 0 && node.x < graph.width);
      assert.ok(node.y > 0 && node.y < graph.height);
    });
  }
});

test("graph highlights the exact edge used by a machine step", () => {
  const initial = core.createState("ones-parity", "1");
  const before = core.graphModel(initial);
  const expected = core.transitionFor(initial);
  assert.equal(before.applicableTransitionId, expected.id);
  assert.equal(
    before.edges.find(({ applicable }) => applicable).id,
    expected.id
  );

  const next = core.step(initial);
  const after = core.graphModel(next);
  assert.equal(after.currentStateId, expected.nextState);
  assert.equal(after.appliedTransitionId, expected.id);
  assert.equal(after.edges.find(({ applied }) => applied).id, expected.id);
  assert.equal(next.head, initial.head + (expected.move === "L" ? -1 : 1));
  assert.equal(core.readSymbol(initial), expected.read);
});

test("graph model rejects a state from another machine", () => {
  const state = core.createState("unary-increment", "1");
  assert.throws(
    () => core.graphModel("ones-parity", state),
    /must belong/
  );
});
