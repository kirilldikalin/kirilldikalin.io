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

  function editMatrix(rawLeft, rawRight) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const matrix = Array.from({ length: left.length + 1 }, function (_, row) {
      return Array.from({ length: right.length + 1 }, function (_, column) {
        return row === 0 ? column : column === 0 ? row : 0;
      });
    });
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + substitution
        );
      }
    }
    return matrix;
  }

  function editScript(rawLeft, rawRight, rawMatrix) {
    const left = chars(rawLeft, "Первая строка", 160);
    const right = chars(rawRight, "Вторая строка", 160);
    const matrix = rawMatrix || editMatrix(left.join(""), right.join(""));
    const script = [];
    const path = [[left.length, right.length]];
    let row = left.length;
    let column = right.length;
    while (row > 0 || column > 0) {
      if (row > 0 && column > 0) {
        const cost = left[row - 1] === right[column - 1] ? 0 : 1;
        if (matrix[row][column] === matrix[row - 1][column - 1] + cost) {
          script.push({ kind: cost ? "replace" : "keep", from: left[row - 1], to: right[column - 1] });
          row -= 1;
          column -= 1;
          path.push([row, column]);
          continue;
        }
      }
      if (row > 0 && matrix[row][column] === matrix[row - 1][column] + 1) {
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

  function frames(rawLeft, rawRight, mode) {
    const left = chars(rawLeft, "Первая строка", 40);
    const right = chars(rawRight, "Вторая строка", 40);
    const matrix = mode === "lcs" ? lcsMatrix(left.join(""), right.join("")) :
      editMatrix(left.join(""), right.join(""));
    const path = mode === "lcs" ? lcs(left.join(""), right.join(""), matrix).path :
      editScript(left.join(""), right.join(""), matrix).path;
    const trace = [];
    for (let row = 0; row <= left.length; row += 1) {
      for (let column = 0; column <= right.length; column += 1) {
        trace.push({ row: row, column: column, matrix: matrix, path: path,
          visibleCells: row * (right.length + 1) + column + 1, finished: false });
      }
    }
    trace.push({ row: left.length, column: right.length, matrix: matrix, path: path,
      visibleCells: (left.length + 1) * (right.length + 1), finished: true });
    return freeze(trace);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "edit";
    if (!["edit", "lcs"].includes(mode)) throw new RangeError("Неизвестный режим выравнивания.");
    const left = settings.left || "алгоритм";
    const right = settings.right || "логарифм";
    const trace = frames(left, right, mode);
    return freeze({ mode: mode, left: left, right: right, frames: trace,
      index: 0, frame: trace[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ mode: state.mode, left: state.left, right: state.right,
      frames: state.frames, index: index, frame: state.frames[index] });
  }

  return freeze({ editMatrix: editMatrix, editScript: editScript,
    lcsMatrix: lcsMatrix, lcs: lcs, hirschberg: hirschberg,
    frames: frames, createState: createState, step: step });
});
