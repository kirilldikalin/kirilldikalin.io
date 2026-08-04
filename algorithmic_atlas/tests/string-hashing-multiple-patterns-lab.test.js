const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/string-hashing-multiple-patterns-core.js");

test("rolling hash verifies candidates and preserves overlapping matches", () => {
  const frames = core.rollingHashFrames("aaaa", "aa", 257, 1000003);
  assert.deepEqual(frames.at(-1).matches, [0, 1, 2]);
  assert.deepEqual(frames.at(-1).collisions, []);
});

test("rolling hash exposes exact positional power contributions", () => {
  const frame = core.rollingHashFrames("abcd", "abc", 7, 101)[0];
  assert.deepEqual(frame.windowContributions.map((term) => term.exponent), [2, 1, 0]);
  const reconstructed = frame.windowContributions.reduce((sum, term) =>
    (sum + term.residue) % 101n, 0n);
  assert.equal(reconstructed, frame.hash);
  assert.equal(frame.outgoing, "a");
  assert.equal(frame.incoming, "d");
});

test("small modulus can expose a collision without reporting a match", () => {
  let found = false;
  const alphabet = ["a", "b", "c", "d"];
  for (const left of alphabet) {
    for (const right of alphabet) {
      const frames = core.rollingHashFrames(left, right, 2, 3);
      if (left !== right && frames[0].collision) found = true;
    }
  }
  assert.equal(found, true);
});

test("Aho-Corasick reports suffix outputs through failure links", () => {
  const result = core.ahoCorasickFrames("ushers", ["he", "she", "hers"]);
  assert.deepEqual(result.frames.at(-1).matches.map(({ pattern }) => pattern), ["she", "he", "hers"]);
  assert.ok(result.automaton.nodes.some((node) => node.failure !== 0));
});

test("modular power uses exact BigInt arithmetic", () => {
  assert.equal(core.modPow(7n, 560n, 561n), 1n);
});

test("playback preserves empty texts and rejects empty search patterns", () => {
  const rolling = core.createState({ mode: "rolling", text: "", pattern: "a" });
  assert.deepEqual(rolling.frames.at(-1).matches, []);
  const aho = core.createState({ mode: "aho", text: "", patterns: ["a"] });
  assert.deepEqual(aho.frames.at(-1).matches, []);
  assert.throws(() => core.createState({ mode: "rolling", text: "abc", pattern: "" }),
    /не должен быть пустым/);
  assert.throws(() => core.createState({ mode: "aho", text: "abc", patterns: [] }),
    /хотя бы один/);
});
