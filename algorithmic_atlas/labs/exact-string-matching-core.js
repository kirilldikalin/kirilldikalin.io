(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ExactStringMatchingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function chars(value, label, maximum) {
    const result = Array.isArray(value)
      ? value.slice()
      : Array.from(String(value === undefined ? "" : value));
    if (result.length > maximum) {
      throw new RangeError(label + " должна содержать не больше " + maximum + " символов.");
    }
    return result;
  }

  function validateInput(text, pattern) {
    const source = chars(text, "Строка", 160);
    const needle = chars(pattern, "Образец", 48);
    if (!needle.length) throw new RangeError("Образец не должен быть пустым.");
    return { text: source, pattern: needle };
  }

  function prefixFunction(rawPattern) {
    const pattern = chars(rawPattern, "Образец", 10000);
    const pi = Array(pattern.length).fill(0);
    for (let index = 1; index < pattern.length; index += 1) {
      let border = pi[index - 1];
      while (border > 0 && pattern[index] !== pattern[border]) border = pi[border - 1];
      if (pattern[index] === pattern[border]) border += 1;
      pi[index] = border;
    }
    return pi;
  }

  function prefixFrames(rawPattern) {
    const pattern = chars(rawPattern, "Образец", 48);
    if (!pattern.length) throw new RangeError("Образец не должен быть пустым.");
    const pi = Array(pattern.length).fill(0);
    const frames = [{ patternIndex: 0, candidateIndex: 0, matched: 0,
      fallback: null, action: "prefix-base", pi: pi.slice(), matches: [],
      comparisons: 0, finished: false }];
    let comparisons = 0;
    for (let index = 1; index < pattern.length; index += 1) {
      let border = pi[index - 1];
      while (border > 0 && pattern[index] !== pattern[border]) {
        comparisons += 1;
        frames.push({ patternIndex: index, candidateIndex: border, matched: border,
          fallback: pi[border - 1], action: "prefix-fallback", pi: pi.slice(),
          matches: [], comparisons: comparisons, finished: false });
        border = pi[border - 1];
      }
      comparisons += 1;
      const equal = pattern[index] === pattern[border];
      if (equal) border += 1;
      pi[index] = border;
      frames.push({ patternIndex: index,
        candidateIndex: equal ? border - 1 : border,
        matched: border, fallback: null,
        action: equal ? "prefix-extend" : "prefix-zero", pi: pi.slice(),
        matches: [], comparisons: comparisons, finished: false });
    }
    frames.push({ patternIndex: pattern.length, candidateIndex: 0,
      matched: pi.at(-1) || 0, fallback: null, action: "done", pi: pi.slice(),
      matches: [], comparisons: comparisons, finished: true });
    return freeze(frames);
  }

  function zFunction(rawValue) {
    const value = chars(rawValue, "Строка", 10000);
    const z = Array(value.length).fill(0);
    let left = 0;
    let right = 0;
    for (let index = 1; index < value.length; index += 1) {
      if (index <= right) z[index] = Math.min(right - index + 1, z[index - left]);
      while (index + z[index] < value.length && value[z[index]] === value[index + z[index]]) {
        z[index] += 1;
      }
      if (index + z[index] - 1 > right) {
        left = index;
        right = index + z[index] - 1;
      }
    }
    if (value.length) z[0] = value.length;
    return z;
  }

  function naiveFrames(rawText, rawPattern) {
    const input = validateInput(rawText, rawPattern);
    const frames = [];
    const matches = [];
    if (input.pattern.length > input.text.length) {
      frames.push({ alignment: 0, patternIndex: 0, textIndex: 0, action: "too-long",
        matches: [], comparisons: 0, finished: true });
      return freeze(frames);
    }
    let comparisons = 0;
    for (let alignment = 0; alignment <= input.text.length - input.pattern.length; alignment += 1) {
      let offset = 0;
      while (offset < input.pattern.length) {
        comparisons += 1;
        const equal = input.text[alignment + offset] === input.pattern[offset];
        frames.push({ alignment: alignment, patternIndex: offset,
          textIndex: alignment + offset, action: equal ? "equal" : "mismatch",
          matches: matches.slice(), comparisons: comparisons, finished: false });
        if (!equal) break;
        offset += 1;
      }
      if (offset === input.pattern.length) {
        matches.push(alignment);
        frames.push({ alignment: alignment, patternIndex: input.pattern.length - 1,
          textIndex: alignment + input.pattern.length - 1, action: "match",
          matches: matches.slice(), comparisons: comparisons, finished: false });
      }
    }
    frames.push({ alignment: Math.max(0, input.text.length - input.pattern.length),
      patternIndex: 0, textIndex: input.text.length, action: "done", matches: matches.slice(),
      comparisons: comparisons, finished: true });
    return freeze(frames);
  }

  function kmpFrames(rawText, rawPattern) {
    const input = validateInput(rawText, rawPattern);
    const pi = prefixFunction(input.pattern);
    const frames = [];
    const matches = [];
    let matched = 0;
    let comparisons = 0;
    input.text.forEach(function (symbol, index) {
      while (matched > 0 && symbol !== input.pattern[matched]) {
        comparisons += 1;
        frames.push({ textIndex: index, patternIndex: matched, matched: matched,
          fallback: pi[matched - 1], action: "fallback", matches: matches.slice(),
          comparisons: comparisons, pi: pi.slice(), finished: false });
        matched = pi[matched - 1];
      }
      comparisons += 1;
      if (symbol === input.pattern[matched]) {
        matched += 1;
        frames.push({ textIndex: index, patternIndex: matched - 1, matched: matched,
          fallback: null, action: "advance", matches: matches.slice(), comparisons: comparisons,
          pi: pi.slice(), finished: false });
      } else {
        frames.push({ textIndex: index, patternIndex: matched, matched: matched,
          fallback: null, action: "mismatch", matches: matches.slice(), comparisons: comparisons,
          pi: pi.slice(), finished: false });
      }
      if (matched === input.pattern.length) {
        matches.push(index - input.pattern.length + 1);
        frames.push({ textIndex: index, patternIndex: matched - 1, matched: matched,
          fallback: pi[matched - 1], action: "match", matches: matches.slice(),
          comparisons: comparisons, pi: pi.slice(), finished: false });
        matched = pi[matched - 1];
      }
    });
    frames.push({ textIndex: input.text.length, patternIndex: matched, matched: matched,
      fallback: null, action: "done", matches: matches.slice(), comparisons: comparisons,
      pi: pi.slice(), finished: true });
    return freeze(frames);
  }

  function zFrames(rawText, rawPattern) {
    const input = validateInput(rawText, rawPattern);
    const separator = "\u0000";
    if (input.text.includes(separator) || input.pattern.includes(separator)) {
      throw new RangeError("Нулевой символ зарезервирован как разделитель.");
    }
    const combined = input.pattern.concat([separator], input.text);
    const z = Array(combined.length).fill(0);
    if (combined.length) z[0] = combined.length;
    const matches = [];
    const frames = [];
    const textOffset = input.pattern.length + 1;
    let left = 0;
    let right = 0;
    let comparisons = 0;

    function pushFrame(index, patternIndex, action) {
      const comparedIndex = index + patternIndex;
      frames.push({ combinedIndex: index,
        textIndex: comparedIndex >= textOffset ? comparedIndex - textOffset : -1,
        patternIndex: patternIndex, zValue: z[index], left: left, right: right,
        action: action, matches: matches.slice(), comparisons: comparisons,
        z: z.slice(), finished: false });
    }

    for (let index = 1; index < combined.length; index += 1) {
      if (index <= right) {
        z[index] = Math.min(right - index + 1, z[index - left]);
        pushFrame(index, 0, "z-copy");
      }
      while (index + z[index] < combined.length) {
        const patternIndex = z[index];
        comparisons += 1;
        if (combined[patternIndex] !== combined[index + patternIndex]) {
          pushFrame(index, patternIndex, "z-mismatch");
          break;
        }
        z[index] += 1;
        pushFrame(index, patternIndex, "z-extend");
      }
      if (index + z[index] - 1 > right) {
        left = index;
        right = index + z[index] - 1;
      }
      if (index >= textOffset) {
        if (z[index] >= input.pattern.length) matches.push(index - textOffset);
        pushFrame(index, 0, z[index] >= input.pattern.length ? "match" : "inspect");
      }
    }
    frames.push({ textIndex: input.text.length, patternIndex: 0, zValue: 0,
      left: left, right: right, action: "done", matches: matches.slice(),
      comparisons: comparisons, z: z.slice(), finished: true });
    return freeze(frames);
  }

  function frames(algorithm, text, pattern) {
    if (algorithm === "naive") return naiveFrames(text, pattern);
    if (algorithm === "prefix") return prefixFrames(pattern);
    if (algorithm === "kmp") return kmpFrames(text, pattern);
    if (algorithm === "z") return zFrames(text, pattern);
    throw new RangeError("Неизвестный алгоритм точного поиска.");
  }

  function createState(options) {
    const settings = options || {};
    const algorithm = settings.algorithm || "kmp";
    const text = settings.text === undefined ? "абракадабра" : settings.text;
    const pattern = settings.pattern === undefined ? "абра" : settings.pattern;
    const input = validateInput(text, pattern);
    const trace = frames(algorithm, input.text, input.pattern);
    return freeze({ algorithm: algorithm, text: input.text.join(""), pattern: input.pattern.join(""),
      frames: trace, index: 0, frame: trace[0] });
  }

  function step(state) {
    if (!state || !state.frames) throw new TypeError("Состояние поиска повреждено.");
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ algorithm: state.algorithm, text: state.text, pattern: state.pattern,
      frames: state.frames, index: index, frame: state.frames[index] });
  }

  return freeze({ prefixFunction: prefixFunction, prefixFrames: prefixFrames,
    zFunction: zFunction,
    naiveFrames: naiveFrames, kmpFrames: kmpFrames, zFrames: zFrames,
    createState: createState, step: step });
});
