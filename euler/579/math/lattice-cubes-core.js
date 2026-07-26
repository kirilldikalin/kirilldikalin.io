(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Euler579Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function gcdPair(left, right) {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  }

  function gcdValues(values) {
    return values.reduce((result, value) => gcdPair(result, value), 0);
  }

  function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  function cross(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
  }

  function add(left, right) {
    return left.map((value, index) => value + right[index]);
  }

  function scale(vector, factor) {
    return vector.map((value) => value * factor);
  }

  function squaredNorm(vector) {
    return dot(vector, vector);
  }

  function integerSquareRoot(value) {
    if (value < 0) throw new RangeError("square root of a negative integer");
    const root = Math.floor(Math.sqrt(value));
    if (root * root === value) return root;
    if ((root + 1) * (root + 1) === value) return root + 1;
    return null;
  }

  function edgeLength(edges) {
    const length = integerSquareRoot(squaredNorm(edges[0]));
    if (length === null) throw new Error("edge length is not integral");
    return length;
  }

  function validateEdges(edges) {
    if (!Array.isArray(edges) || edges.length !== 3) return false;
    const norms = edges.map(squaredNorm);
    if (norms[0] === 0 || norms.some((value) => value !== norms[0])) return false;
    if (dot(edges[0], edges[1]) !== 0) return false;
    if (dot(edges[0], edges[2]) !== 0) return false;
    if (dot(edges[1], edges[2]) !== 0) return false;
    return integerSquareRoot(norms[0]) !== null;
  }

  function verticesFromEdges(edges) {
    const vertices = [];
    for (let mask = 0; mask < 8; mask += 1) {
      let vertex = [0, 0, 0];
      for (let edge = 0; edge < 3; edge += 1) {
        if (mask & (1 << edge)) vertex = add(vertex, edges[edge]);
      }
      vertices.push(vertex);
    }
    return vertices;
  }

  function normalizeVertices(vertices) {
    const minima = [0, 1, 2].map((coordinate) =>
      Math.min(...vertices.map((vertex) => vertex[coordinate]))
    );
    return vertices
      .map((vertex) => vertex.map((value, coordinate) => value - minima[coordinate]))
      .sort((left, right) => {
        for (let coordinate = 0; coordinate < 3; coordinate += 1) {
          if (left[coordinate] !== right[coordinate]) {
            return left[coordinate] - right[coordinate];
          }
        }
        return 0;
      });
  }

  function canonicalKey(edges) {
    return normalizeVertices(verticesFromEdges(edges))
      .map((vertex) => vertex.join(","))
      .join(";");
  }

  function coordinateSpans(edges) {
    const vertices = verticesFromEdges(edges);
    return [0, 1, 2].map((coordinate) => {
      const values = vertices.map((vertex) => vertex[coordinate]);
      return Math.max(...values) - Math.min(...values);
    });
  }

  function componentSpanSums(edges) {
    return [0, 1, 2].map((coordinate) =>
      edges.reduce((sum, edge) => sum + Math.abs(edge[coordinate]), 0)
    );
  }

  function pointCount(edges) {
    if (!validateEdges(edges)) throw new Error("invalid cube edges");
    const length = edgeLength(edges);
    const edgeGcdSum = edges.reduce((sum, edge) => sum + gcdValues(edge), 0);
    return length ** 3 + (length + 1) * edgeGcdSum + 1;
  }

  function placementCount(edges, boxSize) {
    const spans = coordinateSpans(edges);
    return spans.reduce((product, span) =>
      product * Math.max(0, boxSize - span + 1), 1
    );
  }

  function primitiveScale(edges) {
    return gcdValues(edges.flat());
  }

  function quaternionNorm(quaternion) {
    return quaternion.reduce((sum, value) => sum + value * value, 0);
  }

  function quaternionDivisor(quaternion) {
    if (gcdValues(quaternion) !== 1) {
      throw new Error("quaternion must be primitive");
    }
    const oddCount = quaternion.filter((value) => Math.abs(value) % 2 === 1).length;
    if (oddCount === 4) return 4;
    if (oddCount === 2) return 2;
    if (oddCount === 1 || oddCount === 3) return 1;
    throw new Error("primitive quaternion has an impossible parity pattern");
  }

  function eulerRodriguesMatrix(quaternion) {
    const [a, b, c, d] = quaternion;
    return [
      [
        a * a + b * b - c * c - d * d,
        2 * (b * c - a * d),
        2 * (b * d + a * c),
      ],
      [
        2 * (b * c + a * d),
        a * a - b * b + c * c - d * d,
        2 * (c * d - a * b),
      ],
      [
        2 * (b * d - a * c),
        2 * (c * d + a * b),
        a * a - b * b - c * c + d * d,
      ],
    ];
  }

  function edgesFromQuaternion(quaternion) {
    const divisor = quaternionDivisor(quaternion);
    const raw = eulerRodriguesMatrix(quaternion);
    const edges = raw.map((row) => row.map((value) => value / divisor));
    if (edges.some((row) => row.some((value) => !Number.isInteger(value)))) {
      throw new Error("normalizing divisor does not divide the matrix");
    }
    const length = quaternionNorm(quaternion) / divisor;
    if (!Number.isInteger(length) || edgeLength(edges) !== length) {
      throw new Error("quaternion length normalization failed");
    }
    return { divisor, edges, length };
  }

  function firstNonZeroPositive(values) {
    const first = values.find((value) => value !== 0);
    return first === undefined || first > 0;
  }

  function orientationRecord(edges) {
    if (!validateEdges(edges)) throw new Error("invalid orientation");
    return {
      key: canonicalKey(edges),
      edges,
      length: edgeLength(edges),
      spans: coordinateSpans(edges),
      pointCount: pointCount(edges),
    };
  }

  function enumerateQuaternionOrientations(maxLength) {
    const records = new Map();
    const coordinateBound = Math.ceil(Math.sqrt(4 * maxLength));
    for (let a = -coordinateBound; a <= coordinateBound; a += 1) {
      for (let b = -coordinateBound; b <= coordinateBound; b += 1) {
        for (let c = -coordinateBound; c <= coordinateBound; c += 1) {
          for (let d = -coordinateBound; d <= coordinateBound; d += 1) {
            const quaternion = [a, b, c, d];
            if (!firstNonZeroPositive(quaternion)) continue;
            if (gcdValues(quaternion) !== 1) continue;
            const norm = quaternionNorm(quaternion);
            if (norm === 0 || norm > 4 * maxLength) continue;
            const generated = edgesFromQuaternion(quaternion);
            if (generated.length > maxLength) continue;
            if (primitiveScale(generated.edges) !== 1) continue;
            const record = orientationRecord(generated.edges);
            records.set(record.key, record);
          }
        }
      }
    }
    return [...records.values()].sort((left, right) =>
      left.length - right.length || left.key.localeCompare(right.key)
    );
  }

  function vectorsOfLength(length) {
    const target = length * length;
    const vectors = [];
    for (let x = -length; x <= length; x += 1) {
      for (let y = -length; y <= length; y += 1) {
        for (let z = -length; z <= length; z += 1) {
          const vector = [x, y, z];
          if (squaredNorm(vector) === target) vectors.push(vector);
        }
      }
    }
    return vectors;
  }

  function enumerateDirectOrientations(maxLength) {
    const records = new Map();
    for (let length = 1; length <= maxLength; length += 1) {
      const vectors = vectorsOfLength(length);
      for (const u of vectors) {
        for (const v of vectors) {
          if (dot(u, v) !== 0) continue;
          const rawW = cross(u, v);
          if (rawW.some((value) => value % length !== 0)) continue;
          const w = rawW.map((value) => value / length);
          const edges = [u, v, w];
          if (!validateEdges(edges) || primitiveScale(edges) !== 1) continue;
          const record = orientationRecord(edges);
          records.set(record.key, record);
        }
      }
    }
    return [...records.values()].sort((left, right) =>
      left.length - right.length || left.key.localeCompare(right.key)
    );
  }

  function cubeTotals(boxSize, orientations) {
    let cubeCount = 0;
    let pointSum = 0;
    for (const orientation of orientations) {
      for (let factor = 1; ; factor += 1) {
        const edges = orientation.edges.map((edge) => scale(edge, factor));
        const placements = placementCount(edges, boxSize);
        if (placements === 0) break;
        cubeCount += placements;
        pointSum += placements * pointCount(edges);
      }
    }
    return { n: boxSize, C: cubeCount, S: pointSum };
  }

  return {
    add,
    canonicalKey,
    componentSpanSums,
    coordinateSpans,
    cross,
    cubeTotals,
    dot,
    edgeLength,
    edgesFromQuaternion,
    enumerateDirectOrientations,
    enumerateQuaternionOrientations,
    eulerRodriguesMatrix,
    gcdPair,
    gcdValues,
    integerSquareRoot,
    orientationRecord,
    placementCount,
    pointCount,
    primitiveScale,
    quaternionDivisor,
    quaternionNorm,
    scale,
    squaredNorm,
    validateEdges,
    verticesFromEdges,
    vectorsOfLength,
  };
});
