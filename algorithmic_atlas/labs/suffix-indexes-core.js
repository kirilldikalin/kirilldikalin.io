(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SuffixIndexesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function symbols(value, maximum) {
    const result = Array.from(String(value === undefined ? "" : value));
    if (result.length > maximum) throw new RangeError("Строка слишком длинная.");
    return result;
  }

  function compareSuffixes(text, left, right) {
    let offset = 0;
    while (left + offset < text.length && right + offset < text.length) {
      const comparison = text[left + offset].localeCompare(text[right + offset]);
      if (comparison !== 0) return comparison;
      offset += 1;
    }
    return (text.length - left) - (text.length - right);
  }

  function suffixArray(rawText) {
    const text = symbols(rawText, 5000);
    return Array.from({ length: text.length }, function (_, index) { return index; })
      .sort(function (left, right) { return compareSuffixes(text, left, right); });
  }

  function lcpArray(rawText, rawSuffixArray) {
    const text = symbols(rawText, 5000);
    const sa = rawSuffixArray ? rawSuffixArray.slice() : suffixArray(text.join(""));
    if (sa.length !== text.length || new Set(sa).size !== sa.length ||
        sa.some(function (value) { return !Number.isInteger(value) || value < 0 || value >= text.length; })) {
      throw new RangeError("Суффиксный массив не является перестановкой позиций.");
    }
    const rank = Array(text.length).fill(0);
    sa.forEach(function (position, index) { rank[position] = index; });
    const lcp = Array(text.length).fill(0);
    let length = 0;
    for (let position = 0; position < text.length; position += 1) {
      const rankIndex = rank[position];
      if (rankIndex === 0) continue;
      const previous = sa[rankIndex - 1];
      while (position + length < text.length && previous + length < text.length &&
          text[position + length] === text[previous + length]) length += 1;
      lcp[rankIndex] = length;
      if (length > 0) length -= 1;
    }
    return lcp;
  }

  function comparePrefix(text, start, pattern) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (start + index >= text.length) return -1;
      const comparison = text[start + index].localeCompare(pattern[index]);
      if (comparison !== 0) return comparison;
    }
    return 0;
  }

  function search(rawText, rawPattern, rawSuffixArray) {
    const text = symbols(rawText, 5000);
    const pattern = symbols(rawPattern, 500);
    if (!pattern.length) throw new RangeError("Образец не должен быть пустым.");
    const sa = rawSuffixArray ? rawSuffixArray.slice() : suffixArray(text.join(""));
    function lower(strictUpper) {
      let left = 0;
      let right = sa.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        const comparison = comparePrefix(text, sa[middle], pattern);
        if (comparison < 0 || (strictUpper && comparison === 0)) left = middle + 1;
        else right = middle;
      }
      return left;
    }
    const from = lower(false);
    const to = lower(true);
    return freeze({ from: from, to: to, positions: sa.slice(from, to).sort(function (a, b) { return a - b; }) });
  }

  function buildSuffixTrie(rawText) {
    const text = symbols(rawText, 80);
    const nodes = [{ id: 0, next: Object.create(null), suffixStarts: [] }];
    for (let start = 0; start < text.length; start += 1) {
      let state = 0;
      nodes[state].suffixStarts.push(start);
      for (let index = start; index < text.length; index += 1) {
        const symbol = text[index];
        if (nodes[state].next[symbol] === undefined) {
          nodes[state].next[symbol] = nodes.length;
          nodes.push({ id: nodes.length, next: Object.create(null), suffixStarts: [] });
        }
        state = nodes[state].next[symbol];
        nodes[state].suffixStarts.push(start);
      }
    }
    return freeze(nodes);
  }

  function buildSuffixAutomaton(rawText) {
    const text = symbols(rawText, 2000);
    const states = [{ id: 0, length: 0, link: -1, next: Object.create(null), terminal: false }];
    let last = 0;
    text.forEach(function (symbol) {
      const current = states.length;
      states.push({ id: current, length: states[last].length + 1, link: 0,
        next: Object.create(null), terminal: false });
      let pointer = last;
      while (pointer >= 0 && states[pointer].next[symbol] === undefined) {
        states[pointer].next[symbol] = current;
        pointer = states[pointer].link;
      }
      if (pointer < 0) {
        states[current].link = 0;
      } else {
        const target = states[pointer].next[symbol];
        if (states[pointer].length + 1 === states[target].length) {
          states[current].link = target;
        } else {
          const clone = states.length;
          states.push({ id: clone, length: states[pointer].length + 1,
            link: states[target].link, next: Object.assign(Object.create(null), states[target].next),
            terminal: false, clone: true });
          while (pointer >= 0 && states[pointer].next[symbol] === target) {
            states[pointer].next[symbol] = clone;
            pointer = states[pointer].link;
          }
          states[target].link = clone;
          states[current].link = clone;
        }
      }
      last = current;
    });
    for (let state = last; state > 0; state = states[state].link) states[state].terminal = true;
    return freeze(states);
  }

  function frames(rawText, mode) {
    const text = symbols(rawText, 80).join("");
    if (!text.length) throw new RangeError("Строка не должна быть пустой.");
    if (mode === "array") {
      const sa = suffixArray(text);
      const lcp = lcpArray(text, sa);
      return freeze(sa.map(function (start, index) {
        return { index: index, start: start, suffix: Array.from(text).slice(start).join(""),
          lcp: lcp[index], visible: index + 1, finished: false };
      }).concat([{ index: sa.length, start: null, suffix: "", lcp: 0,
        visible: sa.length, finished: true }]));
    }
    const structures = mode === "trie" ? buildSuffixTrie(text) : buildSuffixAutomaton(text);
    return freeze(structures.map(function (state, index) {
      return { index: index, visible: index + 1, state: state,
        structure: structures, finished: false };
    }).concat([{ index: structures.length, visible: structures.length,
      structure: structures, state: null, finished: true }]));
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "array";
    if (!["array", "trie", "automaton"].includes(mode)) throw new RangeError("Неизвестная структура суффиксов.");
    const trace = frames(settings.text || "банан", mode);
    return freeze({ mode: mode, text: settings.text || "банан", frames: trace,
      index: 0, frame: trace[0] });
  }

  function step(state) {
    const index = Math.min(state.index + 1, state.frames.length - 1);
    return freeze({ mode: state.mode, text: state.text, frames: state.frames,
      index: index, frame: state.frames[index] });
  }

  return freeze({ suffixArray: suffixArray, lcpArray: lcpArray, search: search,
    buildSuffixTrie: buildSuffixTrie, buildSuffixAutomaton: buildSuffixAutomaton,
    frames: frames, createState: createState, step: step });
});
