const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../labs/string-hashing-multiple-patterns-core.js");

test("rolling hash verifies candidates and preserves overlapping matches", () => {
  const frames = core.rollingHashFrames("aaaa", "aa", 257, 1000003);
  assert.deepEqual(frames.at(-1).matches, [0, 1, 2]);
  assert.deepEqual(frames.at(-1).collisions, []);
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
