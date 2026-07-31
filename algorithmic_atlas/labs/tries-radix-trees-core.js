(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TriesRadixTreesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_WORDS = 9;
  const MAX_WORD_LENGTH = 16;

  function parseWords(rawValue) {
    const values = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue === undefined ? "дом,дома,домен,кот,код" : rawValue)
        .split(/[\s,;]+/u);
    const words = values.map(function (value) {
      return String(value).trim().normalize("NFC").toLocaleLowerCase("ru-RU");
    }).filter(Boolean);
    if (words.length < 2 || words.length > MAX_WORDS) {
      throw new RangeError("нужно от 2 до " + MAX_WORDS + " разных ключей");
    }
    const seen = new Set();
    words.forEach(function (word) {
      if (Array.from(word).length > MAX_WORD_LENGTH || !/^[\p{L}\p{N}-]+$/u.test(word)) {
        throw new RangeError("ключи содержат только буквы, цифры и дефис и имеют длину до " + MAX_WORD_LENGTH);
      }
      if (seen.has(word)) throw new Error("ключи не должны повторяться");
      seen.add(word);
    });
    return Object.freeze(words.slice());
  }

  function emptyTrie() {
    return {
      rootId: 0,
      nextId: 1,
      nodes: [{ id: 0, terminal: false, children: Object.create(null) }],
    };
  }

  function cloneTrie(trie) {
    return {
      rootId: trie.rootId,
      nextId: trie.nextId,
      nodes: trie.nodes.map(function (node) {
        return {
          id: node.id,
          terminal: node.terminal,
          children: Object.assign(Object.create(null), node.children),
        };
      }),
    };
  }

  function nodeById(trie, id) {
    const node = trie.nodes.find(function (item) { return item.id === id; });
    shared.assert(node, "неизвестная вершина trie");
    return node;
  }

  function plainModel(trie, activeIds, label, insertedWords) {
    const edges = [];
    trie.nodes.forEach(function (node) {
      Object.keys(node.children).sort().forEach(function (character) {
        edges.push({ source: node.id, target: node.children[character], label: character });
      });
    });
    return shared.deepFreeze({
      kind: "trie",
      label: label,
      rootId: trie.rootId,
      nodes: trie.nodes.map(function (node) {
        return { id: node.id, terminal: node.terminal };
      }),
      edges: edges,
      activeIds: activeIds.slice(),
      insertedWords: insertedWords.slice(),
      logicalCharacters: edges.length,
      storedEdges: edges.length,
      schematic: trie.nodes.length > 42,
    });
  }

  function insertFrames(words) {
    const trie = emptyTrie();
    const frames = [plainModel(trie, [0], "Пустой корень", [])];
    const inserted = [];
    words.forEach(function (word) {
      let currentId = trie.rootId;
      const active = [currentId];
      Array.from(word).forEach(function (character, characterIndex) {
        const current = nodeById(trie, currentId);
        let nextId = current.children[character];
        let operation;
        if (nextId === undefined) {
          nextId = trie.nextId;
          trie.nextId += 1;
          current.children[character] = nextId;
          trie.nodes.push({ id: nextId, terminal: false, children: Object.create(null) });
          operation = "Создано ребро «" + character + "»";
        } else {
          operation = "Общий префикс уже хранит «" + character + "»";
        }
        currentId = nextId;
        active.push(currentId);
        frames.push(plainModel(
          trie,
          active,
          operation + " для ключа «" + word + "» · символ " + (characterIndex + 1),
          inserted
        ));
      });
      nodeById(trie, currentId).terminal = true;
      inserted.push(word);
      frames.push(plainModel(
        trie,
        active,
        "Конец ключа «" + word + "» отмечен отдельно от его потомков",
        inserted
      ));
    });
    return { trie: cloneTrie(trie), frames: frames };
  }

  function compressedModel(trie, words) {
    const nodes = [];
    const edges = [];
    const visibleIds = new Set([trie.rootId]);

    function walk(sourceId) {
      const source = nodeById(trie, sourceId);
      Object.keys(source.children).sort().forEach(function (firstCharacter) {
        let label = firstCharacter;
        let targetId = source.children[firstCharacter];
        let target = nodeById(trie, targetId);
        while (!target.terminal && Object.keys(target.children).length === 1) {
          const nextCharacter = Object.keys(target.children)[0];
          label += nextCharacter;
          targetId = target.children[nextCharacter];
          target = nodeById(trie, targetId);
        }
        visibleIds.add(targetId);
        edges.push({ source: sourceId, target: targetId, label: label });
        walk(targetId);
      });
    }
    walk(trie.rootId);
    Array.from(visibleIds).sort(function (a, b) { return a - b; }).forEach(function (id) {
      const node = nodeById(trie, id);
      nodes.push({ id: id, terminal: node.terminal });
    });
    return shared.deepFreeze({
      kind: "radix",
      label: "Цепочки вершин с единственным потомком сжаты в подписи рёбер",
      rootId: trie.rootId,
      nodes: nodes,
      edges: edges,
      activeIds: nodes.map(function (node) { return node.id; }),
      insertedWords: words.slice(),
      logicalCharacters: edges.reduce(function (sum, edge) {
        return sum + Array.from(edge.label).length;
      }, 0),
      storedEdges: edges.length,
      schematic: false,
    });
  }

  function contains(model, rawWord) {
    const word = String(rawWord).normalize("NFC").toLocaleLowerCase("ru-RU");
    const outgoing = new Map();
    model.edges.forEach(function (edge) {
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      outgoing.get(edge.source).push(edge);
    });
    let nodeId = model.rootId;
    let offset = 0;
    while (offset < word.length) {
      const edges = outgoing.get(nodeId) || [];
      const edge = edges.find(function (candidate) {
        return word.slice(offset, offset + candidate.label.length) === candidate.label;
      });
      if (!edge) return false;
      offset += edge.label.length;
      nodeId = edge.target;
    }
    const node = model.nodes.find(function (item) { return item.id === nodeId; });
    return Boolean(node && node.terminal);
  }

  function createState(options) {
    const words = parseWords(options && options.words);
    const built = insertFrames(words);
    const compressed = compressedModel(built.trie, words);
    const frames = built.frames.concat([compressed]);
    return shared.deepFreeze({ words: words, frames: frames, frameIndex: 0 });
  }

  function step(state) {
    return shared.deepFreeze({
      words: state.words,
      frames: state.frames,
      frameIndex: Math.min(state.frames.length - 1, state.frameIndex + 1),
    });
  }

  function isFinished(state) {
    return state.frameIndex >= state.frames.length - 1;
  }

  function currentFrame(state) {
    return state.frames[state.frameIndex];
  }

  return {
    MAX_WORDS: MAX_WORDS,
    MAX_WORD_LENGTH: MAX_WORD_LENGTH,
    parseWords: parseWords,
    insertFrames: insertFrames,
    compressedModel: compressedModel,
    contains: contains,
    createState: createState,
    step: step,
    isFinished: isFinished,
    currentFrame: currentFrame,
  };
});
