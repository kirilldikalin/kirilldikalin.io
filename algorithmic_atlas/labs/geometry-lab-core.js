(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasGeometryLabCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_POINTS = 64;
  const COORDINATE_LIMIT = 1000000;
  const EPSILON = 1e-9;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function boundedInteger(rawValue, label, minimum, maximum) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(
        (label || "Значение") + ": требуется целое число от " +
        minimum + " до " + maximum
      );
    }
    return value;
  }

  function normalizePoint(rawPoint, index) {
    if (!rawPoint || typeof rawPoint !== "object" || Array.isArray(rawPoint)) {
      throw new TypeError("Точка должна быть объектом с координатами x и y");
    }
    const pointIndex = index === undefined ? 0 : index;
    const id = rawPoint.id === undefined
      ? "p" + String(pointIndex + 1)
      : String(rawPoint.id).trim();
    if (!id || id.length > 48) {
      throw new RangeError("Идентификатор точки должен содержать от 1 до 48 символов");
    }
    return deepFreeze({
      id: id,
      label: rawPoint.label === undefined ? id : String(rawPoint.label).slice(0, 64),
      x: boundedInteger(rawPoint.x, "Координата x", -COORDINATE_LIMIT, COORDINATE_LIMIT),
      y: boundedInteger(rawPoint.y, "Координата y", -COORDINATE_LIMIT, COORDINATE_LIMIT),
    });
  }

  function normalizePoints(rawPoints, options) {
    const settings = options || {};
    if (!Array.isArray(rawPoints)) {
      throw new TypeError("Набор точек должен быть массивом");
    }
    const maximum = settings.maxPoints === undefined
      ? MAX_POINTS
      : boundedInteger(settings.maxPoints, "maxPoints", 1, 4096);
    if (rawPoints.length > maximum) {
      throw new RangeError("Допустимо не больше " + maximum + " точек");
    }
    const ids = new Set();
    const points = rawPoints.map(function (point, index) {
      const normalized = normalizePoint(point, index);
      if (ids.has(normalized.id)) {
        throw new RangeError("Идентификатор точки повторяется: " + normalized.id);
      }
      ids.add(normalized.id);
      return normalized;
    });
    return deepFreeze(points);
  }

  function coordinateKey(point) {
    return String(point.x) + "," + String(point.y);
  }

  function uniqueCoordinates(rawPoints) {
    const points = normalizePoints(rawPoints);
    const seen = new Set();
    return deepFreeze(points.filter(function (point) {
      const key = coordinateKey(point);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  }

  function determinant(rawA, rawB, rawC) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const c = normalizePoint(rawC, 2);
    return (BigInt(b.x) - BigInt(a.x)) * (BigInt(c.y) - BigInt(a.y)) -
      (BigInt(b.y) - BigInt(a.y)) * (BigInt(c.x) - BigInt(a.x));
  }

  function orientation(rawA, rawB, rawC) {
    const value = determinant(rawA, rawB, rawC);
    return value < 0n ? -1 : value > 0n ? 1 : 0;
  }

  function squaredDistance(rawA, rawB) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const dx = BigInt(a.x) - BigInt(b.x);
    const dy = BigInt(a.y) - BigInt(b.y);
    return dx * dx + dy * dy;
  }

  function comparePoints(left, right) {
    return left.x - right.x || left.y - right.y || left.id.localeCompare(right.id);
  }

  function between(value, left, right) {
    return value >= Math.min(left, right) && value <= Math.max(left, right);
  }

  function onSegment(rawA, rawB, rawPoint) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const point = normalizePoint(rawPoint, 2);
    return orientation(a, b, point) === 0 &&
      between(point.x, a.x, b.x) && between(point.y, a.y, b.y);
  }

  function lineIntersection(a, b, c, d) {
    const x1 = a.x; const y1 = a.y; const x2 = b.x; const y2 = b.y;
    const x3 = c.x; const y3 = c.y; const x4 = d.x; const y4 = d.y;
    const denominator = (x1 - x2) * (y3 - y4) -
      (y1 - y2) * (x3 - x4);
    if (Math.abs(denominator) <= EPSILON) return null;
    const first = x1 * y2 - y1 * x2;
    const second = x3 * y4 - y3 * x4;
    return {
      x: (first * (x3 - x4) - (x1 - x2) * second) / denominator,
      y: (first * (y3 - y4) - (y1 - y2) * second) / denominator,
    };
  }

  function segmentIntersection(rawA, rawB, rawC, rawD) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const c = normalizePoint(rawC, 2);
    const d = normalizePoint(rawD, 3);
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (o1 * o2 < 0 && o3 * o4 < 0) {
      return deepFreeze({
        type: "proper",
        point: lineIntersection(a, b, c, d),
        orientations: [o1, o2, o3, o4],
      });
    }

    const touches = [];
    if (o1 === 0 && onSegment(a, b, c)) touches.push(c);
    if (o2 === 0 && onSegment(a, b, d)) touches.push(d);
    if (o3 === 0 && onSegment(c, d, a)) touches.push(a);
    if (o4 === 0 && onSegment(c, d, b)) touches.push(b);
    const uniqueTouches = [];
    const touchKeys = new Set();
    touches.forEach(function (point) {
      const key = coordinateKey(point);
      if (!touchKeys.has(key)) {
        touchKeys.add(key);
        uniqueTouches.push({ x: point.x, y: point.y });
      }
    });
    if (uniqueTouches.length === 1) {
      return deepFreeze({
        type: "touch",
        point: uniqueTouches[0],
        orientations: [o1, o2, o3, o4],
      });
    }
    if (uniqueTouches.length >= 2) {
      uniqueTouches.sort(function (left, right) {
        return left.x - right.x || left.y - right.y;
      });
      return deepFreeze({
        type: "overlap",
        segment: [uniqueTouches[0], uniqueTouches[uniqueTouches.length - 1]],
        orientations: [o1, o2, o3, o4],
      });
    }
    return deepFreeze({ type: "none", orientations: [o1, o2, o3, o4] });
  }

  function convexHull(rawPoints, includeCollinear) {
    const points = uniqueCoordinates(rawPoints).slice().sort(comparePoints);
    if (points.length <= 1) return deepFreeze(points);
    if (includeCollinear && points.every(function (point) {
      return orientation(points[0], points[points.length - 1], point) === 0;
    })) {
      return deepFreeze(points);
    }
    const shouldPop = includeCollinear
      ? function (turn) { return turn < 0; }
      : function (turn) { return turn <= 0; };
    function half(sequence) {
      const stack = [];
      sequence.forEach(function (point) {
        while (stack.length >= 2 && shouldPop(orientation(
          stack[stack.length - 2], stack[stack.length - 1], point
        ))) {
          stack.pop();
        }
        stack.push(point);
      });
      return stack;
    }
    const lower = half(points);
    const upper = half(points.slice().reverse());
    lower.pop(); upper.pop();
    const hull = lower.concat(upper);
    if (!hull.length && points.length) return deepFreeze([points[0]]);
    return deepFreeze(hull);
  }

  function polygonArea2(rawPoints) {
    const points = normalizePoints(rawPoints);
    let area = 0n;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      area += BigInt(points[index].x) * BigInt(next.y) -
        BigInt(points[index].y) * BigInt(next.x);
    }
    return area;
  }

  function circumcircle(rawA, rawB, rawC) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const c = normalizePoint(rawC, 2);
    const divisor = 2 * (
      a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)
    );
    if (Math.abs(divisor) <= EPSILON) return null;
    const aa = a.x * a.x + a.y * a.y;
    const bb = b.x * b.x + b.y * b.y;
    const cc = c.x * c.x + c.y * c.y;
    const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / divisor;
    const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / divisor;
    return deepFreeze({
      x: x,
      y: y,
      radiusSquared: (x - a.x) * (x - a.x) + (y - a.y) * (y - a.y),
    });
  }

  function inCircleDeterminant(rawA, rawB, rawC, rawPoint) {
    const a = normalizePoint(rawA, 0);
    const b = normalizePoint(rawB, 1);
    const c = normalizePoint(rawC, 2);
    const point = normalizePoint(rawPoint, 3);
    function shifted(candidate) {
      const x = BigInt(candidate.x) - BigInt(point.x);
      const y = BigInt(candidate.y) - BigInt(point.y);
      return { x: x, y: y, q: x * x + y * y };
    }
    const p = shifted(a); const q = shifted(b); const r = shifted(c);
    const value =
      p.x * (q.y * r.q - q.q * r.y) -
      p.y * (q.x * r.q - q.q * r.x) +
      p.q * (q.x * r.y - q.y * r.x);
    return orientation(a, b, c) >= 0 ? value : -value;
  }

  function inCircle(rawA, rawB, rawC, rawPoint) {
    const value = inCircleDeterminant(rawA, rawB, rawC, rawPoint);
    return value < 0n ? -1 : value > 0n ? 1 : 0;
  }

  function clipPolygonHalfPlane(rawPolygon, nx, ny, limit) {
    if (!Array.isArray(rawPolygon)) throw new TypeError("Полигон должен быть массивом");
    if (![nx, ny, limit].every(Number.isFinite)) {
      throw new RangeError("Полуплоскость должна задаваться конечными числами");
    }
    const polygon = rawPolygon.map(function (point) {
      return { x: Number(point.x), y: Number(point.y) };
    });
    if (!polygon.length) return [];
    const result = [];
    function value(point) { return nx * point.x + ny * point.y - limit; }
    function intersection(left, right, leftValue, rightValue) {
      const denominator = leftValue - rightValue;
      const ratio = Math.abs(denominator) <= EPSILON ? 0 : leftValue / denominator;
      return {
        x: left.x + ratio * (right.x - left.x),
        y: left.y + ratio * (right.y - left.y),
      };
    }
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const currentValue = value(current);
      const nextValue = value(next);
      const currentInside = currentValue <= EPSILON;
      const nextInside = nextValue <= EPSILON;
      if (currentInside) result.push(current);
      if (currentInside !== nextInside) {
        result.push(intersection(current, next, currentValue, nextValue));
      }
    }
    return result;
  }

  function createPlayback(rawFrames) {
    if (!Array.isArray(rawFrames) || rawFrames.length === 0 || rawFrames.length > 4096) {
      throw new RangeError("Трасса должна содержать от 1 до 4096 кадров");
    }
    const frames = rawFrames.map(function (frame, index) {
      return Object.assign({ index: index, finished: index === rawFrames.length - 1 }, frame);
    });
    return deepFreeze({
      frames: frames,
      cursor: 0,
      current: frames[0],
      finished: frames.length === 1,
    });
  }

  function seekPlayback(rawPlayback, rawCursor) {
    if (!rawPlayback || !Array.isArray(rawPlayback.frames)) {
      throw new TypeError("Ожидалась трасса воспроизведения");
    }
    const cursor = boundedInteger(rawCursor, "Кадр", 0, rawPlayback.frames.length - 1);
    return deepFreeze({
      frames: rawPlayback.frames,
      cursor: cursor,
      current: rawPlayback.frames[cursor],
      finished: cursor === rawPlayback.frames.length - 1,
    });
  }

  function stepPlayback(playback) {
    if (playback.finished) return playback;
    return seekPlayback(playback, playback.cursor + 1);
  }

  return Object.freeze({
    MAX_POINTS: MAX_POINTS,
    COORDINATE_LIMIT: COORDINATE_LIMIT,
    EPSILON: EPSILON,
    deepFreeze: deepFreeze,
    boundedInteger: boundedInteger,
    normalizePoint: normalizePoint,
    normalizePoints: normalizePoints,
    uniqueCoordinates: uniqueCoordinates,
    determinant: determinant,
    orientation: orientation,
    squaredDistance: squaredDistance,
    onSegment: onSegment,
    segmentIntersection: segmentIntersection,
    convexHull: convexHull,
    polygonArea2: polygonArea2,
    circumcircle: circumcircle,
    inCircleDeterminant: inCircleDeterminant,
    inCircle: inCircle,
    clipPolygonHalfPlane: clipPolygonHalfPlane,
    createPlayback: createPlayback,
    seekPlayback: seekPlayback,
    stepPlayback: stepPlayback,
  });
});
