(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./geometry-lab-core.js")
    : root.AtlasGeometryLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VoronoiDelaunayCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGeometryLabCore is unavailable");

  const PRESETS = shared.deepFreeze({
    villages: [
      { id: "A", x: -7, y: -3 }, { id: "B", x: -5, y: 4 },
      { id: "C", x: -1, y: 1 }, { id: "D", x: 2, y: 5 },
      { id: "E", x: 4, y: -3 }, { id: "F", x: 7, y: 2 },
    ],
    square: [
      { id: "A", x: -5, y: -5 }, { id: "B", x: 5, y: -5 },
      { id: "C", x: 5, y: 5 }, { id: "D", x: -5, y: 5 },
      { id: "E", x: 0, y: 0 },
    ],
    cocircular: [
      { id: "A", x: -6, y: 0 }, { id: "B", x: 0, y: 6 },
      { id: "C", x: 6, y: 0 }, { id: "D", x: 0, y: -6 },
    ],
    collinear: [
      { id: "A", x: -7, y: -3 }, { id: "B", x: -3, y: -1 },
      { id: "C", x: 1, y: 1 }, { id: "D", x: 5, y: 3 },
      { id: "E", x: 0, y: 6 },
    ],
  });

  function normalizeSites(rawSites) {
    const sites = shared.normalizePoints(rawSites, { maxPoints: 18 });
    if (sites.length) {
      const xs = sites.map(function (site) { return site.x; });
      const ys = sites.map(function (site) { return site.y; });
      const absoluteMaximum = Math.max.apply(null, sites.flatMap(function (site) {
        return [Math.abs(site.x), Math.abs(site.y)];
      }));
      const span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
      if (absoluteMaximum > 500000) throw new RangeError("Для безопасного супертреугольника модуль координаты не должен превышать 500000");
      if (span > 25000) throw new RangeError("Для наглядной триангуляции диапазон координат не должен превышать 25000");
    }
    return sites;
  }

  function preset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new RangeError("Неизвестный набор сайтов");
    return normalizeSites(PRESETS[name]);
  }

  function boundsForSites(rawSites, rawMargin) {
    const sites = normalizeSites(rawSites);
    if (!sites.length) return shared.deepFreeze({ minX: -10, maxX: 10, minY: -7, maxY: 7 });
    const minX = Math.min.apply(null, sites.map(function (site) { return site.x; }));
    const maxX = Math.max.apply(null, sites.map(function (site) { return site.x; }));
    const minY = Math.min.apply(null, sites.map(function (site) { return site.y; }));
    const maxY = Math.max.apply(null, sites.map(function (site) { return site.y; }));
    const span = Math.max(2, maxX - minX, maxY - minY);
    const margin = rawMargin === undefined ? Math.max(2, span * 0.35) : Number(rawMargin);
    if (!Number.isFinite(margin) || margin <= 0) throw new RangeError("Отступ должен быть положительным");
    return shared.deepFreeze({ minX: minX - margin, maxX: maxX + margin, minY: minY - margin, maxY: maxY + margin });
  }

  function voronoiCells(rawSites, rawBounds) {
    const sites = normalizeSites(rawSites);
    const bounds = rawBounds || boundsForSites(sites);
    const rectangle = [
      { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
    ];
    return shared.deepFreeze(sites.map(function (site) {
      let polygon = rectangle.slice();
      sites.forEach(function (other) {
        if (other.id === site.id) return;
        const nx = 2 * (other.x - site.x);
        const ny = 2 * (other.y - site.y);
        const limit = other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y;
        polygon = shared.clipPolygonHalfPlane(polygon, nx, ny, limit);
      });
      return { siteId: site.id, polygon: polygon };
    }));
  }

  function triangle(id, a, b, c) {
    if (shared.orientation(a, b, c) === 0) return null;
    const vertices = shared.orientation(a, b, c) > 0 ? [a, b, c] : [a, c, b];
    return { id: id, a: vertices[0], b: vertices[1], c: vertices[2] };
  }

  function edgeKey(a, b) {
    return a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
  }

  function triangleEdges(value) {
    return [[value.a, value.b], [value.b, value.c], [value.c, value.a]];
  }

  function publicTriangle(value) {
    return { id: value.id, ids: [value.a.id, value.b.id, value.c.id] };
  }

  function bowyerWatson(rawSites) {
    const sites = normalizeSites(rawSites).slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    if (sites.length < 3) {
      return shared.deepFreeze({ sites: sites, triangles: [], edges: [], frames: [{ phase: "finished", triangles: [], activeSiteId: null, message: "Для треугольника нужны три неколлинеарные точки", finished: true }] });
    }
    const bounds = boundsForSites(sites);
    const centerX = Math.round((bounds.minX + bounds.maxX) / 2);
    const centerY = Math.round((bounds.minY + bounds.maxY) / 2);
    const span = Math.ceil(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
    const radius = Math.max(20, span * 2);
    const superA = shared.normalizePoint({ id: "__super-a", x: centerX - 2 * radius, y: centerY - radius }, 0);
    const superB = shared.normalizePoint({ id: "__super-b", x: centerX + 2 * radius, y: centerY - radius }, 1);
    const superC = shared.normalizePoint({ id: "__super-c", x: centerX, y: centerY + 2 * radius }, 2);
    let serial = 0;
    let triangles = [triangle("t" + (++serial), superA, superB, superC)];
    const frames = [{ phase: "ready", activeSiteId: null, badTriangleIds: [], boundaryEdges: [], triangles: triangles.map(publicTriangle), message: "Супертреугольник содержит все сайты" }];

    sites.forEach(function (site) {
      const bad = triangles.filter(function (candidate) {
        return shared.inCircle(candidate.a, candidate.b, candidate.c, site) >= 0;
      });
      const badIds = new Set(bad.map(function (candidate) { return candidate.id; }));
      const counts = new Map();
      bad.forEach(function (candidate) {
        triangleEdges(candidate).forEach(function (edge) {
          const key = edgeKey(edge[0], edge[1]);
          if (!counts.has(key)) counts.set(key, { count: 0, edge: edge });
          counts.get(key).count += 1;
        });
      });
      const boundary = Array.from(counts.values()).filter(function (entry) { return entry.count === 1; }).map(function (entry) { return entry.edge; });
      frames.push({
        phase: "cavity", activeSiteId: site.id, badTriangleIds: Array.from(badIds),
        boundaryEdges: boundary.map(function (edge) { return [edge[0].id, edge[1].id]; }),
        triangles: triangles.map(publicTriangle),
        activeCircle: bad.length ? shared.circumcircle(bad[0].a, bad[0].b, bad[0].c) : null,
        message: "Удаляем треугольники, чьи окружности содержат " + site.id,
      });
      triangles = triangles.filter(function (candidate) { return !badIds.has(candidate.id); });
      boundary.forEach(function (edge) {
        const candidate = triangle("t" + (++serial), edge[0], edge[1], site);
        if (candidate) triangles.push(candidate);
      });
      frames.push({
        phase: "insert", activeSiteId: site.id, badTriangleIds: [],
        boundaryEdges: boundary.map(function (edge) { return [edge[0].id, edge[1].id]; }),
        triangles: triangles.map(publicTriangle),
        message: "Полость соединена с новым сайтом " + site.id,
      });
    });

    const superIds = new Set([superA.id, superB.id, superC.id]);
    triangles = triangles.filter(function (candidate) {
      return ![candidate.a.id, candidate.b.id, candidate.c.id].some(function (id) { return superIds.has(id); });
    });
    const edgeMap = new Map();
    triangles.forEach(function (candidate) {
      triangleEdges(candidate).forEach(function (edge) {
        if (superIds.has(edge[0].id) || superIds.has(edge[1].id)) return;
        edgeMap.set(edgeKey(edge[0], edge[1]), { aId: edge[0].id, bId: edge[1].id });
      });
    });
    const publicTriangles = triangles.map(publicTriangle);
    const edges = Array.from(edgeMap.values()).sort(function (left, right) {
      return (left.aId + left.bId).localeCompare(right.aId + right.bId);
    });
    frames.push({ phase: "finished", activeSiteId: null, badTriangleIds: [], boundaryEdges: [], triangles: publicTriangles, message: "Супертреугольник удалён; осталась триангуляция Делоне", finished: true });
    return shared.deepFreeze({ sites: sites, triangles: publicTriangles, edges: edges, frames: frames });
  }

  function emptyCircleViolations(rawSites, rawTriangles) {
    const sites = normalizeSites(rawSites);
    const byId = new Map(sites.map(function (site) { return [site.id, site]; }));
    const violations = [];
    (rawTriangles || []).forEach(function (candidate) {
      const vertices = candidate.ids.map(function (id) { return byId.get(id); });
      if (vertices.some(function (site) { return !site; }) || shared.orientation(vertices[0], vertices[1], vertices[2]) === 0) {
        violations.push({ triangleId: candidate.id, siteId: null, reason: "degenerate" });
        return;
      }
      sites.forEach(function (site) {
        if (candidate.ids.includes(site.id)) return;
        if (shared.inCircle(vertices[0], vertices[1], vertices[2], site) > 0) {
          violations.push({ triangleId: candidate.id, siteId: site.id, reason: "inside" });
        }
      });
    });
    return shared.deepFreeze(violations);
  }

  function createState(rawSites) {
    const sites = normalizeSites(rawSites);
    const triangulation = bowyerWatson(sites);
    return shared.deepFreeze({
      sites: sites,
      bounds: boundsForSites(sites),
      cells: voronoiCells(sites, boundsForSites(sites)),
      triangulation: triangulation,
      playback: shared.createPlayback(triangulation.frames),
    });
  }

  function step(state) {
    if (state.playback.finished) return state;
    return shared.deepFreeze(Object.assign({}, state, { playback: shared.stepPlayback(state.playback) }));
  }

  function seek(state, cursor) {
    return shared.deepFreeze(Object.assign({}, state, { playback: shared.seekPlayback(state.playback, cursor) }));
  }

  function moveSite(rawSites, id, rawX, rawY) {
    const sites = normalizeSites(rawSites);
    if (!sites.some(function (site) { return site.id === id; })) throw new RangeError("Неизвестный сайт");
    return normalizeSites(sites.map(function (site) {
      return site.id === id ? { id: site.id, label: site.label, x: rawX, y: rawY } : site;
    }));
  }

  function visualModel(state) {
    return shared.deepFreeze({
      sites: state.sites,
      bounds: state.bounds,
      cells: state.cells,
      triangulation: state.triangulation,
      frame: state.playback.current,
      cursor: state.playback.cursor,
      frameCount: state.playback.frames.length,
      finished: state.playback.finished,
      violations: emptyCircleViolations(state.sites, state.triangulation.triangles),
    });
  }

  return Object.freeze({
    PRESETS: PRESETS,
    preset: preset,
    normalizeSites: normalizeSites,
    boundsForSites: boundsForSites,
    voronoiCells: voronoiCells,
    bowyerWatson: bowyerWatson,
    emptyCircleViolations: emptyCircleViolations,
    createState: createState,
    step: step,
    seek: seek,
    moveSite: moveSite,
    visualModel: visualModel,
  });
});
