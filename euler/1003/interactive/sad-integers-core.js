(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Euler1003Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizePositions(positions) {
    return [...new Set(positions.map(Number))].sort((left, right) => left - right);
  }

  function isLonelySet(positions) {
    const sorted = normalizePositions(positions);
    return sorted.every((position, index) =>
      index === 0 || position - sorted[index - 1] >= 3
    );
  }

  function residuePairs(maxIndex) {
    if (maxIndex < 0) return [];
    const pairs = [{ u: 0, v: 1 }];
    if (maxIndex === 0) return pairs;
    pairs.push({ u: 1, v: 0 });
    for (let index = 2; index <= maxIndex; index += 1) {
      pairs.push({
        u: -pairs[index - 1].u - 2 * pairs[index - 2].u,
        v: -pairs[index - 1].v - 2 * pairs[index - 2].v,
      });
    }
    return pairs;
  }

  function residueForSet(positions) {
    const sorted = normalizePositions(positions);
    const pairs = residuePairs(sorted.at(-1) ?? 0);
    return sorted.reduce((sum, position) => ({
      u: sum.u + pairs[position].u,
      v: sum.v + pairs[position].v,
    }), { u: 0, v: 0 });
  }

  function candidateForSet(positions) {
    const sorted = normalizePositions(positions);
    const residue = residueForSet(sorted);
    if (!isLonelySet(sorted) || residue.u !== 0 || residue.v <= 0) {
      return {
        positions: sorted,
        residue,
        n: null,
        valid: false,
        reason: !isLonelySet(sorted)
          ? "singleton-позиции расположены слишком близко"
          : residue.u !== 0
            ? "коэффициент при x не равен нулю"
            : "восстановленное n не положительно",
      };
    }

    const reconstruction = reconstructTransfers(residue.v, sorted);
    return {
      positions: sorted,
      residue,
      n: residue.v,
      valid: reconstruction.valid,
      reason: reconstruction.valid
        ? ""
        : "переносы q_i не являются неотрицательными целыми",
      reconstruction,
    };
  }

  function reconstructTransfers(n, positions, tailLength = 10) {
    const singletonSet = new Set(normalizePositions(positions));
    const lastSingleton = Math.max(0, ...singletonSet);
    const rows = [];
    let valid = true;

    for (let index = 0; index <= lastSingleton + tailLength; index += 1) {
      const incoming = (index === 0 ? n : 0)
        + (rows[index - 1]?.q ?? 0)
        + (rows[index - 3]?.q ?? 0);
      const singleton = singletonSet.has(index) ? 1 : 0;
      const difference = incoming - singleton;
      const integer = difference % 2 === 0;
      const q = integer ? difference / 2 : NaN;
      const nonNegative = integer && q >= 0;
      if (!nonNegative) valid = false;
      rows.push({
        index,
        incoming,
        singleton,
        q,
        valid: nonNegative,
      });
    }

    const stableTail = rows.slice(-4).every((row, index, tail) =>
      Number.isFinite(row.q) && (index === 0 || row.q === tail[index - 1].q)
    );
    return {
      valid: valid && stableTail,
      stableTail,
      rows,
      minQ: Math.min(...rows.filter((row) => Number.isFinite(row.q)).map((row) => row.q)),
      tailValue: stableTail ? rows.at(-1).q : null,
    };
  }

  function transferPreview(positions, maxIndex = 13) {
    if (!Number.isInteger(maxIndex) || maxIndex < 0 || maxIndex > 100) {
      throw new Error("Граница пробного восстановления должна быть целым числом от 0 до 100");
    }
    const sorted = normalizePositions(positions);
    const singletonSet = new Set(sorted);
    const residue = residueForSet(sorted);
    const trialN = Math.max(0, residue.v);
    const rows = [];

    for (let index = 0; index <= maxIndex; index += 1) {
      const incoming = (index === 0 ? trialN : 0)
        + (rows[index - 1]?.q ?? 0)
        + (rows[index - 3]?.q ?? 0);
      const singleton = singletonSet.has(index) ? 1 : 0;
      const q = (incoming - singleton) / 2;
      rows.push({
        index,
        incoming,
        singleton,
        q,
        valid: Number.isInteger(q) && q >= 0,
      });
    }

    return {
      positions: sorted,
      residue,
      trialN,
      exactCandidate:
        sorted.length > 0
        && isLonelySet(sorted)
        && residue.u === 0
        && residue.v > 0,
      rows,
    };
  }

  function simulateSteps(n, processedCount) {
    const positions = new Array(processedCount + 5).fill(0);
    positions[0] = n;
    const events = [];
    for (let index = 0; index < processedCount; index += 1) {
      const before = positions[index];
      const moved = Math.floor(before / 2);
      const singleton = before % 2;
      positions[index] = singleton;
      positions[index + 1] += moved;
      positions[index + 3] += moved;
      events.push({ index, before, moved, singleton });
    }
    return {
      n,
      processedCount,
      positions,
      events,
      visibleStoneCount: positions.reduce((sum, value) => sum + value, 0),
      lastEvent: events.at(-1) ?? null,
    };
  }

  function boundaryMask(positions, split, side) {
    const set = new Set(normalizePositions(positions));
    const relevant = side === "left"
      ? [split - 2, split - 1]
      : [split, split + 1];
    return relevant.map((position) => set.has(position) ? "1" : "0").join("");
  }

  function boundaryCompatible(leftPositions, rightPositions, split) {
    return [...leftPositions, ...rightPositions].every((left, leftIndex, all) =>
      all.every((right, rightIndex) =>
        leftIndex === rightIndex || Math.abs(left - right) >= 3
      )
    );
  }

  function meetInTheMiddleSummary(positions, split) {
    const sorted = normalizePositions(positions);
    const left = sorted.filter((position) => position < split);
    const right = sorted.filter((position) => position >= split);
    const leftResidue = residueForSet(left);
    const rightResidue = residueForSet(right);
    const candidate = candidateForSet(sorted);
    return {
      split,
      left: {
        positions: left,
        residue: leftResidue,
        mask: boundaryMask(left, split, "left"),
      },
      right: {
        positions: right,
        residue: rightResidue,
        mask: boundaryMask(right, split, "right"),
      },
      compatible: boundaryCompatible(left, right, split),
      combinedResidue: {
        u: leftResidue.u + rightResidue.u,
        v: leftResidue.v + rightResidue.v,
      },
      candidate,
    };
  }

  return {
    boundaryCompatible,
    boundaryMask,
    candidateForSet,
    isLonelySet,
    meetInTheMiddleSummary,
    normalizePositions,
    reconstructTransfers,
    residueForSet,
    residuePairs,
    simulateSteps,
    transferPreview,
  };
});
