(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasGeometryLabRuntime = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULT_WIDTH = 920;
  const DEFAULT_HEIGHT = 560;

  function finite(rawValue, fallback) {
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : fallback;
  }

  function boundsForPoints(rawPoints, margin) {
    const points = Array.isArray(rawPoints) ? rawPoints : [];
    const padding = Math.max(1, finite(margin, 2));
    if (!points.length) {
      return Object.freeze({ minX: -10, maxX: 10, minY: -7, maxY: 7 });
    }
    const xs = points.map(function (point) { return Number(point.x); });
    const ys = points.map(function (point) { return Number(point.y); });
    let minX = Math.min.apply(null, xs);
    let maxX = Math.max.apply(null, xs);
    let minY = Math.min.apply(null, ys);
    let maxY = Math.max.apply(null, ys);
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const span = Math.max(maxX - minX, maxY - minY);
    const extra = Math.max(padding, span * 0.12);
    return Object.freeze({
      minX: minX - extra,
      maxX: maxX + extra,
      minY: minY - extra,
      maxY: maxY + extra,
    });
  }

  function normalizeBounds(rawBounds) {
    const source = rawBounds || {};
    const bounds = {
      minX: finite(source.minX, -10),
      maxX: finite(source.maxX, 10),
      minY: finite(source.minY, -7),
      maxY: finite(source.maxY, 7),
    };
    if (!(bounds.minX < bounds.maxX) || !(bounds.minY < bounds.maxY)) {
      throw new RangeError("Границы геометрической сцены должны иметь положительный размер");
    }
    return bounds;
  }

  function createTransform(rawBounds, rawOptions) {
    const bounds = normalizeBounds(rawBounds);
    const options = rawOptions || {};
    const width = finite(options.width, DEFAULT_WIDTH);
    const height = finite(options.height, DEFAULT_HEIGHT);
    const padding = Math.max(0, finite(options.padding, 55));
    const zoom = Math.max(0.4, Math.min(8, finite(options.zoom, 1)));
    const panX = finite(options.panX, 0);
    const panY = finite(options.panY, 0);
    const usableWidth = Math.max(1, width - 2 * padding);
    const usableHeight = Math.max(1, height - 2 * padding);
    const scale = Math.min(
      usableWidth / (bounds.maxX - bounds.minX),
      usableHeight / (bounds.maxY - bounds.minY)
    );
    const contentWidth = (bounds.maxX - bounds.minX) * scale;
    const contentHeight = (bounds.maxY - bounds.minY) * scale;
    const baseLeft = (width - contentWidth) / 2;
    const baseTop = (height - contentHeight) / 2;
    const centerX = width / 2;
    const centerY = height / 2;

    function toCanvas(point) {
      const baseX = baseLeft + (Number(point.x) - bounds.minX) * scale;
      const baseY = baseTop + (bounds.maxY - Number(point.y)) * scale;
      return {
        x: centerX + (baseX - centerX) * zoom + panX,
        y: centerY + (baseY - centerY) * zoom + panY,
      };
    }

    function toWorld(point) {
      const baseX = centerX + (Number(point.x) - panX - centerX) / zoom;
      const baseY = centerY + (Number(point.y) - panY - centerY) / zoom;
      return {
        x: bounds.minX + (baseX - baseLeft) / scale,
        y: bounds.maxY - (baseY - baseTop) / scale,
      };
    }

    return Object.freeze({
      width: width,
      height: height,
      bounds: Object.freeze(bounds),
      scale: scale * zoom,
      zoom: zoom,
      panX: panX,
      panY: panY,
      toCanvas: toCanvas,
      toWorld: toWorld,
    });
  }

  function append(parent, name, attributes, text) {
    const element = parent.ownerDocument.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      if (entry[1] !== null && entry[1] !== undefined) {
        element.setAttribute(entry[0], String(entry[1]));
      }
    });
    if (text !== undefined) element.textContent = String(text);
    parent.appendChild(element);
    return element;
  }

  function clear(svg, title, description) {
    svg.replaceChildren();
    const titleId = (svg.id || "geometry-scene") + "-title";
    const descriptionId = (svg.id || "geometry-scene") + "-description";
    append(svg, "title", { id: titleId }, title);
    append(svg, "desc", { id: descriptionId }, description);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-labelledby", titleId + " " + descriptionId);
    return append(svg, "g", { class: "atlas-geometry__viewport" });
  }

  function drawGrid(parent, transform, step) {
    const spacing = Math.max(1, Math.round(finite(step, 1)));
    const bounds = transform.bounds;
    for (let x = Math.ceil(bounds.minX / spacing) * spacing; x <= bounds.maxX; x += spacing) {
      const top = transform.toCanvas({ x: x, y: bounds.maxY });
      const bottom = transform.toCanvas({ x: x, y: bounds.minY });
      append(parent, "line", {
        x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y,
        class: x === 0 ? "atlas-geometry__axis" : "atlas-geometry__grid",
      });
    }
    for (let y = Math.ceil(bounds.minY / spacing) * spacing; y <= bounds.maxY; y += spacing) {
      const left = transform.toCanvas({ x: bounds.minX, y: y });
      const right = transform.toCanvas({ x: bounds.maxX, y: y });
      append(parent, "line", {
        x1: left.x, y1: left.y, x2: right.x, y2: right.y,
        class: y === 0 ? "atlas-geometry__axis" : "atlas-geometry__grid",
      });
    }
  }

  function drawSegment(parent, transform, left, right, options) {
    const settings = options || {};
    const a = transform.toCanvas(left);
    const b = transform.toCanvas(right);
    return append(parent, "line", {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      class: "atlas-geometry__segment " + (settings.className || ""),
      "data-geometry-segment-id": settings.id || null,
      tabindex: settings.focusable ? "0" : null,
      role: settings.focusable ? "img" : null,
      "aria-label": settings.ariaLabel || null,
    });
  }

  function drawPolygon(parent, transform, rawPoints, options) {
    const settings = options || {};
    const points = rawPoints.map(function (point) {
      const position = transform.toCanvas(point);
      return position.x.toFixed(2) + "," + position.y.toFixed(2);
    }).join(" ");
    return append(parent, "polygon", {
      points: points,
      class: "atlas-geometry__polygon " + (settings.className || ""),
      tabindex: settings.focusable ? "0" : null,
      role: settings.focusable ? "img" : null,
      "aria-label": settings.ariaLabel || null,
    });
  }

  function drawCircle(parent, transform, circle, options) {
    const settings = options || {};
    const center = transform.toCanvas(circle);
    return append(parent, "circle", {
      cx: center.x,
      cy: center.y,
      r: Math.sqrt(Math.max(0, Number(circle.radiusSquared))) * transform.scale,
      class: "atlas-geometry__circle " + (settings.className || ""),
      tabindex: settings.focusable ? "0" : null,
      role: settings.focusable ? "img" : null,
      "aria-label": settings.ariaLabel || null,
    });
  }

  function drawPoint(parent, transform, point, options) {
    const settings = options || {};
    const position = transform.toCanvas(point);
    const group = append(parent, "g", {
      class: "atlas-geometry__point " + (settings.className || ""),
      transform: "translate(" + position.x.toFixed(2) + " " + position.y.toFixed(2) + ")",
      "data-geometry-point-id": point.id,
      tabindex: settings.focusable === false ? null : "0",
      role: "img",
      "aria-label": settings.ariaLabel ||
        "Точка " + (point.label || point.id) + ", x " + point.x + ", y " + point.y,
    });
    append(group, "circle", { r: settings.radius || 9, class: "atlas-geometry__point-shape" });
    append(group, "text", { x: 13, y: -12, class: "atlas-geometry__label" }, point.label || point.id);
    return group;
  }

  function drawText(parent, transform, point, text, className, anchor) {
    const position = transform.toCanvas(point);
    return append(parent, "text", {
      x: position.x,
      y: position.y,
      class: "atlas-geometry__label " + (className || ""),
      "text-anchor": anchor || "start",
    }, text);
  }

  function eventCanvasPoint(svg, event, width, height) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * height / Math.max(1, rect.height),
    };
  }

  function mount(svg, options) {
    if (!svg || typeof svg.addEventListener !== "function") {
      throw new TypeError("Для геометрической сцены требуется SVG-элемент");
    }
    const settings = options || {};
    const width = finite(settings.width, DEFAULT_WIDTH);
    const height = finite(settings.height, DEFAULT_HEIGHT);
    let bounds = normalizeBounds(settings.bounds || boundsForPoints([], 2));
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let pointer = null;
    let destroyed = false;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("aria-keyshortcuts", "+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown");

    function transform() {
      return createTransform(bounds, {
        width: width, height: height, padding: settings.padding || 55,
        zoom: zoom, panX: panX, panY: panY,
      });
    }

    function changed() {
      if (typeof settings.onViewChange === "function" && !destroyed) {
        settings.onViewChange();
      }
    }

    function pointTarget(target) {
      if (!target || typeof target.closest !== "function") return null;
      return target.closest("[data-geometry-point-id]");
    }

    function onPointerDown(event) {
      const target = pointTarget(event.target);
      pointer = {
        id: event.pointerId,
        pointId: target ? target.getAttribute("data-geometry-point-id") : null,
        start: eventCanvasPoint(svg, event, width, height),
        panX: panX,
        panY: panY,
      };
      if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const canvas = eventCanvasPoint(svg, event, width, height);
      if (pointer.pointId && typeof settings.onPointMove === "function") {
        const world = transform().toWorld(canvas);
        settings.onPointMove(pointer.pointId, Math.round(world.x), Math.round(world.y));
      } else {
        panX = pointer.panX + canvas.x - pointer.start.x;
        panY = pointer.panY + canvas.y - pointer.start.y;
        changed();
      }
    }

    function onPointerUp(event) {
      if (pointer && pointer.id === event.pointerId) pointer = null;
    }

    function onWheel(event) {
      if (event.cancelable) event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoom = Math.max(0.5, Math.min(6, zoom * factor));
      changed();
    }

    function onKeyDown(event) {
      const target = pointTarget(event.target);
      const pointStep = event.shiftKey ? 5 : 1;
      if (target && typeof settings.onPointNudge === "function" &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        settings.onPointNudge(
          target.getAttribute("data-geometry-point-id"),
          event.key === "ArrowLeft" ? -pointStep : event.key === "ArrowRight" ? pointStep : 0,
          event.key === "ArrowDown" ? -pointStep : event.key === "ArrowUp" ? pointStep : 0
        );
        return;
      }
      const panStep = event.shiftKey ? 55 : 24;
      if (event.key === "+" || event.key === "=") zoom = Math.min(6, zoom * 1.15);
      else if (event.key === "-") zoom = Math.max(0.5, zoom / 1.15);
      else if (event.key === "0" || event.key === "Home") { zoom = 1; panX = 0; panY = 0; }
      else if (event.key === "ArrowLeft") panX += panStep;
      else if (event.key === "ArrowRight") panX -= panStep;
      else if (event.key === "ArrowUp") panY += panStep;
      else if (event.key === "ArrowDown") panY -= panStep;
      else return;
      event.preventDefault();
      changed();
    }

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("keydown", onKeyDown);

    return Object.freeze({
      transform: transform,
      setBounds: function (nextBounds) { bounds = normalizeBounds(nextBounds); },
      fit: function (points, margin) {
        bounds = boundsForPoints(points, margin);
        zoom = 1; panX = 0; panY = 0;
      },
      resetView: function () { zoom = 1; panX = 0; panY = 0; changed(); },
      destroy: function () {
        destroyed = true;
        svg.removeEventListener("pointerdown", onPointerDown);
        svg.removeEventListener("pointermove", onPointerMove);
        svg.removeEventListener("pointerup", onPointerUp);
        svg.removeEventListener("pointercancel", onPointerUp);
        svg.removeEventListener("wheel", onWheel);
        svg.removeEventListener("keydown", onKeyDown);
      },
    });
  }

  return Object.freeze({
    boundsForPoints: boundsForPoints,
    createTransform: createTransform,
    append: append,
    clear: clear,
    drawGrid: drawGrid,
    drawSegment: drawSegment,
    drawPolygon: drawPolygon,
    drawCircle: drawCircle,
    drawPoint: drawPoint,
    drawText: drawText,
    mount: mount,
  });
});
