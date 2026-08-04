(function (root, factory) {
  "use strict";

  const shared = typeof module === "object" && module.exports
    ? require("./geometry-lab-core.js")
    : root.AtlasGeometryLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GeometricPredicatesConvexHullCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  if (!shared) throw new Error("AtlasGeometryLabCore is unavailable");

  const ALGORITHMS = Object.freeze(["andrew", "graham", "jarvis"]);
  const PRESETS = shared.deepFreeze({
    cloud: [
      { id: "A", x: -7, y: -3 }, { id: "B", x: -5, y: 4 },
      { id: "C", x: -2, y: 1 }, { id: "D", x: 0, y: 6 },
      { id: "E", x: 3, y: 2 }, { id: "F", x: 7, y: 4 },
      { id: "G", x: 8, y: -3 }, { id: "H", x: 2, y: -5 },
      { id: "I", x: -2, y: -4 }, { id: "J", x: 1, y: 0 },
    ],
    collinear: [
      { id: "A", x: -7, y: -4 }, { id: "B", x: -4, y: -2 },
      { id: "C", x: -1, y: 0 }, { id: "D", x: 2, y: 2 },
      { id: "E", x: 5, y: 4 }, { id: "F", x: 1, y: -4 },
      { id: "G", x: -3, y: 4 },
    ],
    intersections: [
      { id: "A", x: -7, y: -4 }, { id: "B", x: 7, y: 4 },
      { id: "C", x: -6, y: 5 }, { id: "D", x: 6, y: -5 },
      { id: "E", x: -2, y: -1 }, { id: "F", x: 5, y: -1 },
      { id: "G", x: 1, y: -1 }, { id: "H", x: 8, y: -1 },
    ],
    duplicates: [
      { id: "A", x: -6, y: -3 }, { id: "B", x: -6, y: -3 },
      { id: "C", x: -2, y: 4 }, { id: "D", x: 4, y: 5 },
      { id: "E", x: 7, y: -2 }, { id: "F", x: 1, y: -5 },
      { id: "G", x: 0, y: 0 },
    ],
  });

  function preset(name) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
      throw new RangeError("Неизвестный геометрический пример");
    }
    return shared.normalizePoints(PRESETS[name]);
  }

  function pointMap(points) {
    return new Map(points.map(function (point) { return [point.id, point]; }));
  }

  function frame(message, values) {
    return Object.assign({
      phase: "inspect",
      message: message,
      activeIds: [],
      candidateIds: [],
      rejectedIds: [],
      hullIds: [],
      determinant: null,
    }, values || {});
  }

  function andrewTrace(rawPoints) {
    const points = shared.uniqueCoordinates(rawPoints).slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    const frames = [frame("Точки упорядочены лексикографически по x, затем по y", {
      phase: "sorted", candidateIds: points.map(function (point) { return point.id; }),
    })];
    if (points.length <= 1) {
      frames.push(frame("Оболочка совпадает с единственной точкой", {
        phase: "finished", hullIds: points.map(function (point) { return point.id; }), finished: true,
      }));
      return frames;
    }
    function build(sequence, side) {
      const stack = [];
      sequence.forEach(function (point) {
        frames.push(frame("Рассматриваем точку " + point.id + " для " + side + " цепи", {
          phase: "inspect", activeIds: [point.id], hullIds: stack.map(function (item) { return item.id; }),
        }));
        while (stack.length >= 2) {
          const a = stack[stack.length - 2];
          const b = stack[stack.length - 1];
          const value = shared.determinant(a, b, point);
          if (value > 0n) break;
          const removed = stack.pop();
          frames.push(frame("Поворот не левый: " + removed.id + " удаляется из " + side + " цепи", {
            phase: "pop", activeIds: [a.id, b.id, point.id], rejectedIds: [removed.id],
            hullIds: stack.map(function (item) { return item.id; }), determinant: value,
          }));
        }
        stack.push(point);
        frames.push(frame("Точка " + point.id + " добавлена в " + side + " цепь", {
          phase: "push", activeIds: [point.id], hullIds: stack.map(function (item) { return item.id; }),
        }));
      });
      return stack;
    }
    const lower = build(points, "нижнюю");
    const upper = build(points.slice().reverse(), "верхнюю");
    lower.pop(); upper.pop();
    const hullIds = lower.concat(upper).map(function (point) { return point.id; });
    frames.push(frame("Нижняя и верхняя цепи образовали выпуклую оболочку", {
      phase: "finished", hullIds: hullIds, finished: true,
    }));
    return frames;
  }

  function grahamTrace(rawPoints) {
    const points = shared.uniqueCoordinates(rawPoints).slice();
    const frames = [];
    if (points.length <= 1) return andrewTrace(points);
    points.sort(function (left, right) {
      return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
    });
    const pivot = points[0];
    const ordered = points.slice(1).sort(function (left, right) {
      const turn = shared.orientation(pivot, left, right);
      if (turn !== 0) return -turn;
      const leftDistance = shared.squaredDistance(pivot, left);
      const rightDistance = shared.squaredDistance(pivot, right);
      return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 : left.id.localeCompare(right.id);
    });
    frames.push(frame("Выбрана нижняя опорная точка " + pivot.id + ", остальные упорядочены по полярному углу", {
      phase: "sorted", activeIds: [pivot.id], candidateIds: ordered.map(function (point) { return point.id; }),
    }));
    const stack = [pivot];
    ordered.forEach(function (point) {
      while (stack.length >= 2) {
        const a = stack[stack.length - 2]; const b = stack[stack.length - 1];
        const value = shared.determinant(a, b, point);
        if (value > 0n) break;
        const removed = stack.pop();
        frames.push(frame("Правый поворот или коллинеарность: " + removed.id + " удаляется", {
          phase: "pop", activeIds: [a.id, b.id, point.id], rejectedIds: [removed.id],
          hullIds: stack.map(function (item) { return item.id; }), determinant: value,
        }));
      }
      stack.push(point);
      frames.push(frame("Стек Грэхема принимает точку " + point.id, {
        phase: "push", activeIds: [point.id], hullIds: stack.map(function (item) { return item.id; }),
      }));
    });
    frames.push(frame("Стек содержит вершины оболочки в циклическом порядке", {
      phase: "finished", hullIds: stack.map(function (point) { return point.id; }), finished: true,
    }));
    return frames;
  }

  function jarvisTrace(rawPoints) {
    const points = shared.uniqueCoordinates(rawPoints).slice().sort(function (left, right) {
      return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
    });
    if (points.length <= 1) return andrewTrace(points);
    const frames = [frame("Марш Джарвиса начинает с самой левой точки " + points[0].id, {
      phase: "start", activeIds: [points[0].id],
    })];
    const hull = [];
    let current = points[0];
    let guard = 0;
    do {
      hull.push(current);
      let candidate = points.find(function (point) { return point.id !== current.id; });
      points.forEach(function (point) {
        if (point.id === current.id || point.id === candidate.id) return;
        const turn = shared.orientation(current, candidate, point);
        const farther = turn === 0 &&
          shared.squaredDistance(current, point) > shared.squaredDistance(current, candidate);
        frames.push(frame("Сравниваем направление на " + candidate.id + " с направлением на " + point.id, {
          phase: "compare", activeIds: [current.id], candidateIds: [candidate.id, point.id],
          hullIds: hull.map(function (item) { return item.id; }), determinant: shared.determinant(current, candidate, point),
        }));
        if (turn < 0 || farther) candidate = point;
      });
      frames.push(frame("Следующее опорное ребро ведёт из " + current.id + " в " + candidate.id, {
        phase: "edge", activeIds: [current.id, candidate.id],
        hullIds: hull.map(function (item) { return item.id; }).concat(candidate.id),
      }));
      current = candidate;
      guard += 1;
      if (guard > points.length + 1) throw new Error("Марш Джарвиса превысил безопасный предел");
    } while (current.id !== hull[0].id);
    frames.push(frame("Обход вернулся в стартовую вершину: оболочка замкнута", {
      phase: "finished", hullIds: hull.map(function (point) { return point.id; }), finished: true,
    }));
    return frames;
  }

  function buildTrace(rawPoints, algorithm) {
    if (!ALGORITHMS.includes(algorithm)) throw new RangeError("Неизвестный алгоритм оболочки");
    const points = shared.normalizePoints(rawPoints, { maxPoints: 24 });
    const frames = algorithm === "andrew"
      ? andrewTrace(points)
      : algorithm === "graham" ? grahamTrace(points) : jarvisTrace(points);
    return shared.deepFreeze({ points: points, algorithm: algorithm, frames: frames });
  }

  function createState(rawPoints, options) {
    const settings = options || {};
    const trace = buildTrace(rawPoints, settings.algorithm || "andrew");
    return shared.deepFreeze({
      points: trace.points,
      algorithm: trace.algorithm,
      playback: shared.createPlayback(trace.frames),
    });
  }

  function step(state) {
    if (state.playback.finished) return state;
    return shared.deepFreeze(Object.assign({}, state, {
      playback: shared.stepPlayback(state.playback),
    }));
  }

  function seek(state, cursor) {
    return shared.deepFreeze(Object.assign({}, state, {
      playback: shared.seekPlayback(state.playback, cursor),
    }));
  }

  function movePoint(rawPoints, id, rawX, rawY) {
    const points = shared.normalizePoints(rawPoints, { maxPoints: 24 });
    if (!points.some(function (point) { return point.id === id; })) {
      throw new RangeError("Неизвестная перемещаемая точка");
    }
    return shared.normalizePoints(points.map(function (point) {
      return point.id === id
        ? { id: point.id, label: point.label, x: rawX, y: rawY }
        : point;
    }), { maxPoints: 24 });
  }

  function predicateModel(rawPoints) {
    const points = shared.normalizePoints(rawPoints, { maxPoints: 24 });
    const triple = points.slice(0, 3);
    const segments = points.length >= 4 ? [points.slice(0, 2), points.slice(2, 4)] : [];
    return shared.deepFreeze({
      triple: triple,
      determinant: triple.length === 3 ? shared.determinant(triple[0], triple[1], triple[2]) : null,
      orientation: triple.length === 3 ? shared.orientation(triple[0], triple[1], triple[2]) : null,
      segments: segments,
      intersection: segments.length === 2
        ? shared.segmentIntersection(segments[0][0], segments[0][1], segments[1][0], segments[1][1])
        : null,
    });
  }

  function visualModel(state) {
    const byId = pointMap(state.points);
    const current = state.playback.current;
    return shared.deepFreeze({
      points: state.points,
      algorithm: state.algorithm,
      cursor: state.playback.cursor,
      frameCount: state.playback.frames.length,
      finished: state.playback.finished,
      frame: current,
      hull: current.hullIds.map(function (id) { return byId.get(id); }).filter(Boolean),
      predicates: predicateModel(state.points),
    });
  }

  return Object.freeze({
    ALGORITHMS: ALGORITHMS,
    PRESETS: PRESETS,
    preset: preset,
    andrewTrace: andrewTrace,
    grahamTrace: grahamTrace,
    jarvisTrace: jarvisTrace,
    buildTrace: buildTrace,
    createState: createState,
    step: step,
    seek: seek,
    movePoint: movePoint,
    predicateModel: predicateModel,
    visualModel: visualModel,
  });
});
