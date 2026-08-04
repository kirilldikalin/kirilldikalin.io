"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const shared = require("../labs/geometry-lab-core.js");
const runtime = require("../labs/geometry-lab-runtime.js");
const core = require("../labs/geometric-predicates-convex-hull-core.js");

function ids(points) {
  return points.map(({ id }) => id).sort();
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

test("exact orientation uses an integer determinant rather than rounded geometry", () => {
  const a = { id: "a", x: -999999, y: -999998 };
  const b = { id: "b", x: 999999, y: 999998 };
  const c = { id: "c", x: 1000000, y: 999999 };
  assert.equal(shared.determinant(a, b, c), 2n);
  assert.equal(shared.orientation(a, b, c), 1);
  assert.equal(shared.orientation(a, c, b), -1);
  assert.equal(shared.orientation(a, a, b), 0);
});

test("segment predicate distinguishes a crossing, endpoint touch, overlap and absence", () => {
  const p = (id, x, y) => ({ id, x, y });
  assert.equal(shared.segmentIntersection(p("a", 0, 0), p("b", 4, 4), p("c", 0, 4), p("d", 4, 0)).type, "proper");
  assert.equal(shared.segmentIntersection(p("a", 0, 0), p("b", 3, 0), p("c", 3, 0), p("d", 3, 4)).type, "touch");
  assert.equal(shared.segmentIntersection(p("a", 0, 0), p("b", 5, 0), p("c", 2, 0), p("d", 8, 0)).type, "overlap");
  assert.equal(shared.segmentIntersection(p("a", 0, 0), p("b", 1, 0), p("c", 2, 0), p("d", 3, 0)).type, "none");
});

test("Andrew, Graham and Jarvis agree with the canonical hull on every preset", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const points = core.preset(name);
    const expected = ids(shared.convexHull(points));
    core.ALGORITHMS.forEach((algorithm) => {
      const state = finish(core.createState(points, { algorithm }));
      assert.deepEqual(state.playback.current.hullIds.slice().sort(), expected, `${name}/${algorithm}`);
    });
  });
});

test("duplicate coordinates and a collinear input have a deterministic boundary", () => {
  const duplicatePreset = core.preset("duplicates");
  assert.equal(shared.uniqueCoordinates(duplicatePreset).length, duplicatePreset.length - 1);
  const line = [
    { id: "a", x: -3, y: -3 }, { id: "b", x: -1, y: -1 },
    { id: "c", x: 2, y: 2 }, { id: "d", x: 5, y: 5 },
  ];
  assert.deepEqual(ids(shared.convexHull(line)), ["a", "d"]);
});

test("point movement is bounded and playback remains immutable", () => {
  const points = core.preset("cloud");
  const moved = core.movePoint(points, "A", -9, 7);
  assert.equal(moved.find(({ id }) => id === "A").x, -9);
  assert.equal(points.find(({ id }) => id === "A").x, -7);
  assert.throws(() => core.movePoint(points, "missing", 0, 0), /Неизвестная/);
  assert.throws(() => core.movePoint(points, "A", 1000001, 0), /1000000/);

  const state = core.createState(points, { algorithm: "andrew" });
  const next = core.step(state);
  assert.equal(state.playback.cursor, 0);
  assert.equal(next.playback.cursor, 1);
  assert.ok(Object.isFrozen(next));
  assert.equal(core.seek(next, next.playback.frames.length - 1).playback.finished, true);
});

test("shared world/canvas transform is finite and reversible", () => {
  const bounds = runtime.boundsForPoints([{ x: -4, y: 2 }, { x: 8, y: 9 }], 0.2);
  const transform = runtime.createTransform(bounds, { width: 960, height: 520, padding: 32, zoom: 1.5, panX: 18, panY: -7 });
  const source = { x: 2.5, y: -1.25 };
  const restored = transform.toWorld(transform.toCanvas(source));
  assert.ok(Math.abs(restored.x - source.x) < 1e-9);
  assert.ok(Math.abs(restored.y - source.y) < 1e-9);
});

test("chapter and adapter use the common full-width geometry contract", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/geometric-predicates-convex-hull.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/geometric-predicates-convex-hull.js"), "utf8");
  const runtimeSource = fs.readFileSync(path.join(__dirname, "../labs/geometry-lab-runtime.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../labs/geometry-labs.css"), "utf8");
  assert.match(chapter, /data-atlas-node-id="geometric-predicates-convex-hull"/);
  assert.match(chapter, /class="[^"]*atlas-block--fullwidth[^"]*"[^>]*data-atlas-block="lab"/);
  assert.match(chapter, /geometry-lab-core\.js/);
  assert.match(chapter, /geometry-lab-runtime\.js/);
  assert.match(chapter, /geometry-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.match(runtimeSource, /pointerdown/);
  assert.match(runtimeSource, /keydown/);
  assert.match(runtimeSource, /wheel/);
  assert.match(css, /prefers-reduced-motion/);
});
