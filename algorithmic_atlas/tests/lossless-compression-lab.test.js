const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/lossless-compression-core.js");

test("Huffman codes are prefix-free and encode every source symbol", () => {
  const result = core.huffman("aaabbc");
  const codes = Object.values(result.codes);
  for (const left of codes) {
    for (const right of codes) {
      if (left !== right) assert.equal(right.startsWith(left), false);
    }
  }
  assert.ok(result.encoded.length > 0);
});

test("arithmetic coding narrows a positive exact rational interval", () => {
  const frames = core.arithmeticFrames("абра");
  const last = frames.at(-1);
  const left = Number(last.low.numerator) / Number(last.low.denominator);
  const right = Number(last.high.numerator) / Number(last.high.denominator);
  assert.ok(left >= 0 && right <= 1 && left < right);
});

test("LZ77 tokens reconstruct the source", () => {
  const text = "abcabcabcx";
  const result = core.lz77(text, 8, 8);
  let decoded = "";
  for (const token of result.tokens) {
    if (token.literal) decoded += token.literal;
    else for (let index = 0; index < token.length; index += 1) {
      decoded += decoded[decoded.length - token.distance];
    }
  }
  assert.equal(decoded, text);
});

test("entropy is zero for a constant source and finite otherwise", () => {
  assert.equal(core.entropy("aaaa"), 0);
  assert.ok(Number.isFinite(core.entropy("abracadabra")));
});

test("all three codecs preserve the empty-message boundary", () => {
  const huffman = core.huffman("");
  assert.equal(huffman.root, null);
  assert.equal(huffman.encoded, "");
  assert.deepEqual(huffman.frames.at(-1).queue, []);
  const arithmetic = core.arithmeticFrames("").at(-1);
  assert.deepEqual(arithmetic.low, { numerator: 0n, denominator: 1n });
  assert.deepEqual(arithmetic.high, { numerator: 1n, denominator: 1n });
  assert.deepEqual(core.lz77("", 8, 8).tokens, []);
  assert.equal(core.entropy(""), 0);
});

test("compression playback distinguishes omitted and explicitly empty messages", () => {
  for (const mode of ["huffman", "arithmetic", "lz77"]) {
    const state = core.createState({ mode, text: "" });
    assert.equal(state.text, "");
    assert.equal(state.frame.finished, true);
  }
  assert.equal(core.createState({ mode: "huffman" }).text, "абракадабра");
});
