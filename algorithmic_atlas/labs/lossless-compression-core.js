(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LosslessCompressionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function chars(value, maximum) {
    const result = Array.from(String(value === undefined ? "" : value));
    if (!result.length) throw new RangeError("Сообщение не должно быть пустым.");
    if (result.length > maximum) throw new RangeError("Сообщение слишком длинное.");
    return result;
  }

  function frequencies(rawText) {
    const text = chars(rawText, 10000);
    const map = new Map();
    text.forEach(function (symbol) { map.set(symbol, (map.get(symbol) || 0) + 1); });
    return freeze(Array.from(map, function (entry) {
      return { symbol: entry[0], count: entry[1], probability: entry[1] / text.length };
    }).sort(function (left, right) {
      return left.count - right.count || left.symbol.localeCompare(right.symbol);
    }));
  }

  function huffman(rawText) {
    const text = chars(rawText, 5000);
    let nextId = 0;
    const queue = frequencies(text.join("")).map(function (entry) {
      return { id: nextId++, weight: entry.count, symbol: entry.symbol, left: null, right: null };
    });
    const frames = [];
    function sortQueue() {
      queue.sort(function (left, right) {
        return left.weight - right.weight || String(left.symbol || "").localeCompare(String(right.symbol || "")) ||
          left.id - right.id;
      });
    }
    sortQueue();
    while (queue.length > 1) {
      const left = queue.shift();
      const right = queue.shift();
      const parent = { id: nextId++, weight: left.weight + right.weight, symbol: null,
        left: left, right: right };
      queue.push(parent);
      sortQueue();
      frames.push({ left: left.id, right: right.id, parent: parent.id,
        queue: queue.map(function (node) { return node.id; }), finished: false });
    }
    const root = queue[0];
    const codes = Object.create(null);
    function visit(node, prefix) {
      if (node.symbol !== null) {
        codes[node.symbol] = prefix || "0";
        return;
      }
      visit(node.left, prefix + "0");
      visit(node.right, prefix + "1");
    }
    visit(root, "");
    frames.push({ left: null, right: null, parent: root.id, queue: [root.id], finished: true });
    return freeze({ root: root, codes: codes, frames: frames,
      encoded: text.map(function (symbol) { return codes[symbol]; }).join("") });
  }

  function gcd(left, right) {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    return a;
  }

  function fraction(numerator, denominator) {
    if (denominator === 0n) throw new RangeError("Нулевой знаменатель.");
    let n = BigInt(numerator);
    let d = BigInt(denominator);
    if (d < 0n) { n = -n; d = -d; }
    const divisor = gcd(n, d);
    return Object.freeze({ numerator: n / divisor, denominator: d / divisor });
  }

  function add(left, right) {
    return fraction(left.numerator * right.denominator + right.numerator * left.denominator,
      left.denominator * right.denominator);
  }

  function subtract(left, right) {
    return fraction(left.numerator * right.denominator - right.numerator * left.denominator,
      left.denominator * right.denominator);
  }

  function multiply(left, right) {
    return fraction(left.numerator * right.numerator, left.denominator * right.denominator);
  }

  function arithmeticFrames(rawText) {
    const text = chars(rawText, 24);
    const frequency = frequencies(text.join(""));
    const cumulative = Object.create(null);
    let cursor = fraction(0n, 1n);
    frequency.slice().sort(function (a, b) { return a.symbol.localeCompare(b.symbol); })
      .forEach(function (entry) {
        const width = fraction(BigInt(entry.count), BigInt(text.length));
        cumulative[entry.symbol] = { low: cursor, high: add(cursor, width) };
        cursor = add(cursor, width);
      });
    let low = fraction(0n, 1n);
    let high = fraction(1n, 1n);
    const frames = [];
    text.forEach(function (symbol, index) {
      const width = subtract(high, low);
      const interval = cumulative[symbol];
      const nextLow = add(low, multiply(width, interval.low));
      const nextHigh = add(low, multiply(width, interval.high));
      low = nextLow;
      high = nextHigh;
      frames.push({ index: index, symbol: symbol, low: low, high: high,
        cumulative: cumulative, finished: false });
    });
    frames.push({ index: text.length, symbol: "", low: low, high: high,
      cumulative: cumulative, finished: true });
    return freeze(frames);
  }

  function lz77(rawText, rawWindow, rawLookahead) {
    const text = chars(rawText, 500);
    const windowSize = Number(rawWindow === undefined ? 12 : rawWindow);
    const lookahead = Number(rawLookahead === undefined ? 8 : rawLookahead);
    if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 120 ||
        !Number.isInteger(lookahead) || lookahead < 1 || lookahead > 60) {
      throw new RangeError("Размеры окна LZ77 вне допустимого диапазона.");
    }
    const tokens = [];
    const frames = [];
    let position = 0;
    while (position < text.length) {
      let bestLength = 0;
      let bestDistance = 0;
      const start = Math.max(0, position - windowSize);
      for (let candidate = start; candidate < position; candidate += 1) {
        let length = 0;
        while (length < lookahead && position + length < text.length &&
            text[candidate + (length % (position - candidate))] === text[position + length]) {
          length += 1;
        }
        if (length > bestLength) {
          bestLength = length;
          bestDistance = position - candidate;
        }
      }
      if (bestLength >= 2) {
        tokens.push({ distance: bestDistance, length: bestLength, literal: "" });
        frames.push({ position: position, windowStart: start, matchStart: position - bestDistance,
          matchLength: bestLength, token: tokens.at(-1), tokens: tokens.slice(), finished: false });
        position += bestLength;
      } else {
        tokens.push({ distance: 0, length: 0, literal: text[position] });
        frames.push({ position: position, windowStart: start, matchStart: position,
          matchLength: 1, token: tokens.at(-1), tokens: tokens.slice(), finished: false });
        position += 1;
      }
    }
    frames.push({ position: text.length, windowStart: Math.max(0, text.length - windowSize),
      matchStart: text.length, matchLength: 0, token: null, tokens: tokens.slice(), finished: true });
    return freeze({ tokens: tokens, frames: frames });
  }

  function entropy(rawText) {
    return frequencies(rawText).reduce(function (sum, entry) {
      return sum - entry.probability * Math.log2(entry.probability);
    }, 0);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "huffman";
    const text = settings.text || "абракадабра";
    let frames;
    if (mode === "huffman") frames = huffman(text).frames;
    else if (mode === "arithmetic") frames = arithmeticFrames(text);
    else if (mode === "lz77") frames = lz77(text, settings.window, settings.lookahead).frames;
    else throw new RangeError("Неизвестный метод сжатия.");
    return freeze({ mode: mode, text: text, options: Object.assign({}, settings),
      frames: frames, index: 0, frame: frames[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ mode: state.mode, text: state.text, options: state.options,
      frames: state.frames, index: index, frame: state.frames[index] });
  }

  return freeze({ frequencies: frequencies, huffman: huffman,
    arithmeticFrames: arithmeticFrames, lz77: lz77, entropy: entropy,
    fraction: fraction, createState: createState, step: step });
});
