(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SelectionOrderStatisticsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_ITEMS = 15;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return value;
  }

  function parseArray(raw) {
    const parts = String(raw).split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 1 || parts.length > MAX_ITEMS) {
      throw new Error("Введите от 1 до " + MAX_ITEMS + " целых чисел.");
    }
    return parts.map(function (part) {
      if (!/^-?\d+$/.test(part)) throw new Error("Массив содержит нецелое значение.");
      const value = Number(part);
      if (!Number.isSafeInteger(value) || Math.abs(value) > 999) {
        throw new Error("Используйте целые числа от −999 до 999.");
      }
      return value;
    });
  }

  function rank(raw, length) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > length) {
      throw new Error("Ранг k должен лежать от 1 до длины массива.");
    }
    return value;
  }

  function seededRandom(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return function () {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state / 4294967296;
    };
  }

  function medianOfSmall(values, counter) {
    const copy = values.slice();
    for (let index = 1; index < copy.length; index += 1) {
      const key = copy[index];
      let position = index - 1;
      while (position >= 0) {
        counter.comparisons += 1;
        if (copy[position] <= key) break;
        copy[position + 1] = copy[position];
        position -= 1;
      }
      copy[position + 1] = key;
    }
    return copy[Math.floor(copy.length / 2)];
  }

  function medianOfMedians(values, counter, evidence) {
    if (values.length <= 5) {
      const pivot = medianOfSmall(values, counter);
      evidence.push({ groups: [values.slice()], medians: [pivot], pivot: pivot });
      return pivot;
    }
    const groups = [];
    const medians = [];
    for (let index = 0; index < values.length; index += 5) {
      const group = values.slice(index, index + 5);
      groups.push(group);
      medians.push(medianOfSmall(group, counter));
    }
    const level = { groups: groups, medians: medians, pivot: null };
    evidence.push(level);
    const pivot = medianOfMedians(medians, counter, evidence);
    level.pivot = pivot;
    return pivot;
  }

  function partitionThreeWay(values, pivot, counter) {
    const less = [];
    const equal = [];
    const greater = [];
    values.forEach(function (value) {
      counter.comparisons += 1;
      if (value < pivot) {
        less.push(value);
        return;
      }
      counter.comparisons += 1;
      if (value > pivot) greater.push(value);
      else equal.push(value);
    });
    return { less: less, equal: equal, greater: greater };
  }

  function guaranteedBfprtDiscard(n) {
    const completeGroups = Math.floor(n / 5);
    return Math.max(0, 3 * (Math.floor((completeGroups - 1) / 2)));
  }

  function selectionTrack(values, targetRank, policy, seed) {
    const random = seededRandom(seed);
    const counter = { comparisons: 0, partitions: 0 };
    let active = values.slice();
    let localRank = targetRank;
    let discarded = [];
    const frames = [{
      action: "start",
      active: active.slice(),
      discarded: [],
      rank: localRank,
      comparisons: 0,
      partitions: 0,
      message: "Ищем элемент ранга " + targetRank + " только внутри активного диапазона.",
    }];

    while (true) {
      if (active.length === 1) {
        frames.push({
          action: "done",
          active: active.slice(),
          discarded: discarded.slice(),
          rank: 1,
          result: active[0],
          comparisons: counter.comparisons,
          partitions: counter.partitions,
          message: "Остался единственный кандидат: " + active[0] + ".",
        });
        break;
      }
      const evidence = [];
      const pivot = policy === "bfprt"
        ? medianOfMedians(active, counter, evidence)
        : active[Math.floor(random() * active.length)];
      frames.push({
        action: "pivot",
        active: active.slice(),
        discarded: discarded.slice(),
        rank: localRank,
        pivot: pivot,
        groups: evidence.length ? evidence[0].groups : [],
        medians: evidence.length ? evidence[0].medians : [],
        guarantee: policy === "bfprt" ? guaranteedBfprtDiscard(active.length) : 0,
        comparisons: counter.comparisons,
        partitions: counter.partitions,
        message: policy === "bfprt"
          ? "Группы по пять дали медианы; их медиана стала pivot."
          : "Pivot выбран воспроизводимо из текущего диапазона.",
      });
      const partition = partitionThreeWay(active, pivot, counter);
      counter.partitions += 1;
      const before = active.slice();
      const lowerEnd = partition.less.length;
      const equalEnd = lowerEnd + partition.equal.length;
      let next;
      let nextRank;
      let newlyDiscarded;
      let result;
      if (localRank <= lowerEnd) {
        next = partition.less;
        nextRank = localRank;
        newlyDiscarded = partition.equal.concat(partition.greater);
      } else if (localRank <= equalEnd) {
        next = partition.equal;
        nextRank = 1;
        newlyDiscarded = partition.less.concat(partition.greater);
        result = pivot;
      } else {
        next = partition.greater;
        nextRank = localRank - equalEnd;
        newlyDiscarded = partition.less.concat(partition.equal);
      }
      discarded = discarded.concat(newlyDiscarded);
      frames.push({
        action: "partition",
        before: before,
        active: next.slice(),
        discarded: discarded.slice(),
        newlyDiscarded: newlyDiscarded.slice(),
        less: partition.less.slice(),
        equal: partition.equal.slice(),
        greater: partition.greater.slice(),
        rank: nextRank,
        pivot: pivot,
        result: result,
        comparisons: counter.comparisons,
        partitions: counter.partitions,
        message: result === undefined
          ? "Ранг лежит только в одной части; остальные элементы навсегда отброшены."
          : "Ранг попал в полосу элементов, равных pivot.",
      });
      if (result !== undefined) {
        frames.push({
          action: "done",
          active: next.slice(),
          discarded: discarded.slice(),
          rank: nextRank,
          result: result,
          comparisons: counter.comparisons,
          partitions: counter.partitions,
          message: "Найдена порядковая статистика: " + result + ".",
        });
        break;
      }
      active = next;
      localRank = nextRank;
    }
    return deepFreeze({
      policy: policy,
      input: values.slice(),
      targetRank: targetRank,
      frames: frames,
      result: frames[frames.length - 1].result,
    });
  }

  function comparisonScenario(rawValues, rawRank, seed) {
    const values = parseArray(rawValues);
    const targetRank = rank(rawRank, values.length);
    const random = selectionTrack(values, targetRank, "random", seed);
    const bfprt = selectionTrack(values, targetRank, "bfprt", seed);
    return deepFreeze({
      values: values,
      targetRank: targetRank,
      expected: values.slice().sort(function (a, b) { return a - b; })[targetRank - 1],
      random: random,
      bfprt: bfprt,
      frameCount: Math.max(random.frames.length, bfprt.frames.length),
    });
  }

  function simultaneousMinMax(rawValues) {
    const values = Array.isArray(rawValues) ? rawValues.slice() : parseArray(rawValues);
    if (!values.length) throw new Error("Нужен хотя бы один элемент.");
    let minimum;
    let maximum;
    let comparisons = 0;
    let index;
    if (values.length % 2 === 0) {
      comparisons += 1;
      minimum = Math.min(values[0], values[1]);
      maximum = Math.max(values[0], values[1]);
      index = 2;
    } else {
      minimum = values[0];
      maximum = values[0];
      index = 1;
    }
    for (; index < values.length; index += 2) {
      comparisons += 1;
      const low = Math.min(values[index], values[index + 1]);
      const high = Math.max(values[index], values[index + 1]);
      comparisons += 2;
      if (low < minimum) minimum = low;
      if (high > maximum) maximum = high;
    }
    return deepFreeze({ minimum: minimum, maximum: maximum, comparisons: comparisons });
  }

  function topK(rawValues, rawK) {
    const values = Array.isArray(rawValues) ? rawValues.slice() : parseArray(rawValues);
    const k = rank(rawK, values.length);
    return values.sort(function (a, b) { return b - a; }).slice(0, k);
  }

  function createState(rawValues, rawRank, seed) {
    const scenario = comparisonScenario(rawValues, rawRank, seed);
    return deepFreeze({ scenario: scenario, frameIndex: 0, finished: false });
  }

  function step(state) {
    if (state.finished) return state;
    const next = Math.min(state.frameIndex + 1, state.scenario.frameCount - 1);
    return deepFreeze({
      scenario: state.scenario,
      frameIndex: next,
      finished: next === state.scenario.frameCount - 1,
    });
  }

  function currentFrame(track, index) {
    return track.frames[Math.min(index, track.frames.length - 1)];
  }

  function visualModel(state) {
    return deepFreeze({
      scenario: state.scenario,
      frameIndex: state.frameIndex,
      random: currentFrame(state.scenario.random, state.frameIndex),
      bfprt: currentFrame(state.scenario.bfprt, state.frameIndex),
      exact: true,
    });
  }

  return {
    MAX_ITEMS: MAX_ITEMS,
    parseArray: parseArray,
    rank: rank,
    seededRandom: seededRandom,
    medianOfMedians: medianOfMedians,
    partitionThreeWay: partitionThreeWay,
    guaranteedBfprtDiscard: guaranteedBfprtDiscard,
    selectionTrack: selectionTrack,
    comparisonScenario: comparisonScenario,
    simultaneousMinMax: simultaneousMinMax,
    topK: topK,
    createState: createState,
    step: step,
    visualModel: visualModel,
  };
});
