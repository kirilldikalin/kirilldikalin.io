(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./geometry-lab-core.js")
    : root.AtlasGeometryLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SweepLineClosestPairRangeSearchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGeometryLabCore is unavailable");

  const MODES = Object.freeze(["sweep", "closest", "range"]);
  const PRESETS = shared.deepFreeze({
    city: {
      points: [
        { id: "A", x: -8, y: -4 }, { id: "B", x: -7, y: 5 },
        { id: "C", x: -4, y: 1 }, { id: "D", x: -1, y: -3 },
        { id: "E", x: 1, y: 4 }, { id: "F", x: 3, y: -1 },
        { id: "G", x: 6, y: 5 }, { id: "H", x: 8, y: -4 },
        { id: "I", x: 4, y: 2 }, { id: "J", x: -2, y: 5 },
      ],
      segments: [
        { id: "s1", a: { id: "s1a", x: -8, y: -4 }, b: { id: "s1b", x: 7, y: 5 } },
        { id: "s2", a: { id: "s2a", x: -7, y: 5 }, b: { id: "s2b", x: 8, y: -3 } },
        { id: "s3", a: { id: "s3a", x: -6, y: 1 }, b: { id: "s3b", x: 8, y: 1 } },
        { id: "s4", a: { id: "s4a", x: -1, y: -5 }, b: { id: "s4b", x: 2, y: 6 } },
        { id: "s5", a: { id: "s5a", x: 4, y: -5 }, b: { id: "s5b", x: 5, y: 5 } },
      ],
      query: { minX: -4, maxX: 4, minY: -2, maxY: 4 },
    },
    sparse: {
      points: [
        { id: "A", x: -9, y: -5 }, { id: "B", x: -8, y: 5 },
        { id: "C", x: -3, y: -1 }, { id: "D", x: 1, y: 3 },
        { id: "E", x: 6, y: -4 }, { id: "F", x: 9, y: 5 },
      ],
      segments: [
        { id: "s1", a: { id: "s1a", x: -9, y: -4 }, b: { id: "s1b", x: -1, y: 4 } },
        { id: "s2", a: { id: "s2a", x: -8, y: 5 }, b: { id: "s2b", x: -2, y: 1 } },
        { id: "s3", a: { id: "s3a", x: 2, y: -5 }, b: { id: "s3b", x: 8, y: 4 } },
      ],
      query: { minX: -4, maxX: 3, minY: -3, maxY: 4 },
    },
    degenerate: {
      points: [
        { id: "A", x: -6, y: 0 }, { id: "B", x: -2, y: 0 },
        { id: "C", x: -2, y: 0 }, { id: "D", x: 2, y: 0 },
        { id: "E", x: 6, y: 0 }, { id: "F", x: 0, y: 4 },
      ],
      segments: [
        { id: "s1", a: { id: "s1a", x: -8, y: 0 }, b: { id: "s1b", x: 8, y: 0 } },
        { id: "s2", a: { id: "s2a", x: -3, y: 0 }, b: { id: "s2b", x: 5, y: 0 } },
        { id: "s3", a: { id: "s3a", x: 0, y: -5 }, b: { id: "s3b", x: 0, y: 5 } },
      ],
      query: { minX: -2, maxX: 2, minY: -1, maxY: 1 },
    },
  });

  function normalizeQuery(rawQuery) {
    const query = rawQuery || {};
    const values = ["minX", "maxX", "minY", "maxY"].map(function (name) {
      return shared.boundedInteger(query[name], name, -1000000, 1000000);
    });
    if (!(values[0] <= values[1] && values[2] <= values[3])) {
      throw new RangeError("Границы прямоугольного запроса перепутаны");
    }
    return shared.deepFreeze({ minX: values[0], maxX: values[1], minY: values[2], maxY: values[3] });
  }

  function normalizeSegments(rawSegments) {
    if (!Array.isArray(rawSegments) || rawSegments.length > 24) {
      throw new RangeError("Допустимо не больше 24 отрезков");
    }
    const ids = new Set();
    return shared.deepFreeze(rawSegments.map(function (segment, index) {
      if (!segment || typeof segment !== "object") throw new TypeError("Отрезок должен быть объектом");
      const id = segment.id === undefined ? "s" + (index + 1) : String(segment.id);
      if (ids.has(id)) throw new RangeError("Идентификатор отрезка повторяется: " + id);
      ids.add(id);
      return { id: id, a: shared.normalizePoint(segment.a, index * 2), b: shared.normalizePoint(segment.b, index * 2 + 1) };
    }));
  }

  function preset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new RangeError("Неизвестный пример");
    return shared.deepFreeze({
      id: name,
      points: shared.normalizePoints(PRESETS[name].points, { maxPoints: 32 }),
      segments: normalizeSegments(PRESETS[name].segments),
      query: normalizeQuery(PRESETS[name].query),
    });
  }

  function bruteIntersections(rawSegments) {
    const segments = normalizeSegments(rawSegments);
    const intersections = [];
    for (let left = 0; left < segments.length; left += 1) {
      for (let right = left + 1; right < segments.length; right += 1) {
        const value = shared.segmentIntersection(
          segments[left].a, segments[left].b, segments[right].a, segments[right].b
        );
        if (value.type !== "none") {
          intersections.push({ leftId: segments[left].id, rightId: segments[right].id, value: value });
        }
      }
    }
    return shared.deepFreeze(intersections);
  }

  function leftEndpoint(segment) {
    if (segment.a.x < segment.b.x || (segment.a.x === segment.b.x && segment.a.y <= segment.b.y)) return segment.a;
    return segment.b;
  }

  function rightEndpoint(segment) {
    return leftEndpoint(segment).id === segment.a.id ? segment.b : segment.a;
  }

  function sweepTrace(rawSegments) {
    const segments = normalizeSegments(rawSegments);
    const events = [];
    segments.forEach(function (segment) {
      const left = leftEndpoint(segment); const right = rightEndpoint(segment);
      events.push({ x: left.x, y: left.y, kind: "start", segmentId: segment.id });
      events.push({ x: right.x, y: right.y, kind: "finish", segmentId: segment.id });
    });
    events.sort(function (left, right) {
      return left.x - right.x || (left.kind === right.kind ? left.y - right.y : left.kind === "start" ? -1 : 1) || left.segmentId.localeCompare(right.segmentId);
    });
    const byId = new Map(segments.map(function (segment) { return [segment.id, segment]; }));
    const active = new Set();
    const found = [];
    const seenPairs = new Set();
    const frames = [{ phase: "ready", sweepX: events.length ? events[0].x : 0, activeIds: [], intersections: [], message: "Очередь событий упорядочена по x" }];
    events.forEach(function (event) {
      if (event.kind === "start") {
        const current = byId.get(event.segmentId);
        active.forEach(function (otherId) {
          const pair = [event.segmentId, otherId].sort(); const key = pair.join("|");
          if (seenPairs.has(key)) return;
          seenPairs.add(key);
          const value = shared.segmentIntersection(current.a, current.b, byId.get(otherId).a, byId.get(otherId).b);
          if (value.type !== "none") found.push({ leftId: pair[0], rightId: pair[1], value: value });
        });
        active.add(event.segmentId);
      } else {
        active.delete(event.segmentId);
      }
      frames.push({
        phase: event.kind,
        sweepX: event.x,
        event: event,
        activeIds: Array.from(active).sort(),
        intersections: found.slice(),
        message: (event.kind === "start" ? "Добавляем " : "Удаляем ") + event.segmentId + " в структуре статуса",
      });
    });
    frames.push({
      phase: "finished", sweepX: events.length ? events[events.length - 1].x : 0,
      activeIds: [], intersections: found.slice(), finished: true,
      message: "Все события обработаны; пересечения классифицированы точно",
    });
    return shared.deepFreeze({ segments: segments, events: events, intersections: found, frames: frames });
  }

  function bruteClosestPair(rawPoints) {
    const points = shared.normalizePoints(rawPoints, { maxPoints: 64 });
    if (points.length < 2) return null;
    let best = null;
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const distanceSquared = shared.squaredDistance(points[left], points[right]);
        if (!best || distanceSquared < best.distanceSquared ||
            (distanceSquared === best.distanceSquared &&
              (points[left].id + points[right].id) < (best.a.id + best.b.id))) {
          best = { a: points[left], b: points[right], distanceSquared: distanceSquared };
        }
      }
    }
    return shared.deepFreeze(best);
  }

  function closestPairTrace(rawPoints) {
    const points = shared.normalizePoints(rawPoints, { maxPoints: 48 });
    const sorted = points.slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    const frames = [{ phase: "ready", activeIds: [], stripIds: [], best: null, message: "Точки упорядочены по x" }];

    function better(left, right) {
      if (!left) return right;
      if (!right) return left;
      if (left.distanceSquared !== right.distanceSquared) return left.distanceSquared < right.distanceSquared ? left : right;
      return (left.a.id + left.b.id) <= (right.a.id + right.b.id) ? left : right;
    }

    function solve(sequence) {
      if (sequence.length <= 3) {
        const best = bruteClosestPair(sequence);
        frames.push({ phase: "base", activeIds: sequence.map(function (point) { return point.id; }), stripIds: [], best: best, message: "Базовый случай проверяет все пары" });
        return best;
      }
      const middle = Math.floor(sequence.length / 2);
      const left = sequence.slice(0, middle); const right = sequence.slice(middle);
      const splitX = (left[left.length - 1].x + right[0].x) / 2;
      frames.push({ phase: "split", splitX: splitX, activeIds: sequence.map(function (point) { return point.id; }), stripIds: [], best: null, message: "Разделяем набор вертикальной прямой" });
      let best = better(solve(left), solve(right));
      if (!best) return null;
      const strip = sequence.filter(function (point) {
        const dx = BigInt(2 * point.x) - BigInt(Math.round(2 * splitX));
        return dx * dx < 4n * best.distanceSquared;
      }).sort(function (a, b) { return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id); });
      frames.push({ phase: "strip", splitX: splitX, activeIds: [], stripIds: strip.map(function (point) { return point.id; }), best: best, message: "Проверяем полосу ширины 2δ" });
      for (let first = 0; first < strip.length; first += 1) {
        for (let second = first + 1; second < strip.length; second += 1) {
          const dy = BigInt(strip[second].y - strip[first].y);
          if (dy * dy >= best.distanceSquared) break;
          const candidate = { a: strip[first], b: strip[second], distanceSquared: shared.squaredDistance(strip[first], strip[second]) };
          frames.push({ phase: "compare", splitX: splitX, activeIds: [candidate.a.id, candidate.b.id], stripIds: strip.map(function (point) { return point.id; }), best: best, candidate: candidate, message: "Сравниваем соседей в полосе" });
          best = better(best, candidate);
        }
      }
      frames.push({ phase: "merge", splitX: splitX, activeIds: [best.a.id, best.b.id], stripIds: strip.map(function (point) { return point.id; }), best: best, message: "Минимум половин и полосы объединён" });
      return best;
    }

    const best = solve(sorted);
    frames.push({ phase: "finished", activeIds: best ? [best.a.id, best.b.id] : [], stripIds: [], best: best, finished: true, message: best ? "Ближайшая пара найдена" : "Для пары нужны хотя бы две точки" });
    return shared.deepFreeze({ points: points, best: best, frames: frames });
  }

  function boundsOf(points) {
    if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    return {
      minX: Math.min.apply(null, points.map(function (point) { return point.x; })),
      maxX: Math.max.apply(null, points.map(function (point) { return point.x; })),
      minY: Math.min.apply(null, points.map(function (point) { return point.y; })),
      maxY: Math.max.apply(null, points.map(function (point) { return point.y; })),
    };
  }

  function buildKdTree(rawPoints) {
    const points = shared.normalizePoints(rawPoints, { maxPoints: 64 });
    let nextId = 0;
    function build(sequence, depth, region) {
      if (!sequence.length) return null;
      const axis = depth % 2 === 0 ? "x" : "y";
      const sorted = sequence.slice().sort(function (left, right) {
        return left[axis] - right[axis] || left.id.localeCompare(right.id);
      });
      const middle = Math.floor(sorted.length / 2);
      const point = sorted[middle];
      const leftRegion = Object.assign({}, region);
      const rightRegion = Object.assign({}, region);
      if (axis === "x") { leftRegion.maxX = point.x; rightRegion.minX = point.x; }
      else { leftRegion.maxY = point.y; rightRegion.minY = point.y; }
      return {
        id: "k" + (++nextId), point: point, axis: axis, depth: depth, region: region,
        left: build(sorted.slice(0, middle), depth + 1, leftRegion),
        right: build(sorted.slice(middle + 1), depth + 1, rightRegion),
      };
    }
    const rawBounds = boundsOf(points);
    const margin = Math.max(1, Math.max(rawBounds.maxX - rawBounds.minX, rawBounds.maxY - rawBounds.minY) * 0.05);
    const region = { minX: rawBounds.minX - margin, maxX: rawBounds.maxX + margin, minY: rawBounds.minY - margin, maxY: rawBounds.maxY + margin };
    return shared.deepFreeze({ points: points, root: build(points, 0, region), bounds: region });
  }

  function intersectsRegion(region, query) {
    return !(region.maxX < query.minX || region.minX > query.maxX || region.maxY < query.minY || region.minY > query.maxY);
  }

  function queryContains(query, point) {
    return point.x >= query.minX && point.x <= query.maxX && point.y >= query.minY && point.y <= query.maxY;
  }

  function rangeQueryTrace(rawPoints, rawQuery) {
    const tree = buildKdTree(rawPoints);
    const query = normalizeQuery(rawQuery);
    const found = [];
    const frames = [{ phase: "ready", nodeId: null, visitedIds: [], foundIds: [], prunedIds: [], message: "kd-дерево построено чередованием осей" }];
    const visited = []; const pruned = [];
    function visit(node) {
      if (!node) return;
      if (!intersectsRegion(node.region, query)) {
        pruned.push(node.id);
        frames.push({ phase: "prune", nodeId: node.id, visitedIds: visited.slice(), foundIds: found.slice(), prunedIds: pruned.slice(), message: "Прямоугольник поддерева не пересекает запрос" });
        return;
      }
      visited.push(node.id);
      if (queryContains(query, node.point)) found.push(node.point.id);
      frames.push({ phase: queryContains(query, node.point) ? "hit" : "visit", nodeId: node.id, pointId: node.point.id, visitedIds: visited.slice(), foundIds: found.slice(), prunedIds: pruned.slice(), message: queryContains(query, node.point) ? "Точка входит в запрос" : "Точка вне запроса, но дети ещё возможны" });
      visit(node.left); visit(node.right);
    }
    visit(tree.root);
    frames.push({ phase: "finished", nodeId: null, visitedIds: visited, foundIds: found, prunedIds: pruned, finished: true, message: "Запрос завершён без просмотра отсечённых поддеревьев" });
    return shared.deepFreeze({ tree: tree, query: query, foundIds: found.slice().sort(), frames: frames });
  }

  function createState(data, options) {
    const settings = options || {};
    const mode = settings.mode || "sweep";
    if (!MODES.includes(mode)) throw new RangeError("Неизвестный режим лаборатории");
    let result;
    if (mode === "sweep") result = sweepTrace(data.segments);
    else if (mode === "closest") result = closestPairTrace(data.points);
    else result = rangeQueryTrace(data.points, data.query);
    return shared.deepFreeze({
      mode: mode,
      data: shared.deepFreeze({ points: shared.normalizePoints(data.points, { maxPoints: 48 }), segments: normalizeSegments(data.segments), query: normalizeQuery(data.query) }),
      result: result,
      playback: shared.createPlayback(result.frames),
    });
  }

  function step(state) {
    if (state.playback.finished) return state;
    return shared.deepFreeze(Object.assign({}, state, { playback: shared.stepPlayback(state.playback) }));
  }

  function seek(state, cursor) {
    return shared.deepFreeze(Object.assign({}, state, { playback: shared.seekPlayback(state.playback, cursor) }));
  }

  function visualModel(state) {
    return shared.deepFreeze({
      mode: state.mode,
      data: state.data,
      result: state.result,
      cursor: state.playback.cursor,
      frameCount: state.playback.frames.length,
      frame: state.playback.current,
      finished: state.playback.finished,
    });
  }

  return Object.freeze({
    MODES: MODES,
    PRESETS: PRESETS,
    preset: preset,
    normalizeQuery: normalizeQuery,
    normalizeSegments: normalizeSegments,
    bruteIntersections: bruteIntersections,
    sweepTrace: sweepTrace,
    bruteClosestPair: bruteClosestPair,
    closestPairTrace: closestPairTrace,
    buildKdTree: buildKdTree,
    rangeQueryTrace: rangeQueryTrace,
    createState: createState,
    step: step,
    seek: seek,
    visualModel: visualModel,
  });
});
