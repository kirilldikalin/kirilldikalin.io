(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EditDistanceLcsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function chars(value, label, maximum) {
    const result = Array.from(String(value === undefined ? "" : value));
    if (result.length > maximum) throw new RangeError(label + " слишком длинная.");
    return result;
  }

  function finiteNumber(value, fallback, label, minimum, maximum) {
    const number = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new RangeError(label + " должно быть числом от " + minimum + " до " + maximum + ".");
    }
    return number;
  }

  function editCosts(rawCosts) {
    const costs = rawCosts || {};
    return freeze({ insert: finiteNumber(costs.insert, 1, "Цена вставки", 0, 1000),
      delete: finiteNumber(costs.delete, 1, "Цена удаления", 0, 1000),
      substitute: finiteNumber(costs.substitute, 1, "Цена замены", 0, 1000) });
  }

  function alignmentScores(rawScores) {
    const scores = rawScores || {};
    return freeze({ match: finiteNumber(scores.match, 2, "Награда совпадения", -1000, 1000),
      mismatch: finiteNumber(scores.mismatch, -1, "Цена несовпадения", -1000, 1000),
      gap: finiteNumber(scores.gap, -2, "Цена пропуска", -1000, 1000) });
  }

  function editMatrix(rawLeft, rawRight, rawCosts) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const costs = editCosts(rawCosts);
    const matrix = Array.from({ length: left.length + 1 }, function (_, row) {
      return Array.from({ length: right.length + 1 }, function (_, column) {
        return row === 0 ? column * costs.insert : column === 0 ? row * costs.delete : 0;
      });
    });
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        const substitution = left[row - 1] === right[column - 1] ? 0 : costs.substitute;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + costs.delete,
          matrix[row][column - 1] + costs.insert,
          matrix[row - 1][column - 1] + substitution
        );
      }
    }
    return matrix;
  }

  function editScript(rawLeft, rawRight, rawMatrix, rawCosts) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const costs = editCosts(rawCosts);
    const matrix = rawMatrix || editMatrix(left.join(""), right.join(""), costs);
    const script = [];
    const path = [[left.length, right.length]];
    let row = left.length;
    let column = right.length;
    while (row > 0 || column > 0) {
      if (row > 0 && column > 0) {
        const cost = left[row - 1] === right[column - 1] ? 0 : costs.substitute;
        if (matrix[row][column] === matrix[row - 1][column - 1] + cost) {
          script.push({ kind: cost ? "replace" : "keep", from: left[row - 1], to: right[column - 1] });
          row -= 1;
          column -= 1;
          path.push([row, column]);
          continue;
        }
      }
      if (row > 0 && matrix[row][column] === matrix[row - 1][column] + costs.delete) {
        script.push({ kind: "delete", from: left[row - 1], to: "" });
        row -= 1;
      } else {
        script.push({ kind: "insert", from: "", to: right[column - 1] });
        column -= 1;
      }
      path.push([row, column]);
    }
    return freeze({ operations: script.reverse(), path: path.reverse() });
  }

  function lcsMatrix(rawLeft, rawRight) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const matrix = Array.from({ length: left.length + 1 }, function () {
      return Array(right.length + 1).fill(0);
    });
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        matrix[row][column] = left[row - 1] === right[column - 1]
          ? matrix[row - 1][column - 1] + 1
          : Math.max(matrix[row - 1][column], matrix[row][column - 1]);
      }
    }
    return matrix;
  }

  function lcs(rawLeft, rawRight, rawMatrix) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const matrix = rawMatrix || lcsMatrix(left.join(""), right.join(""));
    const answer = [];
    const path = [[left.length, right.length]];
    let row = left.length;
    let column = right.length;
    while (row > 0 && column > 0) {
      if (left[row - 1] === right[column - 1]) {
        answer.push(left[row - 1]);
        row -= 1;
        column -= 1;
      } else if (matrix[row - 1][column] >= matrix[row][column - 1]) row -= 1;
      else column -= 1;
      path.push([row, column]);
    }
    return freeze({ value: answer.reverse().join(""), path: path.reverse() });
  }

  function lcsLengths(left, right) {
    let previous = Array(right.length + 1).fill(0);
    left.forEach(function (symbol) {
      const current = [0];
      right.forEach(function (other, column) {
        current.push(symbol === other
          ? previous[column] + 1
          : Math.max(previous[column + 1], current[column]));
      });
      previous = current;
    });
    return previous;
  }

  function hirschberg(rawLeft, rawRight) {
    const left = Array.isArray(rawLeft) ? rawLeft : chars(rawLeft, "Первая строка", 2000);
    const right = Array.isArray(rawRight) ? rawRight : chars(rawRight, "Вторая строка", 2000);
    if (!left.length) return "";
    if (left.length === 1) return right.includes(left[0]) ? left[0] : "";
    const middle = Math.floor(left.length / 2);
    const prefix = lcsLengths(left.slice(0, middle), right);
    const suffix = lcsLengths(left.slice(middle).reverse(), right.slice().reverse()).reverse();
    let split = 0;
    for (let index = 1; index <= right.length; index += 1) {
      if (prefix[index] + suffix[index] > prefix[split] + suffix[split]) split = index;
    }
    return hirschberg(left.slice(0, middle), right.slice(0, split)) +
      hirschberg(left.slice(middle), right.slice(split));
  }

  function alignmentMatrix(rawLeft, rawRight, rawScores, local) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const scores = alignmentScores(rawScores);
    const matrix = Array.from({ length: left.length + 1 }, function () {
      return Array(right.length + 1).fill(0);
    });
    if (!local) {
      for (let row = 1; row <= left.length; row += 1) matrix[row][0] = row * scores.gap;
      for (let column = 1; column <= right.length; column += 1) matrix[0][column] = column * scores.gap;
    }
    let best = { row: 0, column: 0, value: 0 };
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        const diagonal = matrix[row - 1][column - 1] +
          (left[row - 1] === right[column - 1] ? scores.match : scores.mismatch);
        matrix[row][column] = Math.max(local ? 0 : -Infinity, diagonal,
          matrix[row - 1][column] + scores.gap, matrix[row][column - 1] + scores.gap);
        if (matrix[row][column] > best.value) best = { row: row, column: column, value: matrix[row][column] };
      }
    }
    if (!local) best = { row: left.length, column: right.length,
      value: matrix[left.length][right.length] };
    return freeze({ matrix: matrix, best: best, scores: scores, local: Boolean(local) });
  }

  function alignmentTrace(rawLeft, rawRight, rawResult) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const result = rawResult || alignmentMatrix(left.join(""), right.join(""), undefined, false);
    const matrix = result.matrix;
    const scores = result.scores;
    let row = result.best.row;
    let column = result.best.column;
    const path = [[row, column]];
    const alignedLeft = [];
    const alignedRight = [];
    while (row > 0 || column > 0) {
      if (result.local && matrix[row][column] === 0) break;
      if (row > 0 && column > 0) {
        const diagonal = matrix[row - 1][column - 1] +
          (left[row - 1] === right[column - 1] ? scores.match : scores.mismatch);
        if (matrix[row][column] === diagonal) {
          alignedLeft.push(left[row - 1]);
          alignedRight.push(right[column - 1]);
          row -= 1; column -= 1; path.push([row, column]); continue;
        }
      }
      if (row > 0 && matrix[row][column] === matrix[row - 1][column] + scores.gap) {
        alignedLeft.push(left[row - 1]); alignedRight.push("–"); row -= 1;
      } else if (column > 0) {
        alignedLeft.push("–"); alignedRight.push(right[column - 1]); column -= 1;
      } else break;
      path.push([row, column]);
    }
    return freeze({ value: result.best.value, path: path.reverse(),
      left: alignedLeft.reverse().join(""), right: alignedRight.reverse().join("") });
  }

  function frames(rawLeft, rawRight, mode, options) {
    const left = chars(rawLeft, "Первая строка", 40);
    const right = chars(rawRight, "Вторая строка", 40);
    const settings = options || {};
    let matrix;
    let path;
    let answerCell = [left.length, right.length];
    if (mode === "lcs") {
      matrix = lcsMatrix(left.join(""), right.join(""));
      path = lcs(left.join(""), right.join(""), matrix).path;
    } else if (mode === "edit") {
      matrix = editMatrix(left.join(""), right.join(""), settings.costs);
      path = editScript(left.join(""), right.join(""), matrix, settings.costs).path;
    } else {
      const alignment = alignmentMatrix(left.join(""), right.join(""), settings.scores, mode === "local");
      matrix = alignment.matrix;
      path = alignmentTrace(left.join(""), right.join(""), alignment).path;
      answerCell = [alignment.best.row, alignment.best.column];
    }
    const trace = [];
    for (let row = 0; row <= left.length; row += 1) {
      for (let column = 0; column <= right.length; column += 1) {
        trace.push({ row: row, column: column, matrix: matrix, path: path, answerCell: answerCell,
          visibleCells: row * (right.length + 1) + column + 1, finished: false });
      }
    }
    trace.push({ row: left.length, column: right.length, matrix: matrix, path: path, answerCell: answerCell,
      visibleCells: (left.length + 1) * (right.length + 1), finished: true });
    return freeze(trace);
  }

  function cellIsVisible(frame, row, column) {
    if (!frame || !Array.isArray(frame.matrix) || !frame.matrix.length ||
        !Array.isArray(frame.matrix[0])) {
      throw new TypeError("Кадр динамической таблицы повреждён.");
    }
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 ||
        row >= frame.matrix.length || column >= frame.matrix[0].length) {
      throw new RangeError("Координата клетки вне динамической таблицы.");
    }
    return row * frame.matrix[0].length + column < frame.visibleCells;
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "edit";
    if (!["edit", "lcs", "global", "local"].includes(mode)) throw new RangeError("Неизвестный режим выравнивания.");
    const left = settings.left === undefined ? "алгоритм" : settings.left;
    const right = settings.right === undefined ? "логарифм" : settings.right;
    const costs = editCosts(settings.costs);
    const scores = alignmentScores(settings.scores);
    const trace = frames(left, right, mode, { costs: costs, scores: scores });
    return freeze({ mode: mode, left: left, right: right, frames: trace,
      costs: costs, scores: scores, index: 0, frame: trace[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ mode: state.mode, left: state.left, right: state.right,
      costs: state.costs, scores: state.scores,
      frames: state.frames, index: index, frame: state.frames[index] });
  }

  return freeze({ editMatrix: editMatrix, editScript: editScript,
    lcsMatrix: lcsMatrix, lcs: lcs, hirschberg: hirschberg,
    alignmentMatrix: alignmentMatrix, alignmentTrace: alignmentTrace,
    frames: frames, cellIsVisible: cellIsVisible,
    createState: createState, step: step });
});
