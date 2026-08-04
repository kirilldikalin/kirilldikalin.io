(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StringHashingMultiplePatternsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function toChars(value, label, maximum) {
    const result = Array.from(String(value === undefined ? "" : value));
    if (result.length > maximum) throw new RangeError(label + " слишком длинная.");
    return result;
  }

  function integer(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(label + " должно быть целым числом от " + minimum + " до " + maximum + ".");
    }
    return number;
  }

  function modPow(base, exponent, modulus) {
    let b = BigInt(base) % BigInt(modulus);
    let e = BigInt(exponent);
    const m = BigInt(modulus);
    if (m <= 1n || e < 0n) throw new RangeError("Некорректные параметры модульной степени.");
    let result = 1n;
    while (e > 0n) {
      if (e & 1n) result = result * b % m;
      b = b * b % m;
      e >>= 1n;
    }
    return result;
  }

  function code(symbol) {
    return BigInt(symbol.codePointAt(0) + 1);
  }

  function hash(chars, base, modulus) {
    const b = BigInt(base);
    const m = BigInt(modulus);
    let value = 0n;
    chars.forEach(function (symbol) { value = (value * b + code(symbol)) % m; });
    return value;
  }

  function rollingHashFrames(rawText, rawPattern, rawBase, rawModulus) {
    const text = toChars(rawText, "Строка", 180);
    const pattern = toChars(rawPattern, "Образец", 48);
    if (!pattern.length) throw new RangeError("Образец не должен быть пустым.");
    const base = integer(rawBase === undefined ? 257 : rawBase, "Основание", 2, 1000000);
    const modulus = integer(rawModulus === undefined ? 1000003 : rawModulus,
      "Модуль", 3, 2147483647);
    const target = hash(pattern, base, modulus);
    const frames = [];
    const matches = [];
    const collisions = [];
    if (pattern.length > text.length) {
      return freeze([{ start: 0, end: 0, hash: 0n, targetHash: target,
        verified: false, collision: false, matches: [], collisions: [], finished: true }]);
    }
    const power = modPow(BigInt(base), BigInt(pattern.length - 1), BigInt(modulus));
    let current = hash(text.slice(0, pattern.length), base, modulus);
    for (let start = 0; start <= text.length - pattern.length; start += 1) {
      const sameHash = current === target;
      const verified = sameHash && text.slice(start, start + pattern.length).every(function (symbol, index) {
        return symbol === pattern[index];
      });
      if (verified) matches.push(start);
      if (sameHash && !verified) collisions.push(start);
      frames.push({ start: start, end: start + pattern.length, hash: current,
        targetHash: target, sameHash: sameHash, verified: verified,
        collision: sameHash && !verified, matches: matches.slice(),
        collisions: collisions.slice(), power: power, finished: false });
      if (start < text.length - pattern.length) {
        current = (current - code(text[start]) * power) % BigInt(modulus);
        if (current < 0n) current += BigInt(modulus);
        current = (current * BigInt(base) + code(text[start + pattern.length])) % BigInt(modulus);
      }
    }
    frames.push(Object.assign({}, frames.at(-1), { finished: true }));
    return freeze(frames);
  }

  function buildAutomaton(rawPatterns) {
    const patterns = (rawPatterns || []).map(function (value) {
      return toChars(value, "Образец", 40);
    });
    if (!patterns.length || patterns.some(function (pattern) { return !pattern.length; })) {
      throw new RangeError("Нужен хотя бы один непустой образец.");
    }
    if (patterns.length > 24) throw new RangeError("Допустимо не больше 24 образцов.");
    const nodes = [{ id: 0, next: Object.create(null), failure: 0, outputs: [] }];
    patterns.forEach(function (pattern, patternIndex) {
      let state = 0;
      pattern.forEach(function (symbol) {
        if (nodes[state].next[symbol] === undefined) {
          nodes[state].next[symbol] = nodes.length;
          nodes.push({ id: nodes.length, next: Object.create(null), failure: 0, outputs: [] });
        }
        state = nodes[state].next[symbol];
      });
      nodes[state].outputs.push(patternIndex);
    });
    const queue = [];
    Object.keys(nodes[0].next).forEach(function (symbol) {
      queue.push(nodes[0].next[symbol]);
    });
    for (let head = 0; head < queue.length; head += 1) {
      const state = queue[head];
      Object.keys(nodes[state].next).forEach(function (symbol) {
        const target = nodes[state].next[symbol];
        queue.push(target);
        let fallback = nodes[state].failure;
        while (fallback && nodes[fallback].next[symbol] === undefined) {
          fallback = nodes[fallback].failure;
        }
        if (nodes[fallback].next[symbol] !== undefined && nodes[fallback].next[symbol] !== target) {
          fallback = nodes[fallback].next[symbol];
        }
        nodes[target].failure = fallback;
        nodes[target].outputs = nodes[target].outputs.concat(nodes[fallback].outputs);
      });
    }
    return freeze({ patterns: patterns.map(function (pattern) { return pattern.join(""); }), nodes: nodes });
  }

  function ahoCorasickFrames(rawText, rawPatterns) {
    const text = toChars(rawText, "Строка", 180);
    const automaton = buildAutomaton(rawPatterns);
    const frames = [];
    const matches = [];
    let state = 0;
    text.forEach(function (symbol, index) {
      const fallbackPath = [];
      while (state && automaton.nodes[state].next[symbol] === undefined) {
        fallbackPath.push(state);
        state = automaton.nodes[state].failure;
      }
      if (automaton.nodes[state].next[symbol] !== undefined) {
        state = automaton.nodes[state].next[symbol];
      }
      automaton.nodes[state].outputs.forEach(function (patternIndex) {
        const pattern = automaton.patterns[patternIndex];
        matches.push({ pattern: pattern, start: index - Array.from(pattern).length + 1, end: index + 1 });
      });
      frames.push({ textIndex: index, symbol: symbol, state: state,
        fallbackPath: fallbackPath, outputs: automaton.nodes[state].outputs.slice(),
        matches: matches.slice(), finished: false });
    });
    frames.push({ textIndex: text.length, symbol: "", state: state, fallbackPath: [],
      outputs: [], matches: matches.slice(), finished: true });
    return freeze({ automaton: automaton, frames: frames });
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "rolling";
    let trace;
    if (mode === "rolling") {
      trace = rollingHashFrames(settings.text === undefined ? "абракадабра" : settings.text,
        settings.pattern === undefined ? "абра" : settings.pattern,
        settings.base, settings.modulus);
    } else if (mode === "aho") {
      trace = ahoCorasickFrames(settings.text === undefined ? "абракадабра" : settings.text,
        settings.patterns === undefined ? ["абра", "када", "бра"] : settings.patterns).frames;
    } else throw new RangeError("Неизвестный режим строковой лаборатории.");
    return freeze({ mode: mode, options: Object.assign({}, settings), frames: trace,
      index: 0, frame: trace[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ mode: state.mode, options: state.options, frames: state.frames,
      index: index, frame: state.frames[index] });
  }

  return freeze({ modPow: modPow, hash: hash, rollingHashFrames: rollingHashFrames,
    buildAutomaton: buildAutomaton, ahoCorasickFrames: ahoCorasickFrames,
    createState: createState, step: step });
});
