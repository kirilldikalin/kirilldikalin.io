"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../labs/sweep-line-closest-pair-range-search-core.js");

function intersectionKeys(values) {
  return values.map(({ leftId, rightId, value }) => [leftId, rightId, value.type].join("|")).sort();
}

function finish(state) {
  let guard = 0;
  while (!state.playback.finished) {
    state = core.step(state);
    guard += 1;
    assert.ok(guard < 4096, "trace must terminate within the shared bound");
  }
  return state;
}

test("sweep trace finds the same classified segment pairs as quadratic control", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const data = core.preset(name);
    assert.deepEqual(
      intersectionKeys(core.sweepTrace(data.segments).intersections),
      intersectionKeys(core.bruteIntersections(data.segments)),
      name
    );
  });
});

test("divide-and-conquer closest pair agrees with exact quadratic control", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const points = core.preset(name).points;
    const direct = core.bruteClosestPair(points);
    const divided = core.closestPairTrace(points).best;
    assert.equal(divided && divided.distanceSquared, direct && direct.distanceSquared, name);
  });
  assert.equal(core.closestPairTrace([]).best, null);
  assert.equal(core.closestPairTrace([{ id: "a", x: 0, y: 0 }]).best, null);
});

test("kd range report equals direct rectangle filtering and really prunes regions", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const data = core.preset(name);
    const trace = core.rangeQueryTrace(data.points, data.query);
    const expected = data.points.filter((point) =>
      point.x >= data.query.minX && point.x <= data.query.maxX &&
      point.y >= data.query.minY && point.y <= data.query.maxY
    ).map(({ id }) => id).sort();
    assert.deepEqual(trace.foundIds, expected, name);
    assert.ok(trace.frames.at(-1).finished);
  });
  const city = core.preset("city");
  const outside = { minX: 100, maxX: 110, minY: 100, maxY: 110 };
  assert.ok(core.rangeQueryTrace(city.points, outside).frames.some((frame) => frame.phase === "prune"));
});

test("all three modes have bounded immutable step/seek playback", () => {
  const data = core.preset("city");
  core.MODES.forEach((mode) => {
    const state = core.createState(data, { mode });
    assert.ok(Object.isFrozen(state));
    assert.equal(core.step(state).playback.cursor, Math.min(1, state.playback.frames.length - 1));
    const final = finish(state);
    assert.equal(final.playback.finished, true);
    assert.equal(core.seek(final, 0).playback.cursor, 0);
  });
  assert.throws(() => core.createState(data, { mode: "unknown" }), /Неизвестный/);
  assert.throws(() => core.normalizeQuery({ minX: 3, maxX: -3, minY: 0, maxY: 1 }), /перепутаны/);
});

test("chapter and adapter expose the three mathematical views without unsafe evaluation", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/sweep-line-closest-pair-range-search.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/sweep-line-closest-pair-range-search.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="sweep-line-closest-pair-range-search"/);
  assert.match(chapter, /class="[^"]*atlas-block--fullwidth[^"]*"[^>]*data-atlas-block="lab"/);
  assert.match(chapter, /geometry-lab-core\.js/);
  assert.match(chapter, /geometry-lab-runtime\.js/);
  assert.match(chapter, /geometry-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.match(adapter, /value="sweep"/);
  assert.match(adapter, /value="closest"/);
  assert.match(adapter, /value="range"/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
