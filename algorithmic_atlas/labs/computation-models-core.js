(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComputationModelsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  const MAX_OPERAND_BITS = 4096;
  const MAX_VECTOR_LENGTH = 40;

  function wordsForBits(rawBits, rawWordBits) {
    const bits = shared.boundedInteger(rawBits, "bits", 1, MAX_OPERAND_BITS * 3);
    const wordBits = shared.boundedInteger(rawWordBits, "wordBits", 1, 512);
    return Math.ceil(bits / wordBits);
  }

  function addressBits(memoryCells) {
    const cells = shared.boundedInteger(memoryCells, "memoryCells", 1, 1000000);
    return Math.max(1, Math.ceil(Math.log2(cells)));
  }

  function costForInstruction(instruction, model, wordBits) {
    if (!instruction || !["load", "store", "add", "multiply"].includes(instruction.kind)) {
      throw new RangeError("unknown instruction kind");
    }
    const operationBits = shared.boundedInteger(
      instruction.operationBits === undefined ? instruction.bits : instruction.operationBits,
      "instruction bits",
      1,
      MAX_OPERAND_BITS * 3
    );
    if (model === "unit") return 1n;
    const words = BigInt(wordsForBits(operationBits, wordBits));
    if (model === "word") {
      return instruction.kind === "multiply" ? words * words : words;
    }
    if (model === "bit") {
      const bits = BigInt(operationBits);
      return instruction.kind === "multiply" ? bits * bits : bits;
    }
    throw new RangeError("unknown computation model: " + model);
  }

  function operationTrace(rawOptions) {
    const options = rawOptions || {};
    const operandBits = shared.boundedInteger(options.operandBits === undefined ? 64 : options.operandBits, "operandBits", 1, MAX_OPERAND_BITS);
    const wordBits = shared.boundedInteger(options.wordBits === undefined ? 64 : options.wordBits, "wordBits", 1, 512);
    const vectorLength = shared.boundedInteger(options.vectorLength === undefined ? 6 : options.vectorLength, "vectorLength", 1, MAX_VECTOR_LENGTH);
    const requiredAddressBits = addressBits(vectorLength * 2 + 2);
    if (wordBits < requiredAddressBits) {
      throw new RangeError("word size is too small to address all memory cells");
    }
    const instructions = [];
    for (let index = 0; index < vectorLength; index += 1) {
      const accumulatorBits = Math.min(
        MAX_OPERAND_BITS * 3,
        operandBits * 2 + Math.ceil(Math.log2(index + 2))
      );
      [
        { kind: "load", label: "LOAD A[" + index + "]", bits: operandBits, memory: true },
        { kind: "load", label: "LOAD B[" + index + "]", bits: operandBits, memory: true },
        { kind: "multiply", label: "MUL A[" + index + "]·B[" + index + "]", bits: operandBits * 2, operationBits: operandBits, memory: false },
        { kind: "add", label: "ADD к накопителю", bits: accumulatorBits, memory: false },
        { kind: "store", label: "STORE накопитель", bits: accumulatorBits, memory: true },
      ].forEach(function (instruction) {
        instructions.push(Object.freeze(Object.assign({}, instruction, {
          index: instructions.length,
          itemIndex: index,
          words: wordsForBits(instruction.bits, wordBits),
          costs: Object.freeze({
            unit: costForInstruction(instruction, "unit", wordBits),
            word: costForInstruction(instruction, "word", wordBits),
            bit: costForInstruction(instruction, "bit", wordBits),
          }),
        })));
      });
    }
    return shared.deepFreeze({
      operandBits: operandBits,
      wordBits: wordBits,
      vectorLength: vectorLength,
      addressBits: requiredAddressBits,
      instructions: instructions,
    });
  }

  function createState(options) {
    const trace = operationTrace(options);
    return Object.freeze({
      trace: trace,
      instructionIndex: 0,
      currentInstruction: null,
      costs: Object.freeze({ unit: 0n, word: 0n, bit: 0n }),
      memoryAccesses: 0,
      finished: trace.instructions.length === 0,
    });
  }

  function step(state) {
    if (state.finished) return state;
    const instruction = state.trace.instructions[state.instructionIndex];
    const nextIndex = state.instructionIndex + 1;
    return Object.freeze({
      trace: state.trace,
      instructionIndex: nextIndex,
      currentInstruction: instruction,
      costs: Object.freeze({
        unit: state.costs.unit + instruction.costs.unit,
        word: state.costs.word + instruction.costs.word,
        bit: state.costs.bit + instruction.costs.bit,
      }),
      memoryAccesses: state.memoryAccesses + (instruction.memory ? instruction.words : 0),
      finished: nextIndex >= state.trace.instructions.length,
    });
  }

  function visualModel(state) {
    const bitCells = Math.min(64, state.trace.operandBits);
    const wordCount = wordsForBits(state.trace.operandBits, state.trace.wordBits);
    const visibleWords = Math.min(32, wordCount);
    const logs = [state.costs.unit, state.costs.word, state.costs.bit].map(function (value) {
      return value === 0n ? 0 : shared.log10BigInt(value + 1n);
    });
    const maximum = Math.max.apply(null, logs.concat([1]));
    return shared.deepFreeze({
      bitCells: bitCells,
      omittedBits: Math.max(0, state.trace.operandBits - bitCells),
      wordCount: wordCount,
      visibleWords: visibleWords,
      omittedWords: Math.max(0, wordCount - visibleWords),
      currentInstruction: state.currentInstruction,
      memoryAccesses: state.memoryAccesses,
      costs: [
        { id: "unit", label: "unit-cost RAM", value: state.costs.unit, share: logs[0] / maximum },
        { id: "word", label: "word-RAM", value: state.costs.word, share: logs[1] / maximum },
        { id: "bit", label: "битовая модель", value: state.costs.bit, share: logs[2] / maximum },
      ],
      schematic: state.trace.operandBits > bitCells || wordCount > visibleWords,
    });
  }

  return {
    MAX_OPERAND_BITS: MAX_OPERAND_BITS,
    MAX_VECTOR_LENGTH: MAX_VECTOR_LENGTH,
    wordsForBits: wordsForBits,
    addressBits: addressBits,
    costForInstruction: costForInstruction,
    operationTrace: operationTrace,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
