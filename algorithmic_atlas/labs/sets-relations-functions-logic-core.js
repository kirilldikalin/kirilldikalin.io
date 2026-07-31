(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js") : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SetsRelationsFunctionsLogicCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  function uniqueValues(values, label) {
    if (!Array.isArray(values) || values.length > 8) {
      throw new RangeError((label || "set") + " must contain at most eight elements");
    }
    const normalized = values.map(String);
    if (new Set(normalized).size !== normalized.length) {
      throw new Error((label || "set") + " contains duplicate elements");
    }
    return normalized;
  }

  function normalizedPairs(leftSet, rightSet, pairs) {
    const seen = new Set();
    return pairs.map(function (pair) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("each relation pair must have two elements");
      }
      const left = String(pair[0]);
      const right = String(pair[1]);
      if (!leftSet.includes(left) || !rightSet.includes(right)) {
        throw new Error("relation pair refers to an element outside its sets");
      }
      const key = left + "\u0000" + right;
      if (seen.has(key)) throw new Error("duplicate relation pair: " + left + "," + right);
      seen.add(key);
      return [left, right];
    });
  }

  function mappingProperties(domainValues, codomainValues, rawPairs) {
    const domain = uniqueValues(domainValues, "domain");
    const codomain = uniqueValues(codomainValues, "codomain");
    const pairs = normalizedPairs(domain, codomain, rawPairs || []);
    const images = new Map(domain.map(function (value) { return [value, []]; }));
    pairs.forEach(function (pair) { images.get(pair[0]).push(pair[1]); });
    const missing = domain.filter(function (value) { return images.get(value).length === 0; });
    const multiple = domain.filter(function (value) { return images.get(value).length > 1; });
    const isFunction = missing.length === 0 && multiple.length === 0;
    const preimages = new Map(codomain.map(function (value) { return [value, []]; }));
    pairs.forEach(function (pair) { preimages.get(pair[1]).push(pair[0]); });
    const collisions = codomain.filter(function (value) { return preimages.get(value).length > 1; });
    const uncovered = codomain.filter(function (value) { return preimages.get(value).length === 0; });
    return shared.deepFreeze({
      domain: domain,
      codomain: codomain,
      pairs: pairs,
      isFunction: isFunction,
      missing: missing,
      multiple: multiple,
      injective: isFunction && collisions.length === 0,
      surjective: isFunction && uncovered.length === 0,
      bijective: isFunction && collisions.length === 0 && uncovered.length === 0,
      collisions: collisions,
      uncovered: uncovered,
    });
  }

  function relationProperties(rawElements, rawPairs) {
    const elements = uniqueValues(rawElements, "set");
    const pairs = normalizedPairs(elements, elements, rawPairs || []);
    const relation = new Set(pairs.map(function (pair) { return pair[0] + "\u0000" + pair[1]; }));
    const has = function (left, right) { return relation.has(left + "\u0000" + right); };
    const missingReflexive = elements.find(function (value) { return !has(value, value); });
    let symmetricWitness = null;
    let antisymmetricWitness = null;
    let transitiveWitness = null;
    let incomparableWitness = null;
    pairs.forEach(function (pair) {
      if (!symmetricWitness && !has(pair[1], pair[0])) symmetricWitness = pair;
      if (!antisymmetricWitness && pair[0] !== pair[1] && has(pair[1], pair[0])) antisymmetricWitness = pair;
    });
    outer: for (const left of elements) {
      for (const middle of elements) {
        if (!has(left, middle)) continue;
        for (const right of elements) {
          if (has(middle, right) && !has(left, right)) {
            transitiveWitness = [left, middle, right];
            break outer;
          }
        }
      }
    }
    outerComparable: for (let i = 0; i < elements.length; i += 1) {
      for (let j = i + 1; j < elements.length; j += 1) {
        if (!has(elements[i], elements[j]) && !has(elements[j], elements[i])) {
          incomparableWitness = [elements[i], elements[j]];
          break outerComparable;
        }
      }
    }
    const reflexive = missingReflexive === undefined;
    const symmetric = symmetricWitness === null;
    const antisymmetric = antisymmetricWitness === null;
    const transitive = transitiveWitness === null;
    const equivalence = reflexive && symmetric && transitive;
    const partialOrder = reflexive && antisymmetric && transitive;
    return shared.deepFreeze({
      elements: elements,
      pairs: pairs,
      reflexive: reflexive,
      symmetric: symmetric,
      antisymmetric: antisymmetric,
      transitive: transitive,
      equivalence: equivalence,
      partialOrder: partialOrder,
      linearOrder: partialOrder && incomparableWitness === null,
      witnesses: {
        missingReflexive: missingReflexive === undefined ? null : missingReflexive,
        asymmetricPair: symmetricWitness,
        antisymmetryPair: antisymmetricWitness,
        transitivityTriple: transitiveWitness,
        incomparablePair: incomparableWitness,
      },
    });
  }

  function equivalenceClasses(rawElements, rawPairs) {
    const properties = relationProperties(rawElements, rawPairs);
    if (!properties.equivalence) throw new Error("relation is not an equivalence relation");
    const remaining = new Set(properties.elements);
    const pairSet = new Set(properties.pairs.map(function (pair) { return pair.join("\u0000"); }));
    const classes = [];
    while (remaining.size) {
      const representative = remaining.values().next().value;
      const members = properties.elements.filter(function (value) {
        return pairSet.has(representative + "\u0000" + value);
      });
      members.forEach(function (value) { remaining.delete(value); });
      classes.push(Object.freeze(members));
    }
    return Object.freeze(classes);
  }

  function hasseEdges(rawElements, rawPairs) {
    const properties = relationProperties(rawElements, rawPairs);
    if (!properties.partialOrder) throw new Error("relation is not a partial order");
    const has = new Set(properties.pairs.map(function (pair) { return pair.join("\u0000"); }));
    return Object.freeze(properties.pairs.filter(function (pair) {
      if (pair[0] === pair[1]) return false;
      return !properties.elements.some(function (middle) {
        return middle !== pair[0] && middle !== pair[1] &&
          has.has(pair[0] + "\u0000" + middle) &&
          has.has(middle + "\u0000" + pair[1]);
      });
    }).map(function (pair) { return Object.freeze(pair); }));
  }

  const PRESETS = Object.freeze([
    Object.freeze({ id: "mapping", label: "Отображение", mode: "mapping", domain: ["a", "b", "c"], codomain: ["1", "2", "3"], pairs: [["a", "1"], ["b", "2"], ["c", "2"]] }),
    Object.freeze({ id: "equivalence", label: "Классы по чётности", mode: "equivalence", elements: ["1", "2", "3", "4"], pairs: [["1", "1"], ["1", "3"], ["3", "1"], ["3", "3"], ["2", "2"], ["2", "4"], ["4", "2"], ["4", "4"]] }),
    Object.freeze({ id: "poset", label: "Делимость", mode: "poset", elements: ["1", "2", "3", "6"], pairs: [["1", "1"], ["2", "2"], ["3", "3"], ["6", "6"], ["1", "2"], ["1", "3"], ["1", "6"], ["2", "6"], ["3", "6"]] }),
    Object.freeze({ id: "violation", label: "Нарушение транзитивности", mode: "relation", elements: ["a", "b", "c"], pairs: [["a", "a"], ["b", "b"], ["c", "c"], ["a", "b"], ["b", "c"]] }),
  ]);

  function createState(rawIndex) {
    const index = shared.boundedInteger(rawIndex === undefined ? 0 : rawIndex, "preset", 0, PRESETS.length - 1);
    return Object.freeze({ presetIndex: index });
  }
  function step(state) { return createState(Math.min(PRESETS.length - 1, state.presetIndex + 1)); }
  function isFinished(state) { return state.presetIndex === PRESETS.length - 1; }

  return {
    PRESETS: PRESETS,
    mappingProperties: mappingProperties,
    relationProperties: relationProperties,
    equivalenceClasses: equivalenceClasses,
    hasseEdges: hasseEdges,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
