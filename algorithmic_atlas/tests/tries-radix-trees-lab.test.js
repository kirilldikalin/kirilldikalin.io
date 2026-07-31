const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/tries-radix-trees-core.js");

test("trie insertion preserves every key and rejects a prefix without a terminal mark", () => {
  const words = core.parseWords("дом, дома, домен, кот, код");
  const built = core.insertFrames(words);
  const finalTrie = built.frames.at(-1);
  words.forEach((word) => assert.equal(core.contains(finalTrie, word), true));
  assert.equal(core.contains(finalTrie, "до"), false);
  assert.equal(core.contains(finalTrie, "доми"), false);
});

test("radix compression removes unary vertices without changing membership", () => {
  const words = core.parseWords("romane, romanus, romulus, rubens, ruber");
  const built = core.insertFrames(words);
  const compressed = core.compressedModel(built.trie, words);
  assert.ok(compressed.nodes.length < built.trie.nodes.length);
  assert.ok(compressed.edges.some((edge) => edge.label.length > 1));
  words.forEach((word) => assert.equal(core.contains(compressed, word), true));
  assert.equal(core.contains(compressed, "roman"), false);
});

test("playback is bounded and reaches the compressed representation", () => {
  let state = core.createState({ words: "a, ab, abc, bca" });
  assert.ok(state.frames.length <= 1 + 2 * 4 * core.MAX_WORD_LENGTH + 1);
  let guard = 0;
  while (!core.isFinished(state) && guard < 200) {
    state = core.step(state);
    guard += 1;
  }
  assert.equal(core.isFinished(state), true);
  assert.equal(core.currentFrame(state).kind, "radix");
});

test("input validation rejects duplicates, empty sets and oversized keys", () => {
  assert.throws(() => core.parseWords("a,a"), /повтор/);
  assert.throws(() => core.parseWords("only"), /от 2/);
  assert.throws(() => core.parseWords(["a", "x".repeat(17)]), /длину/);
  assert.throws(() => core.parseWords("a, b!"), /буквы/);
});
