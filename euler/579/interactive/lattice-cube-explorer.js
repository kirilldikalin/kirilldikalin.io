(function () {
  "use strict";

  const core = window.Euler579Core;
  const canvas = document.querySelector("#e579-canvas");
  const context = canvas.getContext("2d");
  const baseEdges = {
    axis: [
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ],
    tilted: [
      [1, 2, 2],
      [2, -2, 1],
      [2, 1, -2],
    ],
  };
  const cubeEdges = [];
  for (let mask = 0; mask < 8; mask += 1) {
    for (let bit = 0; bit < 3; bit += 1) {
      const next = mask ^ (1 << bit);
      if (mask < next) cubeEdges.push([mask, next]);
    }
  }
  const cubeFaces = [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ];
  const pointColors = {
    vertex: "#232326",
    edge: "#60646b",
    face: "#9a9da4",
    interior: "#a63f36",
  };
  let cubeType = "axis";
  let mode = "vertices";
  let yaw = -0.72;
  let pitch = 0.55;
  let pointer = null;
  let model = null;

  function add(left, right) {
    return left.map((value, index) => value + right[index]);
  }

  function subtract(left, right) {
    return left.map((value, index) => value - right[index]);
  }

  function translate(points, offset) {
    return points.map((point) => add(point, offset));
  }

  function boxVertices(size) {
    return core.verticesFromEdges([
      [size, 0, 0],
      [0, size, 0],
      [0, 0, size],
    ]);
  }

  function formatVector(vector) {
    return `(${vector.join(", ")})`;
  }

  function project(point, width, height, boxSize) {
    const center = boxSize / 2;
    const x = point[0] - center;
    const y = point[1] - center;
    const z = point[2] - center;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const rotatedX = x * cosYaw + z * sinYaw;
    const rotatedZ = -x * sinYaw + z * cosYaw;
    const rotatedY = y * cosPitch - rotatedZ * sinPitch;
    const depth = y * sinPitch + rotatedZ * cosPitch;
    const camera = Math.max(12, boxSize * 2.8);
    const perspective = camera / (camera - depth);
    const unit = Math.min(width, height) * 0.68 / Math.max(boxSize, 1);
    return {
      x: width / 2 + rotatedX * unit * perspective,
      y: height / 2 - rotatedY * unit * perspective,
      depth,
      perspective,
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function strokeSegments(projected, segments, style, width, dash = []) {
    context.save();
    context.strokeStyle = style;
    context.lineWidth = width;
    context.setLineDash(dash);
    for (const [left, right] of segments) {
      context.beginPath();
      context.moveTo(projected[left].x, projected[left].y);
      context.lineTo(projected[right].x, projected[right].y);
      context.stroke();
    }
    context.restore();
  }

  function fillFaces(projected, alpha) {
    const faces = cubeFaces.map((face) => ({
      face,
      depth: face.reduce((sum, index) => sum + projected[index].depth, 0) / face.length,
    })).sort((left, right) => left.depth - right.depth);

    context.save();
    for (const { face, depth } of faces) {
      const shade = Math.max(190, Math.min(235, Math.round(218 + depth * 2)));
      context.beginPath();
      context.moveTo(projected[face[0]].x, projected[face[0]].y);
      for (let index = 1; index < face.length; index += 1) {
        context.lineTo(projected[face[index]].x, projected[face[index]].y);
      }
      context.closePath();
      context.fillStyle = `rgba(${shade}, ${shade}, ${shade + 2}, ${alpha})`;
      context.fill();
    }
    context.restore();
  }

  function drawPoints(width, height) {
    let selected = [];
    if (mode === "all") {
      selected = model.points;
    } else if (mode === "interior") {
      selected = model.points.filter(({ kind }) => kind === "interior");
    } else if (mode === "vertices") {
      selected = model.points.filter(({ kind }) => kind === "vertex");
    }

    const projected = selected.map((entry) => ({
      ...entry,
      projected: project(entry.point, width, height, model.boxSize),
    })).sort((left, right) => left.projected.depth - right.projected.depth);

    for (const entry of projected) {
      const radius = (entry.kind === "vertex" ? 5.2 : 3.2) * entry.projected.perspective;
      context.beginPath();
      context.arc(entry.projected.x, entry.projected.y, Math.max(1.7, radius), 0, Math.PI * 2);
      context.fillStyle = pointColors[entry.kind];
      context.fill();
      if (entry.kind === "vertex") {
        context.strokeStyle = "#fff";
        context.lineWidth = 1;
        context.stroke();
      }
    }
  }

  function render() {
    if (!model) return;
    const { width, height } = resizeCanvas();
    context.clearRect(0, 0, width, height);

    const projectedBox = model.boxVertices.map((point) =>
      project(point, width, height, model.boxSize)
    );
    const projectedCube = model.vertices.map((point) =>
      project(point, width, height, model.boxSize)
    );

    strokeSegments(projectedBox, cubeEdges, "rgba(80, 80, 86, 0.25)", 1.2, [5, 5]);

    if (mode === "faces") fillFaces(projectedCube, 0.58);
    if (mode === "all") fillFaces(projectedCube, 0.12);
    if (mode === "interior") fillFaces(projectedCube, 0.08);

    const cubeStroke = mode === "edges" || mode === "faces"
      ? "#303033"
      : "rgba(48, 48, 51, 0.68)";
    const cubeWidth = mode === "edges" ? 3 : 1.8;
    strokeSegments(projectedCube, cubeEdges, cubeStroke, cubeWidth);
    drawPoints(width, height);
  }

  function updateMetrics() {
    const { edges, length, spans, placements, pointCount, breakdown } = model;
    document.querySelector("[data-e579-vectors]").innerHTML =
      edges.map((edge, index) => `${["u", "v", "w"][index]}=${formatVector(edge)}`).join("<br>");
    document.querySelector("[data-e579-dots]").textContent =
      `u·v=${core.dot(edges[0], edges[1])}, u·w=${core.dot(edges[0], edges[2])}, v·w=${core.dot(edges[1], edges[2])}`;
    document.querySelector("[data-e579-length]").textContent =
      `L = ${length}, L² = ${core.squaredNorm(edges[0])}`;
    document.querySelector("[data-e579-gcd]").textContent =
      edges.map((edge) => core.gcdValues(edge)).join(", ");
    document.querySelector("[data-e579-spans]").textContent =
      `(Δx, Δy, Δz) = (${spans.join(", ")})`;
    document.querySelector("[data-e579-placements]").textContent =
      String(placements);
    document.querySelector("[data-e579-points]").textContent =
      `${pointCount} (перечислено ${model.points.length})`;
    document.querySelector("[data-e579-breakdown]").textContent =
      `вершины ${breakdown.vertex}, рёбра ${breakdown.edge}, грани ${breakdown.face}, внутри ${breakdown.interior}`;
    document.querySelector("[data-e579-detail]").textContent =
      cubeType === "axis"
        ? `В осевом кубе длины ${length} решётчатых точек ${pointCount}: НОД каждого ребра равен длине, поэтому грани и рёбра богаты узлами решётки.`
        : `В наклонном кубе длины ${length} решётчатых точек ${pointCount}: при том же объёме НОД каждого базового ребра равен масштабу ${Number(document.querySelector("#e579-scale").value)}.`;
    document.querySelector("[data-e579-legend]").hidden = mode !== "all";
  }

  function rebuildModel() {
    const factor = Number(document.querySelector("#e579-scale").value);
    const edges = baseEdges[cubeType].map((edge) => core.scale(edge, factor));
    const spans = core.coordinateSpans(edges);
    const boxInput = document.querySelector("#e579-box");
    const minimumBox = Math.max(...spans);
    boxInput.min = minimumBox;
    if (Number(boxInput.value) < minimumBox) boxInput.value = minimumBox;
    const boxSize = Number(boxInput.value);
    const rawVertices = core.verticesFromEdges(edges);
    const minima = [0, 1, 2].map((coordinate) =>
      Math.min(...rawVertices.map((vertex) => vertex[coordinate]))
    );
    const offset = spans.map((span, coordinate) =>
      Math.floor((boxSize - span) / 2) - minima[coordinate]
    );
    const rawPoints = core.latticePoints(edges);
    const points = rawPoints.map((entry) => ({
      ...entry,
      point: add(entry.point, offset),
    }));
    const breakdown = {
      vertex: 0,
      edge: 0,
      face: 0,
      interior: 0,
    };
    points.forEach(({ kind }) => {
      breakdown[kind] += 1;
    });

    model = {
      boxSize,
      boxVertices: boxVertices(boxSize),
      edges,
      length: core.edgeLength(edges),
      vertices: translate(rawVertices, offset),
      points,
      spans,
      placements: core.placementCount(edges, boxSize),
      pointCount: core.pointCount(edges),
      breakdown,
    };
    document.querySelector("[data-e579-scale-value]").textContent = factor;
    document.querySelector("[data-e579-box-value]").textContent = boxSize;
    updateMetrics();
    render();
  }

  document.querySelectorAll("[data-e579-cube]").forEach((button) => {
    button.addEventListener("click", () => {
      cubeType = button.dataset.e579Cube;
      document.querySelectorAll("[data-e579-cube]").forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
      });
      rebuildModel();
    });
  });

  document.querySelectorAll("[data-e579-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.e579Mode;
      document.querySelectorAll("[data-e579-mode]").forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
      });
      document.querySelector("[data-e579-legend]").hidden = mode !== "all";
      render();
    });
  });

  document.querySelector("#e579-scale").addEventListener("input", rebuildModel);
  document.querySelector("#e579-box").addEventListener("input", rebuildModel);

  canvas.addEventListener("pointerdown", (event) => {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw += (event.clientX - pointer.x) * 0.012;
    pitch = Math.max(-1.35, Math.min(1.35, pitch + (event.clientY - pointer.y) * 0.012));
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    render();
  });
  function releasePointer(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
    canvas.classList.remove("is-dragging");
  }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  canvas.addEventListener("keydown", (event) => {
    const rotations = {
      ArrowLeft: [-0.12, 0],
      ArrowRight: [0.12, 0],
      ArrowUp: [0, -0.12],
      ArrowDown: [0, 0.12],
    };
    if (rotations[event.key]) {
      event.preventDefault();
      yaw += rotations[event.key][0];
      pitch = Math.max(-1.35, Math.min(1.35, pitch + rotations[event.key][1]));
      render();
    } else if (event.key.toLowerCase() === "r") {
      yaw = -0.72;
      pitch = 0.55;
      render();
    }
  });

  window.addEventListener("resize", render);
  rebuildModel();
})();
