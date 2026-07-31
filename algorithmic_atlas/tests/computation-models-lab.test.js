const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/computation-models-core.js");

function runToEnd(initial) {
  let state = initial;
  let guard = 0;
  while (!state.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard <= state.trace.instructions.length);
  }
  return state;
}

test("word count changes exactly at the machine-word boundary", () => {
  assert.equal(core.wordsForBits(64, 64), 1);
  assert.equal(core.wordsForBits(65, 64), 2);
  assert.equal(core.addressBits(1), 1);
  assert.equal(core.addressBits(17), 5);
});

test("one trace exposes the same operations under all three cost models", () => {
  const trace = core.operationTrace({ operandBits: 128, wordBits: 64, vectorLength: 3 });
  assert.equal(trace.instructions.length, 15);
  trace.instructions.forEach((instruction) => {
    assert.equal(instruction.costs.unit, 1n);
    assert.ok(instruction.costs.word >= 1n);
    assert.ok(instruction.costs.bit >= instruction.costs.word);
    if (instruction.kind === "multiply") {
      assert.equal(instruction.costs.word, BigInt(core.wordsForBits(instruction.operationBits, 64)) ** 2n);
      assert.equal(instruction.costs.bit, BigInt(instruction.operationBits) ** 2n);
    }
  });
});

test("a complete run accumulates exact costs and bounded geometry", () => {
  const final = runToEnd(core.createState({ operandBits: 4096, wordBits: 64, vectorLength: 4 }));
  const recomputed = final.trace.instructions.reduce((total, instruction) => ({
    unit: total.unit + instruction.costs.unit,
    word: total.word + instruction.costs.word,
    bit: total.bit + instruction.costs.bit,
  }), { unit: 0n, word: 0n, bit: 0n });
  assert.deepEqual(final.costs, recomputed);
  assert.ok(final.costs.unit < final.costs.word);
  assert.ok(final.costs.word < final.costs.bit);
  const visual = core.visualModel(final);
  assert.equal(visual.schematic, true);
  assert.equal(visual.bitCells, 64);
  assert.ok(visual.costs.every(({ share }) => Number.isFinite(share) && share >= 0 && share <= 1));
});

test("invalid address and operand configurations fail before execution", () => {
  assert.throws(() => core.operationTrace({ operandBits: 64, wordBits: 1, vectorLength: 40 }), /too small/);
  assert.throws(() => core.operationTrace({ operandBits: core.MAX_OPERAND_BITS + 1 }), /от 1/);
  assert.throws(() => core.costForInstruction({ bits: 64, kind: "add" }, "unknown", 64), /unknown/);
  assert.throws(() => core.costForInstruction({ bits: 64, kind: "divide" }, "unit", 64), /instruction/);
});
