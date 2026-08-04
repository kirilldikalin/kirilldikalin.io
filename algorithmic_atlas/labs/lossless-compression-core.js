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
    if (!queue.length) {
      frames.push({ left: null, right: null, parent: null, queue: [], finished: true });
      return freeze({ root: null, codes: Object.create(null), frames: frames, encoded: "" });
    }
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

  function intervalProjection(low, high, rawUnits) {
    const units = Number(rawUnits);
    if (!Number.isSafeInteger(units) || units < 1 || units > 1000000) {
      throw new RangeError("Разрешение интервала вне допустимого диапазона.");
    }
    if (!low || !high || low.denominator <= 0n || high.denominator <= 0n ||
        low.numerator < 0n || high.numerator < 0n) {
      throw new RangeError("Некорректные границы интервала.");
    }
    const width = subtract(high, low);
    if (width.numerator <= 0n) throw new RangeError("Интервал должен иметь положительную ширину.");
    const scale = BigInt(units);
    const start = low.numerator * scale / low.denominator;
    const endNumerator = high.numerator * scale;
    const end = (endNumerator + high.denominator - 1n) / high.denominator;
    return freeze({ start: Number(start), end: Number(end),
      pixelWidth: Math.max(1, Number(end - start)),
      underResolution: width.numerator * scale < width.denominator,
      width: width });
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
        tokens.push({ offset: bestDistance, length: bestLength,
          nextSymbol: text[position + bestLength] || "" });
        frames.push({ position: position, windowStart: start, matchStart: position - bestDistance,
          matchLength: bestLength, sourceStart: position - bestDistance,
          sourceLength: Math.min(bestLength, bestDistance), targetStart: position,
          targetLength: bestLength, overlap: bestLength > bestDistance,
          token: tokens.at(-1), tokens: tokens.slice(), finished: false });
        position += bestLength + (tokens.at(-1).nextSymbol ? 1 : 0);
      } else {
        tokens.push({ offset: 0, length: 0, nextSymbol: text[position] });
        frames.push({ position: position, windowStart: start, matchStart: position,
          matchLength: 0, sourceStart: position, sourceLength: 0,
          targetStart: position, targetLength: 0, overlap: false,
          token: tokens.at(-1), tokens: tokens.slice(), finished: false });
        position += 1;
      }
    }
    frames.push({ position: text.length, windowStart: Math.max(0, text.length - windowSize),
      matchStart: text.length, matchLength: 0, sourceStart: text.length, sourceLength: 0,
      targetStart: text.length, targetLength: 0, overlap: false,
      token: null, tokens: tokens.slice(), finished: true });
    return freeze({ tokens: tokens, frames: frames });
  }

  function decodeLz77(rawTokens) {
    const tokens = Array.from(rawTokens || []);
    const output = [];
    tokens.forEach(function (token) {
      if (!token || !Number.isInteger(token.offset) || !Number.isInteger(token.length) ||
          token.offset < 0 || token.length < 0 ||
          (token.length > 0 && (token.offset < 1 || token.offset > output.length))) {
        throw new RangeError("Некорректная тройка LZ77.");
      }
      if (token.length === 0 && token.offset !== 0) throw new RangeError("Некорректная тройка LZ77.");
      for (let index = 0; index < token.length; index += 1) {
        output.push(output[output.length - token.offset]);
      }
      const next = Array.from(String(token.nextSymbol === undefined ? "" : token.nextSymbol));
      if (next.length > 1) throw new RangeError("nextSymbol должен содержать не больше одного символа.");
      if (token.length === 0 && next.length === 0) throw new RangeError("Пустая тройка LZ77 недопустима.");
      if (next.length) output.push(next[0]);
    });
    return output.join("");
  }

  function lz78(rawText) {
    const text = chars(rawText, 500);
    const dictionary = [""];
    const indexByPhrase = new Map([["", 0]]);
    const tokens = [];
    const frames = [];
    let position = 0;
    while (position < text.length) {
      let length = 0;
      let phrase = "";
      let phraseIndex = 0;
      while (position + length < text.length) {
        const candidate = phrase + text[position + length];
        if (!indexByPhrase.has(candidate)) break;
        phrase = candidate;
        phraseIndex = indexByPhrase.get(candidate);
        length += 1;
      }
      const nextSymbol = position + length < text.length ? text[position + length] : "";
      const token = { index: phraseIndex, nextSymbol: nextSymbol };
      tokens.push(token);
      if (nextSymbol) {
        const newPhrase = phrase + nextSymbol;
        indexByPhrase.set(newPhrase, dictionary.length);
        dictionary.push(newPhrase);
      }
      frames.push({ position: position, phraseIndex: phraseIndex, phrase: phrase,
        nextSymbol: nextSymbol, token: token, dictionary: dictionary.slice(),
        tokens: tokens.slice(), finished: false });
      position += length + (nextSymbol ? 1 : 0);
    }
    frames.push({ position: text.length, phraseIndex: 0, phrase: "", nextSymbol: "",
      token: null, dictionary: dictionary.slice(), tokens: tokens.slice(), finished: true });
    return freeze({ dictionary: dictionary, tokens: tokens, frames: frames });
  }

  function decodeLz78(rawTokens) {
    const dictionary = [""];
    const output = [];
    Array.from(rawTokens || []).forEach(function (token) {
      if (!token || !Number.isInteger(token.index) || token.index < 0 ||
          token.index >= dictionary.length) {
        throw new RangeError("Некорректная ссылка LZ78.");
      }
      const next = Array.from(String(token.nextSymbol === undefined ? "" : token.nextSymbol));
      if (next.length > 1) throw new RangeError("nextSymbol должен содержать не больше одного символа.");
      const phrase = dictionary[token.index] + (next[0] || "");
      if (!phrase) throw new RangeError("Пустой токен LZ78 недопустим.");
      output.push.apply(output, Array.from(phrase));
      if (next.length) dictionary.push(phrase);
    });
    return output.join("");
  }

  function lz78Layout(entryCount) {
    const count = Number(entryCount);
    if (!Number.isInteger(count) || count < 0 || count > 500) {
      throw new RangeError("Размер словаря LZ78 вне допустимого диапазона.");
    }
    const rows = Math.ceil(count / 5);
    const lastCardBottom = rows ? 195 + (rows - 1) * 72 + 52 : 195;
    const tokenY = Math.max(300, lastCardBottom + 38);
    return freeze({ rows: rows, tokenY: tokenY, height: Math.max(560, tokenY + 52) });
  }

  function entropy(rawText) {
    return frequencies(rawText).reduce(function (sum, entry) {
      return sum - entry.probability * Math.log2(entry.probability);
    }, 0);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "huffman";
    const text = settings.text === undefined ? "абракадабра" : settings.text;
    let frames;
    if (mode === "huffman") frames = huffman(text).frames;
    else if (mode === "arithmetic") frames = arithmeticFrames(text);
    else if (mode === "lz77") frames = lz77(text, settings.window, settings.lookahead).frames;
    else if (mode === "lz78") frames = lz78(text).frames;
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
    arithmeticFrames: arithmeticFrames, lz77: lz77, decodeLz77: decodeLz77,
    lz78: lz78, decodeLz78: decodeLz78, entropy: entropy,
    fraction: fraction, intervalProjection: intervalProjection, lz78Layout: lz78Layout,
    createState: createState, step: step });
});
