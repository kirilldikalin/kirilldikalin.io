const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("arithmetic interval projection never collapses a positive BigInt interval", () => {
  const final = core.arithmeticFrames("xwvutsrqponmlkjihgfedcba").at(-1);
  const projection = core.intervalProjection(final.low, final.high, 740);
  assert.equal(projection.underResolution, true);
  assert.ok(projection.pixelWidth >= 1);
  assert.ok(projection.width.numerator > 0n);
  assert.ok(projection.end > projection.start);
});

test("LZ77 tokens reconstruct the source", () => {
  const text = "abcabcabcx";
  const result = core.lz77(text, 8, 8);
  assert.equal(core.decodeLz77(result.tokens), text);
  assert.ok(result.tokens.every((token) => Object.hasOwn(token, "offset") &&
    Object.hasOwn(token, "length") && Object.hasOwn(token, "nextSymbol")));
  assert.ok(result.tokens.some((token) => token.length > 0));
});

test("overlapping LZ77 frames separate the existing source period from the target", () => {
  const frame = core.lz77("aaaaaa", 8, 8).frames.find((entry) => entry.overlap);
  assert.ok(frame);
  assert.equal(frame.sourceStart + frame.sourceLength, frame.position);
  assert.equal(frame.sourceLength, frame.token.offset);
  assert.equal(frame.targetStart, frame.position);
  assert.equal(frame.targetLength, frame.token.length);
});

test("LZ77 decoder rejects references outside the reconstructed prefix", () => {
  assert.throws(() => core.decodeLz77([{ offset: 2, length: 1, nextSymbol: "a" }]),
    /Некорректная/);
  assert.throws(() => core.decodeLz77([{ offset: 0, length: 0, nextSymbol: "ab" }]),
    /nextSymbol/);
  assert.throws(() => core.decodeLz77([{ offset: 0, length: 0, nextSymbol: "" }]),
    /Пустая тройка/);
});

test("LZ78 dictionary trace and decoder round-trip exactly", () => {
  for (const text of ["abababa", "aaaaaa", "🙂аб🙂аб", "x"]) {
    const result = core.lz78(text);
    assert.equal(core.decodeLz78(result.tokens), text);
    assert.ok(result.tokens.every((token) => token.index >= 0 &&
      Object.hasOwn(token, "nextSymbol")));
  }
  const sample = core.lz78("abababa");
  assert.ok(sample.dictionary.includes("ab"));
  assert.ok(sample.frames.some((frame) => frame.dictionary.length > 2));
});

test("LZ78 layout keeps the token below the largest accepted dictionary grid", () => {
  const layout = core.lz78Layout(24);
  const lastCardBottom = 195 + 4 * 72 + 52;
  assert.ok(layout.tokenY > lastCardBottom);
  assert.ok(layout.height > layout.tokenY);
});

test("compression adapter uses exact projection and the non-overlapping layout contracts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../labs/lossless-compression.js"), "utf8");
  assert.match(source, /core\.intervalProjection\(frame\.low, frame\.high, 740\)/);
  assert.doesNotMatch(source, /function ratio\(/);
  assert.match(source, /frame\.sourceStart/);
  assert.match(source, /frame\.targetStart/);
  assert.match(source, /layout\.tokenY/);
});

test("LZ78 decoder rejects future and empty dictionary references", () => {
  assert.throws(() => core.decodeLz78([{ index: 1, nextSymbol: "a" }]), /ссылка LZ78/);
  assert.throws(() => core.decodeLz78([{ index: 0, nextSymbol: "" }]), /Пустой токен/);
});

test("entropy is zero for a constant source and finite otherwise", () => {
  assert.equal(core.entropy("aaaa"), 0);
  assert.ok(Number.isFinite(core.entropy("abracadabra")));
});

test("all four codecs preserve the empty-message boundary", () => {
  const huffman = core.huffman("");
  assert.equal(huffman.root, null);
  assert.equal(huffman.encoded, "");
  assert.deepEqual(huffman.frames.at(-1).queue, []);
  const arithmetic = core.arithmeticFrames("").at(-1);
  assert.deepEqual(arithmetic.low, { numerator: 0n, denominator: 1n });
  assert.deepEqual(arithmetic.high, { numerator: 1n, denominator: 1n });
  assert.deepEqual(core.lz77("", 8, 8).tokens, []);
  assert.deepEqual(core.lz78("").tokens, []);
  assert.equal(core.entropy(""), 0);
});

test("compression playback distinguishes omitted and explicitly empty messages", () => {
  for (const mode of ["huffman", "arithmetic", "lz77", "lz78"]) {
    const state = core.createState({ mode, text: "" });
    assert.equal(state.text, "");
    assert.equal(state.frame.finished, true);
  }
  assert.equal(core.createState({ mode: "huffman" }).text, "абракадабра");
});
