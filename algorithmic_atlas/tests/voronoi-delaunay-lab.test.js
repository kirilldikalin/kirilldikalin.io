"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const shared = require("../labs/geometry-lab-core.js");
const core = require("../labs/voronoi-delaunay-core.js");

function insideConvexPolygon(point, polygon) {
  if (!polygon.length) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length];
    const cross = (next.x - polygon[index].x) * (point.y - polygon[index].y) -
      (next.y - polygon[index].y) * (point.x - polygon[index].x);
    if (Math.abs(cross) <= 1e-7) continue;
    const current = Math.sign(cross);
    if (sign && sign !== current) return false;
    sign = current;
  }
  return true;
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

test("every clipped Voronoi cell is nonempty and contains its own site", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const sites = core.preset(name);
    const byId = new Map(sites.map((site) => [site.id, site]));
    core.voronoiCells(sites).forEach((cell) => {
      assert.ok(cell.polygon.length >= 3, `${name}/${cell.siteId}`);
      assert.equal(insideConvexPolygon(byId.get(cell.siteId), cell.polygon), true, `${name}/${cell.siteId}`);
    });
  });
});

test("Delaunay triangles satisfy the exact empty-circle predicate", () => {
  Object.keys(core.PRESETS).forEach((name) => {
    const sites = core.preset(name);
    const triangulation = core.bowyerWatson(sites);
    assert.deepEqual(core.emptyCircleViolations(sites, triangulation.triangles), [], name);
    assert.equal(core.triangulationAudit(sites, triangulation.triangles, triangulation.edges).valid, true, name);
    triangulation.triangles.forEach((triangle) => assert.equal(new Set(triangle.ids).size, 3));
  });
});

test("cocircular ties are deterministic and all-collinear sites produce a neighbor chain", () => {
  const cocircular = core.preset("cocircular");
  assert.deepEqual(core.bowyerWatson(cocircular), core.bowyerWatson(cocircular));
  const line = [
    { id: "a", x: -6, y: -3 }, { id: "b", x: -2, y: -1 },
    { id: "c", x: 2, y: 1 }, { id: "d", x: 6, y: 3 },
  ];
  const collinear = core.bowyerWatson(line);
  assert.deepEqual(collinear.triangles, []);
  assert.deepEqual(collinear.edges.map(({ aId, bId }) => [aId, bId]), [["a", "b"], ["b", "c"], ["c", "d"]]);
  assert.equal(core.triangulationAudit(line, collinear.triangles, collinear.edges).valid, true);
  assert.deepEqual(core.bowyerWatson([]).triangles, []);
});

test("final validation repairs the incomplete four-site regression", () => {
  const sites = [
    { id: "p0", x: 8, y: -18 },
    { id: "p1", x: 4, y: 7 },
    { id: "p2", x: -2, y: 2 },
    { id: "p3", x: 6, y: -13 },
  ];
  const triangulation = core.bowyerWatson(sites);
  assert.equal(triangulation.triangles.length, 3);
  assert.equal(triangulation.edges.length, 6);
  const audit = core.triangulationAudit(sites, triangulation.triangles, triangulation.edges);
  assert.equal(audit.valid, true);
  assert.deepEqual(audit.reasons, []);
  assert.equal(audit.area2, 170n);
  assert.equal(audit.hullArea2, 170n);
  assert.equal(core.triangulationAudit(sites, triangulation.triangles.slice(0, 2), triangulation.edges).valid, false);
});

test("incircle sign, movement and safety bounds use exact shared predicates", () => {
  const a = { id: "a", x: 0, y: 0 };
  const b = { id: "b", x: 4, y: 0 };
  const c = { id: "c", x: 0, y: 4 };
  assert.equal(shared.inCircle(a, b, c, { id: "p", x: 1, y: 1 }), 1);
  assert.equal(shared.inCircle(a, b, c, { id: "q", x: 4, y: 4 }), 0);
  assert.equal(shared.inCircle(a, b, c, { id: "r", x: 6, y: 6 }), -1);

  const sites = core.preset("villages");
  const moved = core.moveSite(sites, "A", -9, 2);
  assert.equal(moved.find(({ id }) => id === "A").x, -9);
  assert.equal(sites.find(({ id }) => id === "A").x, -7);
  assert.throws(() => core.moveSite(sites, "missing", 0, 0), /Неизвестный/);
  assert.throws(() => core.normalizeSites([{ id: "a", x: 500001, y: 0 }]), /500000/);
  assert.throws(() => core.normalizeSites([{ id: "a", x: -13000, y: 0 }, { id: "b", x: 13000, y: 0 }]), /25000/);
  assert.throws(() => core.normalizeSites([{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }]), /Совпадающие/);
  assert.throws(() => core.moveSite([{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 0 }], "b", 0, 0), /Совпадающие/);
});

test("Voronoi/Delaunay playback is immutable, seekable and bounded", () => {
  const state = core.createState(core.preset("villages"));
  assert.ok(Object.isFrozen(state));
  assert.equal(core.step(state).playback.cursor, 1);
  const final = finish(state);
  assert.equal(final.playback.finished, true);
  assert.equal(core.seek(final, 0).playback.cursor, 0);
  assert.deepEqual(core.visualModel(final).violations, []);
  assert.equal(final.triangulation.supportSites.length, 3);
  assert.ok(final.triangulation.supportSites.every(({ x, y }) => Math.abs(x) <= shared.COORDINATE_LIMIT && Math.abs(y) <= shared.COORDINATE_LIMIT));
  assert.ok(final.playback.frames.slice(0, -1).some((frame) =>
    frame.triangles.some((triangle) => triangle.ids.some((id) => id.startsWith("__super-")))
  ));
  assert.equal(final.playback.current.triangles.some((triangle) =>
    triangle.ids.some((id) => id.startsWith("__super-"))
  ), false);
});

test("chapter and adapter use the common full-width geometry contract", () => {
  const chapter = fs.readFileSync(path.join(__dirname, "../chapters/voronoi-delaunay.html"), "utf8");
  const adapter = fs.readFileSync(path.join(__dirname, "../labs/voronoi-delaunay.js"), "utf8");
  assert.match(chapter, /data-atlas-node-id="voronoi-delaunay"/);
  assert.match(chapter, /class="[^"]*atlas-block--fullwidth[^"]*"[^>]*data-atlas-block="lab"/);
  assert.match(chapter, /geometry-lab-core\.js/);
  assert.match(chapter, /geometry-lab-runtime\.js/);
  assert.match(chapter, /geometry-labs\.css/);
  assert.equal((chapter.match(/class="atlas-exercise"/g) || []).length, 12);
  assert.ok((chapter.match(/target="_blank"/g) || []).length >= 3);
  assert.match(chapter, /2n-2-h/);
  assert.doesNotMatch(chapter, /2n-5-h/);
  assert.match(adapter, /runtime\.mount\(/);
  assert.match(adapter, /value="voronoi"/);
  assert.match(adapter, /value="delaunay"/);
  assert.match(adapter, /model\.supportSites/);
  assert.match(adapter, /полную опорную диаграмму/);
  assert.doesNotMatch(adapter, /\beval\s*\(|new\s+Function\b/);
});
