(function (root) {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";

  function element(name, attributes, text) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null) {
        node.setAttribute(entry[0], String(entry[1]));
      }
    });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function append(parent, name, attributes, text) {
    const node = element(name, attributes, text);
    parent.appendChild(node);
    return node;
  }

  function clear(svg, title, description) {
    svg.replaceChildren();
    const id = svg.id || "numeric-visual";
    append(svg, "title", { id: id + "-title" }, title);
    append(svg, "desc", { id: id + "-description" }, description);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", id + "-title " + id + "-description");
  }

  function text(parent, x, y, value, className, anchor) {
    return append(parent, "text", {
      x: x,
      y: y,
      class: className || "",
      "text-anchor": anchor || "start",
    }, value);
  }

  function drawCells(svg, values, options) {
    const settings = options || {};
    const startX = settings.x || 40;
    const startY = settings.y || 80;
    const width = settings.width || 82;
    const height = settings.height || 54;
    const gap = settings.gap === undefined ? 8 : settings.gap;
    const active = new Set(settings.active || []);
    values.forEach(function (value, index) {
      const x = startX + index * (width + gap);
      append(svg, "rect", {
        x: x,
        y: startY,
        width: width,
        height: height,
        rx: 3,
        class: active.has(index) ? "numeric-cell is-active" : "numeric-cell",
      });
      text(svg, x + width / 2, startY + height / 2 + 5, value, "numeric-cell-label", "middle");
    });
  }

  function drawMatrix(svg, matrix, options) {
    const settings = options || {};
    const startX = settings.x || 90;
    const startY = settings.y || 90;
    const cell = settings.cell || 58;
    const active = settings.active || [];
    const activeKey = new Set(active.map(function (pair) { return pair[0] + ":" + pair[1]; }));
    matrix.forEach(function (row, rowIndex) {
      row.forEach(function (value, columnIndex) {
        const x = startX + columnIndex * cell;
        const y = startY + rowIndex * cell;
        append(svg, "rect", {
          x: x,
          y: y,
          width: cell,
          height: cell,
          class: activeKey.has(rowIndex + ":" + columnIndex)
            ? "numeric-matrix-cell is-active"
            : "numeric-matrix-cell",
        });
        text(svg, x + cell / 2, y + cell / 2 + 5, formatNumber(value), "numeric-cell-label", "middle");
      });
    });
  }

  function drawPolyline(svg, points, options) {
    const settings = options || {};
    const valid = points.filter(function (point) {
      return Number.isFinite(point.x) && Number.isFinite(point.y);
    });
    if (!valid.length) return null;
    const path = valid.map(function (point, index) {
      return (index ? "L" : "M") + point.x.toFixed(2) + " " + point.y.toFixed(2);
    }).join(" ");
    return append(svg, "path", {
      d: path,
      class: settings.className || "numeric-plot-line",
      fill: "none",
    });
  }

  function formatInteger(value, maximum) {
    const text = String(value);
    const limit = maximum || 28;
    if (text.length <= limit) return text;
    const sign = text[0] === "-" ? "-" : "";
    const digits = sign ? text.slice(1) : text;
    return sign + digits.slice(0, 11) + "…" + digits.slice(-8) + " (" + digits.length + " цифр)";
  }

  function formatNumber(value) {
    if (typeof value === "bigint") return formatInteger(value);
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
      return value.toExponential(3);
    }
    return Number(value.toPrecision(6)).toString();
  }

  root.AtlasNumericLabRuntime = Object.freeze({
    element: element,
    append: append,
    clear: clear,
    text: text,
    drawCells: drawCells,
    drawMatrix: drawMatrix,
    drawPolyline: drawPolyline,
    formatInteger: formatInteger,
    formatNumber: formatNumber,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
