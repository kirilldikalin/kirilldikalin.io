(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasSequenceLabRuntime = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function boundedInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(label + " должно быть целым числом от " + minimum + " до " + maximum + ".");
    }
    return number;
  }

  function symbols(value, maximumLength) {
    const limit = boundedInteger(
      maximumLength === undefined ? 96 : maximumLength,
      "Предельная длина строки",
      1,
      10000
    );
    const result = Array.from(String(value === undefined ? "" : value));
    if (result.length > limit) {
      throw new RangeError("Строка должна содержать не больше " + limit + " символов.");
    }
    return result;
  }

  function stripGeometry(length, options) {
    const settings = options || {};
    const count = boundedInteger(length, "Длина строки", 0, 10000);
    const x = Number.isFinite(settings.x) ? settings.x : 28;
    const y = Number.isFinite(settings.y) ? settings.y : 28;
    const width = Math.max(0, Number.isFinite(settings.width) ? settings.width : 704);
    const height = Number.isFinite(settings.height) ? settings.height : 54;
    const requestedGap = Math.max(0, Number.isFinite(settings.gap) ? settings.gap : 4);
    const readable = Math.max(0, Number.isFinite(settings.readableCellWidth)
      ? settings.readableCellWidth
      : 36);
    const minimumCellWidth = count === 0 ? readable : Math.min(12, width / count);
    const maximumGap = count > 1
      ? Math.max(0, (width - minimumCellWidth * count) / (count - 1))
      : 0;
    const gap = count > 1 ? Math.min(requestedGap, maximumGap) : 0;
    const cellWidth = count === 0
      ? readable
      : Math.max(0, Math.min(readable, (width - gap * (count - 1)) / count));
    return Object.freeze(Array.from({ length: count }, function (_, index) {
      return Object.freeze({
        index: index,
        x: Number((x + index * (cellWidth + gap)).toFixed(3)),
        y: y,
        width: Number(cellWidth.toFixed(3)),
        height: height,
        centerX: Number((x + index * (cellWidth + gap) + cellWidth / 2).toFixed(3)),
        centerY: Number((y + height / 2).toFixed(3)),
      });
    }));
  }

  function matrixGeometry(rows, columns, options) {
    const rowCount = boundedInteger(rows, "Число строк", 0, 500);
    const columnCount = boundedInteger(columns, "Число столбцов", 0, 500);
    const settings = options || {};
    const x = Number.isFinite(settings.x) ? settings.x : 80;
    const y = Number.isFinite(settings.y) ? settings.y : 46;
    const cell = Number.isFinite(settings.cell) ? settings.cell : 34;
    return Object.freeze(Array.from({ length: rowCount }, function (_, row) {
      return Object.freeze(Array.from({ length: columnCount }, function (_, column) {
        return Object.freeze({
          row: row,
          column: column,
          x: x + column * cell,
          y: y + row * cell,
          width: cell,
          height: cell,
          centerX: x + column * cell + cell / 2,
          centerY: y + row * cell + cell / 2,
        });
      }));
    }));
  }

  function classForIndex(index, options) {
    const settings = options || {};
    if (settings.active && settings.active.includes(index)) return "is-active";
    if (settings.matched && settings.matched.includes(index)) return "is-matched";
    if (settings.rejected && settings.rejected.includes(index)) return "is-rejected";
    if (settings.window && index >= settings.window[0] && index < settings.window[1]) {
      return "is-window";
    }
    return "";
  }

  function drawStrip(svg, rawSymbols, options) {
    if (!root || !root.AtlasLabSvg) {
      throw new Error("AtlasLabSvg is unavailable");
    }
    const drawing = root.AtlasLabSvg;
    const items = Array.isArray(rawSymbols) ? rawSymbols.slice() : symbols(rawSymbols);
    const settings = options || {};
    const geometry = stripGeometry(items.length, settings);
    const group = drawing.append(svg, "g", {
      class: "atlas-sequence-strip " + (settings.className || ""),
      transform: settings.transform || "",
    });
    if (settings.label) {
      drawing.text(group, settings.labelX || 28, (settings.y || 28) - 10,
        settings.label, "atlas-sequence-label is-strong");
    }
    geometry.forEach(function (cell, index) {
      const cellGroup = drawing.append(group, "g", {
        class: "atlas-sequence-cell " + classForIndex(index, settings),
        "data-sequence-index": index,
      });
      drawing.append(cellGroup, "rect", {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        rx: 4,
      });
      if (cell.width >= 8) {
        drawing.text(cellGroup, cell.centerX, cell.centerY + 5, items[index], "", "middle");
      }
      if (settings.showIndices !== false && cell.width >= 14) {
        drawing.text(cellGroup, cell.centerX, cell.y + cell.height + 17,
          String(index), "is-muted", "middle");
      }
    });
    return group;
  }

  function drawMatrix(svg, values, options) {
    if (!root || !root.AtlasLabSvg) {
      throw new Error("AtlasLabSvg is unavailable");
    }
    const drawing = root.AtlasLabSvg;
    const settings = options || {};
    const rows = Array.isArray(values) ? values : [];
    const columns = rows.reduce(function (maximum, row) {
      return Math.max(maximum, Array.isArray(row) ? row.length : 0);
    }, 0);
    const geometry = matrixGeometry(rows.length, columns, settings);
    const group = drawing.append(svg, "g", { class: "atlas-sequence-matrix" });
    rows.forEach(function (row, rowIndex) {
      row.forEach(function (value, columnIndex) {
        const cell = geometry[rowIndex][columnIndex];
        const active = settings.active && settings.active[0] === rowIndex &&
          settings.active[1] === columnIndex;
        const path = settings.path && settings.path.some(function (entry) {
          return entry[0] === rowIndex && entry[1] === columnIndex;
        });
        const cellGroup = drawing.append(group, "g", {
          class: "atlas-sequence-matrix-cell" + (active ? " is-active" : "") +
            (path ? " is-path" : ""),
        });
        drawing.append(cellGroup, "rect", {
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
        });
        drawing.text(cellGroup, cell.centerX, cell.centerY + 5,
          value === null || value === undefined ? "" : String(value), "", "middle");
      });
    });
    return group;
  }

  return Object.freeze({
    boundedInteger: boundedInteger,
    symbols: symbols,
    stripGeometry: stripGeometry,
    matrixGeometry: matrixGeometry,
    drawStrip: drawStrip,
    drawMatrix: drawMatrix,
  });
});
