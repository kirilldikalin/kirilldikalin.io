const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../chapter-core.js");

test("active section follows the shared ordered section offsets", () => {
  const offsets = [500, 900, 1600, 2300];

  assert.equal(core.activeSectionIndex(offsets, 0), 0);
  assert.equal(core.activeSectionIndex(offsets, 500), 0);
  assert.equal(core.activeSectionIndex(offsets, 1599), 1);
  assert.equal(core.activeSectionIndex(offsets, 1600), 2);
  assert.equal(core.activeSectionIndex(offsets, 10000), 3);
  assert.equal(core.activeSectionIndex([], 1000), -1);
});

test("reading progress is bounded by the first and last content sections", () => {
  const viewportHeight = 1000;
  const contentStart = 1000;
  const contentEnd = 5000;

  assert.equal(core.readingProgress(0, viewportHeight, contentStart, contentEnd), 0);
  assert.equal(core.readingProgress(1000, viewportHeight, contentStart, contentEnd), 0);
  assert.equal(core.readingProgress(2500, viewportHeight, contentStart, contentEnd), 0.5);
  assert.equal(core.readingProgress(4000, viewportHeight, contentStart, contentEnd), 1);
  assert.equal(core.readingProgress(9000, viewportHeight, contentStart, contentEnd), 1);
});

test("a short content range remains finite and reaches completion", () => {
  assert.equal(core.readingProgress(100, 1000, 100, 500), 0);
  assert.equal(core.readingProgress(101, 1000, 100, 500), 1);
  assert.equal(core.readingProgress(200, 1000, 500, 500), 0);
  assert.equal(core.readingProgress(Number.NaN, 1000, 100, 500), 0);
});

test("section navigation uses explicit page boundaries", () => {
  assert.deepEqual(core.sectionNavigation(0, 3), {
    previous: { kind: "page-start" },
    next: { kind: "section", index: 1 },
  });
  assert.deepEqual(core.sectionNavigation(1, 3), {
    previous: { kind: "section", index: 0 },
    next: { kind: "section", index: 2 },
  });
  assert.deepEqual(core.sectionNavigation(2, 3), {
    previous: { kind: "section", index: 1 },
    next: { kind: "page-end" },
  });
  assert.deepEqual(core.sectionNavigation(0, 0), {
    previous: null,
    next: null,
  });
});

test("accessible percentage is rounded and clamped", () => {
  assert.equal(core.percentValue(-1), 0);
  assert.equal(core.percentValue(0.364), 36);
  assert.equal(core.percentValue(0.999), 100);
  assert.equal(core.percentValue(8), 100);
  assert.equal(core.percentValue(Number.NaN), 0);
});

test("theory reading time follows the documented content formula", () => {
  assert.equal(core.theoryReadingMinutes(1800, 4, 2), 13);
  assert.equal(core.theoryReadingMinutes(3600, 4, 2), 23);
  assert.throws(() => core.theoryReadingMinutes(-1, 0, 0), RangeError);
  assert.throws(() => core.theoryReadingMinutes(100, 0.5, 0), RangeError);
});

test("adding displayed theory never decreases its reading estimate", () => {
  const base = core.theoryReadingMinutes(2200, 8, 3);
  assert.ok(core.theoryReadingMinutes(2380, 8, 3) > base);
  assert.ok(core.theoryReadingMinutes(2200, 11, 3) > base);
  assert.ok(core.theoryReadingMinutes(2200, 8, 5) > base);
});

test("word counting handles Russian compounds and visible numbers", () => {
  assert.equal(
    core.countWords("B-дерево хранит 1024 ключа во внешней памяти"),
    7
  );
  assert.equal(core.countWords(null), 0);
});
