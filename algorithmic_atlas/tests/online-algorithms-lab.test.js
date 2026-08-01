const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("../labs/online-algorithms-core.js");

const chapterPath = path.join(__dirname, "../chapters/online-algorithms.html");

function formulaBlocks(html) {
  return Array.from(
    html.matchAll(/<div class="atlas-math[^"]*"([\s\S]*?)>([\s\S]*?)<\/div>/g)
  ).map((match) => ({ attributes: match[1], body: match[2] }));
}

test("LRU distinguishes hits from misses and evicts the least recent page", () => {
  const frames = core.onlineFrames([1, 2, 1, 3], 2, "lru");
  assert.deepEqual(frames.map((frame) => frame.hit), [false, false, true, false]);
  assert.equal(frames.at(-1).evicted, 2);
  assert.deepEqual(frames.at(-1).cache, [1, 3]);
  assert.equal(frames.at(-1).misses, 3);
});

test("FIFO keeps insertion order even when a page is hit", () => {
  const frames = core.onlineFrames([1, 2, 1, 3], 2, "fifo");
  assert.equal(frames.at(-1).evicted, 1);
  assert.deepEqual(frames.at(-1).cache, [2, 3]);
});

test("adaptive teaching adversary always requests a page outside online cache", () => {
  for (const policy of core.POLICIES) {
    const sequence = core.adversarialSequence(3, 18, policy);
    const frames = core.onlineFrames(sequence, 3, policy);
    assert.equal(frames.every((frame) => frame.hit === false), true, policy);
    assert.equal(new Set(sequence).size, 4);
  }
});

test("Belady agrees with exhaustive offline optimum", () => {
  const sequences = [
    [1, 2, 3, 1, 2, 4, 1, 2],
    [1, 2, 1, 3, 1, 2, 4],
    [1, 2, 3, 4, 1, 2, 3, 4],
  ];
  for (const sequence of sequences) {
    for (const capacity of [2, 3]) {
      const belady = core.beladyFrames(sequence, capacity).at(-1).misses;
      assert.equal(belady, core.offlineOptimalMisses(sequence, capacity));
    }
  }
});

test("Belady agrees with exact DP on every short three-page sequence", () => {
  for (let length = 1; length <= 6; length += 1) {
    const total = 3 ** length;
    for (let code = 0; code < total; code += 1) {
      let cursor = code;
      const sequence = [];
      for (let index = 0; index < length; index += 1) {
        sequence.push((cursor % 3) + 1);
        cursor = Math.floor(cursor / 3);
      }
      for (const capacity of [1, 2, 3]) {
        assert.equal(
          core.beladyFrames(sequence, capacity).at(-1).misses,
          core.offlineOptimalMisses(sequence, capacity)
        );
      }
    }
  }
});

test("offline optimum never costs more than tested online policies", () => {
  for (const scenario of Object.keys(core.SCENARIOS)) {
    for (const policy of core.POLICIES) {
      const trace = core.buildTrace({ scenario, policy, capacity: 3, horizon: 16 });
      const online = trace.frames.at(-1).online.misses;
      const offline = trace.frames.at(-1).offline.misses;
      assert.ok(offline <= online, scenario + ":" + policy);
      assert.ok(offline > 0);
    }
  }
});

test("revealed prefix grows one request at a time and hides no state transition", () => {
  let state = core.createState({ scenario: "adversary", policy: "lru", capacity: 2, horizon: 10 });
  assert.deepEqual(core.visualModel(state).frame.revealed, []);
  let steps = 0;
  while (!state.finished) {
    const before = state.cursor;
    state = core.step(state);
    assert.equal(state.cursor, before + 1);
    assert.equal(core.visualModel(state).frame.revealed.length, state.cursor);
    assert.ok(++steps <= 10);
  }
});

test("competitive ratio shown by the model is the prefix cost quotient", () => {
  let state = core.createState({ scenario: "scan", policy: "fifo", capacity: 2, horizon: 12 });
  while (!state.finished) state = core.step(state);
  const model = core.visualModel(state);
  assert.equal(model.ratio, model.frame.online.misses / model.frame.offline.misses);
  assert.ok(model.ratio >= 1);
});

test("invalid bounds, requests and policies are rejected", () => {
  assert.throws(() => core.normalizeOptions({ capacity: 1 }), /capacity/);
  assert.throws(() => core.normalizeOptions({ horizon: 25 }), /horizon/);
  assert.throws(() => core.normalizeOptions({ scenario: "future" }), /сценарий/);
  assert.throws(() => core.onlineFrames([1, 0], 2, "lru"), /положительным/);
  assert.throws(() => core.onlineFrames([1], 2, "random"), /политика/);
});

test("browser layer contains no executable expression parser", () => {
  const source = fs.readFileSync(path.join(__dirname, "../labs/online-algorithms.js"), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|\bFunction\s*\(/);
});

test("chapter 4.11 follows the shared long-form chapter contract", () => {
  const html = fs.readFileSync(chapterPath, "utf8");
  assert.match(html, /data-atlas-node-id="online-algorithms"/);
  assert.match(html, /class="atlas-block atlas-block--fullwidth" data-atlas-block="lab"/);
  assert.match(html, /data-atlas-lab="online-algorithms"/);
  assert.equal((html.match(/<article class="atlas-exercise">/g) || []).length, 12);
  assert.equal((html.match(/<summary>Показать подсказку<\/summary>/g) || []).length, 12);
  assert.equal((html.match(/<summary>Показать решение<\/summary>/g) || []).length, 12);
  assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 4);
  assert.doesNotMatch(
    html.match(/<p class="atlas-chapter-intro">([\s\S]*?)<\/p>/)[1].trim(),
    /[.!?…]$/
  );
});

test("every display formula in chapter 4.11 has exact notation coverage", () => {
  const formulas = formulaBlocks(fs.readFileSync(chapterPath, "utf8"));
  assert.ok(formulas.length >= 7);
  formulas.forEach(({ attributes, body }) => {
    assert.match(attributes, /data-formula-id="[^"]+"/);
    assert.match(attributes, /data-notation-coverage="interactive"/);
    const required = new Set(
      attributes.match(/data-required-notations="([^"]+)"/)[1].split(",").filter(Boolean)
    );
    const tokens = new Set(
      Array.from(body.matchAll(/notation-id-([a-z0-9-]+)/g), (match) => match[1])
    );
    assert.deepEqual(tokens, required);
  });
});

test("production parser accepts chapter 4.11 math and measured depth", () => {
  const script = [
    "from pathlib import Path",
    "from scripts.check_site import parse_page, reading_metrics, math_delimiter_errors",
    "import json",
    "p=parse_page(Path('algorithmic_atlas/chapters/online-algorithms.html'))",
    "print(json.dumps({'metrics':reading_metrics(p),'errors':math_delimiter_errors(' '.join(p.visible_text)),'outside':p.display_math_outside_wrapper}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script], {
    cwd: path.join(__dirname, "../.."), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.metrics.words >= 3500);
  assert.ok(report.metrics.words <= 5000);
  assert.equal(report.metrics.proofBlocks >= 3, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.outside, []);
});
