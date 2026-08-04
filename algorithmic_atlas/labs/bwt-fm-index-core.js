(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BwtFmIndexCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function chars(value, maximum) {
    const result = Array.from(String(value === undefined ? "" : value));
    if (result.length > maximum) throw new RangeError("Строка слишком длинная.");
    return result;
  }

  const SENTINEL = "$";

  function compareSymbols(left, right) {
    if (left === right) return 0;
    if (left === SENTINEL) return -1;
    if (right === SENTINEL) return 1;
    return left.codePointAt(0) - right.codePointAt(0);
  }

  function compareRows(left, right) {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const comparison = compareSymbols(left[index], right[index]);
      if (comparison !== 0) return comparison;
    }
    return left.length - right.length;
  }

  function withSentinel(rawText) {
    const text = chars(rawText, 120);
    if (text.includes(SENTINEL)) throw new RangeError("Символ $ зарезервирован как уникальный конец строки.");
    return text.concat([SENTINEL]);
  }

  function rotations(rawText) {
    const text = withSentinel(rawText);
    return text.map(function (_, start) {
      return text.slice(start).concat(text.slice(0, start));
    }).sort(compareRows);
  }

  function transform(rawText) {
    const sorted = rotations(rawText);
    return freeze({
      rotations: sorted.map(function (row) { return row.join(""); }),
      last: sorted.map(function (row) { return row[row.length - 1]; }).join(""),
    });
  }

  function inverse(rawLast) {
    const last = chars(rawLast, 121);
    if (last.filter(function (symbol) { return symbol === SENTINEL; }).length !== 1) {
      throw new RangeError("BWT должна содержать ровно один символ $.");
    }
    let table = last.map(function () { return []; });
    for (let iteration = 0; iteration < last.length; iteration += 1) {
      table = table.map(function (row, index) { return [last[index]].concat(row); })
        .sort(compareRows);
    }
    const originalRow = table.find(function (row) { return row.at(-1) === SENTINEL; });
    const candidate = originalRow ? originalRow.slice(0, -1).join("") : "";
    if (!originalRow || candidate.includes(SENTINEL) || transform(candidate).last !== last.join("")) {
      throw new RangeError("Строка не является корректным BWT с выбранным сентинелом.");
    }
    return candidate;
  }

  function buildIndex(rawText) {
    const result = transform(rawText);
    const last = chars(result.last, 121);
    const alphabet = Array.from(new Set(last)).sort(compareSymbols);
    const counts = Object.create(null);
    alphabet.forEach(function (symbol) { counts[symbol] = 0; });
    last.forEach(function (symbol) { counts[symbol] += 1; });
    const first = Object.create(null);
    let offset = 0;
    alphabet.forEach(function (symbol) { first[symbol] = offset; offset += counts[symbol]; });
    const occ = Object.create(null);
    alphabet.forEach(function (symbol) { occ[symbol] = [0]; });
    last.forEach(function (symbol) {
      alphabet.forEach(function (candidate) {
        occ[candidate].push(occ[candidate].at(-1) + (candidate === symbol ? 1 : 0));
      });
    });
    return freeze({ text: String(rawText), last: result.last, rotations: result.rotations,
      alphabet: alphabet, first: first, occ: occ });
  }

  function backwardSearch(rawText, rawPattern) {
    const pattern = chars(rawPattern, 48);
    if (!pattern.length) throw new RangeError("Образец не должен быть пустым.");
    if (pattern.includes(SENTINEL)) {
      throw new RangeError("Символ $ зарезервирован и не может входить в поисковый образец.");
    }
    const index = buildIndex(rawText);
    let left = 0;
    let right = chars(index.last, 121).length;
    const frames = [];
    for (let position = pattern.length - 1; position >= 0; position -= 1) {
      const symbol = pattern[position];
      const previous = [left, right];
      if (index.first[symbol] === undefined) {
        left = 0;
        right = 0;
      } else {
        left = index.first[symbol] + index.occ[symbol][left];
        right = index.first[symbol] + index.occ[symbol][right];
      }
      frames.push({ patternIndex: position, symbol: symbol, previous: previous,
        left: left, right: right, count: Math.max(0, right - left), finished: false });
      if (left >= right) break;
    }
    frames.push({ patternIndex: -1, symbol: "", previous: [left, right], left: left,
      right: right, count: Math.max(0, right - left), finished: true });
    return freeze({ index: index, frames: frames });
  }

  function runLength(rawValue) {
    const value = chars(rawValue, 10000);
    const runs = [];
    value.forEach(function (symbol) {
      const last = runs.at(-1);
      if (last && last.symbol === symbol) last.length += 1;
      else runs.push({ symbol: symbol, length: 1 });
    });
    return freeze(runs);
  }

  function createState(options) {
    const settings = options || {};
    const text = settings.text === undefined ? "банан" : String(settings.text);
    const pattern = settings.pattern === undefined ? "ана" : String(settings.pattern);
    const result = backwardSearch(text, pattern);
    return freeze({ text: text, pattern: pattern,
      indexData: result.index, frames: result.frames, index: 0, frame: result.frames[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ text: state.text, pattern: state.pattern, indexData: state.indexData,
      frames: state.frames, index: index, frame: state.frames[index] });
  }

  return freeze({ compareSymbols: compareSymbols, rotations: rotations, transform: transform, inverse: inverse,
    buildIndex: buildIndex, backwardSearch: backwardSearch, runLength: runLength,
    createState: createState, step: step });
});
