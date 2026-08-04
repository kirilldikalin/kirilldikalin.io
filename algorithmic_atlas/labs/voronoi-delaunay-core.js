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
    const coordinates = new Set();
    sites.forEach(function (site) {
      const key = String(site.x) + "," + String(site.y);
      if (coordinates.has(key)) {
        throw new RangeError("Совпадающие сайты нужно объединить до построения: " + key);
      }
      coordinates.add(key);
    });
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

  function triangleKeyFromIds(ids) {
    return ids.slice().sort().join("|");
  }

  function allCollinear(sites) {
    if (sites.length < 3) return true;
    return sites.slice(2).every(function (site) {
      return shared.orientation(sites[0], sites[1], site) === 0;
    });
  }

  function collinearEdges(sites) {
    const ordered = sites.slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    return ordered.slice(1).map(function (site, index) {
      return { aId: ordered[index].id, bId: site.id };
    });
  }

  function pointInsideOrOnTriangle(point, a, b, c) {
    const triangleOrientation = shared.orientation(a, b, c);
    if (triangleOrientation === 0) return false;
    let first = shared.orientation(a, b, point);
    let second = shared.orientation(b, c, point);
    let third = shared.orientation(c, a, point);
    if (triangleOrientation < 0) {
      first = -first; second = -second; third = -third;
    }
    return first >= 0 && second >= 0 && third >= 0;
  }

  function exactDelaunay(rawSites, preferredTriangles) {
    const sites = normalizeSites(rawSites);
    if (sites.length < 2) return shared.deepFreeze({ triangles: [], edges: [] });
    if (allCollinear(sites)) {
      return shared.deepFreeze({ triangles: [], edges: collinearEdges(sites) });
    }

    const candidates = [];
    for (let first = 0; first < sites.length; first += 1) {
      for (let second = first + 1; second < sites.length; second += 1) {
        for (let third = second + 1; third < sites.length; third += 1) {
          const a = sites[first]; const b = sites[second]; const c = sites[third];
          if (shared.orientation(a, b, c) === 0) continue;
          const empty = sites.every(function (site, index) {
            return index === first || index === second || index === third ||
              shared.inCircle(a, b, c, site) <= 0;
          });
          if (empty) candidates.push([a, b, c]);
        }
      }
    }

    const preferred = new Map((preferredTriangles || []).map(function (candidate) {
      return [triangleKeyFromIds(candidate.ids), candidate.id];
    }));
    const preferredEdges = new Set();
    (preferredTriangles || []).forEach(function (candidate) {
      [[0, 1], [1, 2], [2, 0]].forEach(function (pair) {
        const ids = candidate.ids;
        preferredEdges.add(ids[pair[0]] < ids[pair[1]]
          ? ids[pair[0]] + "|" + ids[pair[1]]
          : ids[pair[1]] + "|" + ids[pair[0]]);
      });
    });

    const candidateEdges = new Map();
    candidates.forEach(function (candidate) {
      [[candidate[0], candidate[1]], [candidate[1], candidate[2]], [candidate[2], candidate[0]]]
        .forEach(function (edge) {
          const blocked = sites.some(function (site) {
            return site.id !== edge[0].id && site.id !== edge[1].id &&
              shared.onSegment(edge[0], edge[1], site);
          });
          if (!blocked) {
            candidateEdges.set(edgeKey(edge[0], edge[1]), {
              a: edge[0], b: edge[1], distanceSquared: shared.squaredDistance(edge[0], edge[1]),
            });
          }
        });
    });

    const orderedEdges = Array.from(candidateEdges.values()).sort(function (left, right) {
      const leftKey = edgeKey(left.a, left.b); const rightKey = edgeKey(right.a, right.b);
      const leftPreferred = preferredEdges.has(leftKey); const rightPreferred = preferredEdges.has(rightKey);
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
      if (left.distanceSquared !== right.distanceSquared) {
        return left.distanceSquared < right.distanceSquared ? -1 : 1;
      }
      return leftKey.localeCompare(rightKey);
    });
    const selectedEdges = [];
    orderedEdges.forEach(function (candidate) {
      const crosses = selectedEdges.some(function (selected) {
        if ([candidate.a.id, candidate.b.id].some(function (id) {
          return id === selected.a.id || id === selected.b.id;
        })) return false;
        return shared.segmentIntersection(candidate.a, candidate.b, selected.a, selected.b).type !== "none";
      });
      if (!crosses) selectedEdges.push(candidate);
    });

    const selectedKeys = new Set(selectedEdges.map(function (edge) { return edgeKey(edge.a, edge.b); }));
    let serial = 0;
    const triangles = candidates.filter(function (candidate) {
      if (!selectedKeys.has(edgeKey(candidate[0], candidate[1])) ||
          !selectedKeys.has(edgeKey(candidate[1], candidate[2])) ||
          !selectedKeys.has(edgeKey(candidate[2], candidate[0]))) return false;
      return !sites.some(function (site) {
        return !candidate.some(function (vertex) { return vertex.id === site.id; }) &&
          pointInsideOrOnTriangle(site, candidate[0], candidate[1], candidate[2]);
      });
    }).map(function (candidate) {
      const ids = candidate.map(function (site) { return site.id; });
      return {
        id: preferred.get(triangleKeyFromIds(ids)) || "d" + (++serial),
        ids: shared.orientation(candidate[0], candidate[1], candidate[2]) > 0
          ? ids : [ids[0], ids[2], ids[1]],
      };
    });
    const usedEdgeKeys = new Set();
    triangles.forEach(function (candidate) {
      [[0, 1], [1, 2], [2, 0]].forEach(function (pair) {
        const ids = candidate.ids;
        usedEdgeKeys.add(ids[pair[0]] < ids[pair[1]]
          ? ids[pair[0]] + "|" + ids[pair[1]]
          : ids[pair[1]] + "|" + ids[pair[0]]);
      });
    });
    const edges = selectedEdges.filter(function (edge) {
      return usedEdgeKeys.has(edgeKey(edge.a, edge.b));
    }).map(function (edge) { return { aId: edge.a.id, bId: edge.b.id }; });
    return shared.deepFreeze({ triangles: triangles, edges: edges });
  }

  function boundarySiteCount(sites) {
    if (sites.length < 3 || allCollinear(sites)) return sites.length;
    const hull = shared.convexHull(sites);
    return sites.filter(function (site) {
      return hull.some(function (vertex, index) {
        return shared.onSegment(vertex, hull[(index + 1) % hull.length], site);
      });
    }).length;
  }

  function triangulationAudit(rawSites, rawTriangles, rawEdges) {
    const sites = normalizeSites(rawSites);
    const triangles = rawTriangles || [];
    const edges = rawEdges || [];
    const byId = new Map(sites.map(function (site) { return [site.id, site]; }));
    const reasons = [];
    if (allCollinear(sites)) {
      if (triangles.length !== 0) reasons.push("collinear-triangles");
      if (edges.length !== Math.max(0, sites.length - 1)) reasons.push("collinear-chain");
    } else if (sites.length >= 3) {
      const boundaryCount = boundarySiteCount(sites);
      if (triangles.length !== 2 * sites.length - 2 - boundaryCount) reasons.push("euler-triangles");
      if (edges.length !== 3 * sites.length - 3 - boundaryCount) reasons.push("euler-edges");
    }
    if (emptyCircleViolations(sites, triangles).length) reasons.push("empty-circle");
    let areaSum = 0n;
    triangles.forEach(function (candidate) {
      const points = candidate.ids.map(function (id) { return byId.get(id); });
      if (points.some(function (point) { return !point; }) || shared.orientation(points[0], points[1], points[2]) === 0) {
        reasons.push("degenerate-triangle");
      } else {
        const area = shared.polygonArea2(points);
        areaSum += area < 0n ? -area : area;
      }
    });
    const hull = shared.convexHull(sites);
    const hullArea = hull.length >= 3 ? shared.polygonArea2(hull) : 0n;
    if (areaSum !== (hullArea < 0n ? -hullArea : hullArea)) reasons.push("hull-coverage");
    for (let first = 0; first < edges.length; first += 1) {
      const a = byId.get(edges[first].aId); const b = byId.get(edges[first].bId);
      if (!a || !b || a.id === b.id) { reasons.push("unknown-edge"); continue; }
      for (let second = first + 1; second < edges.length; second += 1) {
        const c = byId.get(edges[second].aId); const d = byId.get(edges[second].bId);
        if (!c || !d || [a.id, b.id].some(function (id) { return id === c.id || id === d.id; })) continue;
        if (shared.segmentIntersection(a, b, c, d).type !== "none") reasons.push("crossing-edges");
      }
    }
    return shared.deepFreeze({
      valid: reasons.length === 0,
      reasons: Array.from(new Set(reasons)),
      area2: areaSum,
      hullArea2: hullArea < 0n ? -hullArea : hullArea,
    });
  }

  function superTriangleForSites(sites) {
    const minX = Math.min.apply(null, sites.map(function (site) { return site.x; }));
    const maxX = Math.max.apply(null, sites.map(function (site) { return site.x; }));
    const minY = Math.min.apply(null, sites.map(function (site) { return site.y; }));
    const maxY = Math.max.apply(null, sites.map(function (site) { return site.y; }));
    const centerX = Math.round((minX + maxX) / 2);
    const centerY = Math.round((minY + maxY) / 2);
    const span = Math.max(2, maxX - minX, maxY - minY);
    const radius = Math.max(20, span * 8);
    return [
      shared.normalizePoint({ id: "__super-a", label: "S₁", x: centerX - 2 * radius, y: centerY - radius }, 0),
      shared.normalizePoint({ id: "__super-b", label: "S₂", x: centerX + 2 * radius, y: centerY - radius }, 1),
      shared.normalizePoint({ id: "__super-c", label: "S₃", x: centerX, y: centerY + 2 * radius }, 2),
    ];
  }

  function bowyerWatson(rawSites) {
    const sites = normalizeSites(rawSites).slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    if (sites.length < 3 || allCollinear(sites)) {
      const exact = exactDelaunay(sites);
      const exactAudit = triangulationAudit(sites, exact.triangles, exact.edges);
      if (!exactAudit.valid) {
        throw new Error("Точный контроль Delaunay-графа не пройден: " + exactAudit.reasons.join(", "));
      }
      return shared.deepFreeze({
        sites: sites, supportSites: [], triangles: exact.triangles, edges: exact.edges,
        frames: [{
          phase: "finished", triangles: exact.triangles, activeSiteId: null,
          message: sites.length < 3
            ? "Двумерных граней нет; Delaunay-граф сохраняет линейное соседство"
            : "Коллинеарные сайты образуют Delaunay-цепь без двумерных треугольников",
          finished: true,
        }],
      });
    }
    const supportSites = superTriangleForSites(sites);
    const superA = supportSites[0]; const superB = supportSites[1]; const superC = supportSites[2];
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
    const preliminaryTriangles = triangles.map(publicTriangle);
    const preliminaryEdges = Array.from(edgeMap.values()).sort(function (left, right) {
      return (left.aId + left.bId).localeCompare(right.aId + right.bId);
    });
    const exact = exactDelaunay(sites, preliminaryTriangles);
    const preliminaryAudit = triangulationAudit(sites, preliminaryTriangles, preliminaryEdges);
    const exactAudit = triangulationAudit(sites, exact.triangles, exact.edges);
    if (!exactAudit.valid) {
      throw new Error("Точный контроль триангуляции не пройден: " + exactAudit.reasons.join(", "));
    }
    frames.push({
      phase: "finished", activeSiteId: null, badTriangleIds: [], boundaryEdges: [],
      triangles: exact.triangles,
      message: preliminaryAudit.valid
        ? "Супертреугольник удалён; покрытие, планарность и пустые окружности сверены"
        : "Конечный результат дополнен точным контролем покрытия и пустых окружностей",
      finished: true,
    });
    return shared.deepFreeze({
      sites: sites, supportSites: supportSites,
      triangles: exact.triangles, edges: exact.edges, frames: frames,
    });
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
      supportSites: state.triangulation.supportSites,
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
    exactDelaunay: exactDelaunay,
    triangulationAudit: triangulationAudit,
    emptyCircleViolations: emptyCircleViolations,
    createState: createState,
    step: step,
    seek: seek,
    moveSite: moveSite,
    visualModel: visualModel,
  });
});
