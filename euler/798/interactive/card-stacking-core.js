(function (root) {
  "use strict";

  function assertCardCount(n) {
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      throw new Error("Число карт должно быть целым от 1 до 20");
    }
  }

  function normalizeState(state) {
    if (!Array.isArray(state)) {
      throw new Error("Состояние должно быть массивом координат");
    }

    const normalized = state.map((value) => {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Координаты состояния должны быть неотрицательными целыми");
      }
      return value;
    }).sort((left, right) => left - right);

    if (new Set(normalized).size !== normalized.length) {
      throw new Error("Координаты состояния не должны повторяться");
    }
    return normalized;
  }

  function subsetToState(n, visibleCards) {
    assertCardCount(n);
    const cards = [...new Set(visibleCards)].sort((left, right) => left - right);
    for (const card of cards) {
      if (!Number.isInteger(card) || card < 1 || card > n) {
        throw new Error("Номер карты выходит за пределы масти");
      }
    }
    return cards.reverse().map((card) => n - card);
  }

  function stateKey(state) {
    return normalizeState(state).join(",");
  }

  function legalMoves(state) {
    const current = normalizeState(state);
    const moves = [];

    for (let index = 0; index < current.length; index += 1) {
      const occupiedLeft = new Set(current.slice(0, index));
      for (let target = 0; target < current[index]; target += 1) {
        if (occupiedLeft.has(target)) continue;

        const next = [
          ...current.slice(0, index),
          target,
          ...current.slice(index + 1).map((value) => value - 1),
        ].sort((left, right) => left - right);

        moves.push(next);
      }
    }

    const unique = new Map();
    for (const move of moves) unique.set(stateKey(move), move);
    return [...unique.values()];
  }

  function grundyByMex(state, memo = new Map()) {
    const current = normalizeState(state);
    const key = stateKey(current);
    if (memo.has(key)) return memo.get(key);

    const reachable = new Set(
      legalMoves(current).map((move) => grundyByMex(move, memo)),
    );
    let result = 0;
    while (reachable.has(result)) result += 1;
    memo.set(key, result);
    return result;
  }

  function positionCharacteristics(state) {
    const current = normalizeState(state);
    if (current.length === 0) {
      return {
        d: 0,
        h: Number.POSITIVE_INFINITY,
        blockerIndex: -1,
        grundy: 0,
      };
    }

    const lastIndex = current.length - 1;
    const last = current[lastIndex];
    const d = last - lastIndex;
    let blockerIndex = -1;

    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      if ((current[index] - last) % 2 !== 0) {
        blockerIndex = index;
        break;
      }
    }

    const h = blockerIndex === -1
      ? Number.POSITIVE_INFINITY
      : last - current[blockerIndex];
    let grundy = Math.min(d, h);
    if ((grundy - d) % 2 !== 0) grundy -= 1;

    return { d, h, blockerIndex, grundy };
  }

  function grundyByFormula(state) {
    return positionCharacteristics(state).grundy;
  }

  function enumerateDistribution(n, grundy = grundyByFormula) {
    assertCardCount(n);
    if (n > 16) {
      throw new Error("Полный перебор разрешён только для n ≤ 16");
    }

    const distribution = Array(n).fill(0);
    for (let mask = 0; mask < 2 ** n; mask += 1) {
      const cards = [];
      for (let bit = 0; bit < n; bit += 1) {
        if ((mask & (1 << bit)) !== 0) cards.push(bit + 1);
      }
      distribution[grundy(subsetToState(n, cards))] += 1;
    }
    return distribution;
  }

  function binomial(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n || n < 0) {
      return 0;
    }
    k = Math.min(k, n - k);
    let result = 1;
    for (let index = 1; index <= k; index += 1) {
      result = (result * (n - k + index)) / index;
    }
    return result;
  }

  function frequency(n, value) {
    assertCardCount(n);
    if (!Number.isInteger(value) || value < 0 || value >= n) return 0;
    if (value === 0) return n === 1 ? 2 : 2 ** (n - 2) + 2;

    const k = Math.ceil(value / 2);
    const r = n - k - 1 - (value % 2 === 0 ? 1 : 0);
    let tail = 0;
    for (let index = 0; index <= k - 2; index += 1) {
      tail += binomial(r, index);
    }
    return 2 ** r + binomial(r, k) - tail;
  }

  function formulaDistribution(n) {
    assertCardCount(n);
    return Array.from({ length: n }, (_, value) => frequency(n, value));
  }

  function nextPowerOfTwo(value) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error("Длина должна быть положительным целым числом");
    }
    let result = 1;
    while (result < value) result *= 2;
    return result;
  }

  function hadamardStages(values) {
    const length = nextPowerOfTwo(values.length);
    const current = Array.from({ length }, (_, index) => values[index] || 0);
    const stages = [current.slice()];

    for (let block = 1; block < length; block *= 2) {
      for (let start = 0; start < length; start += block * 2) {
        for (let offset = 0; offset < block; offset += 1) {
          const left = current[start + offset];
          const right = current[start + offset + block];
          current[start + offset] = left + right;
          current[start + offset + block] = left - right;
        }
      }
      stages.push(current.slice());
    }
    return stages;
  }

  function xorZeroCount(distribution, suits) {
    if (!Number.isInteger(suits) || suits < 1) {
      throw new Error("Число мастей должно быть положительным целым");
    }
    const transformed = hadamardStages(distribution).at(-1);
    const total = transformed.reduce(
      (sum, value) => sum + value ** suits,
      0,
    );
    return total / transformed.length;
  }

  function modPow(base, exponent, modulus) {
    let value = ((base % modulus) + modulus) % modulus;
    let power = BigInt(exponent);
    let result = 1n;
    while (power > 0n) {
      if ((power & 1n) === 1n) result = (result * value) % modulus;
      value = (value * value) % modulus;
      power >>= 1n;
    }
    return result;
  }

  function xorZeroCountMod(distribution, suits, modulus = 1_000_000_007n) {
    const length = nextPowerOfTwo(distribution.length);
    const values = Array.from(
      { length },
      (_, index) => BigInt(distribution[index] || 0),
    );

    for (let block = 1; block < length; block *= 2) {
      for (let start = 0; start < length; start += block * 2) {
        for (let offset = 0; offset < block; offset += 1) {
          const leftIndex = start + offset;
          const rightIndex = leftIndex + block;
          const left = values[leftIndex];
          const right = values[rightIndex];
          values[leftIndex] = (left + right) % modulus;
          values[rightIndex] = (left - right + modulus) % modulus;
        }
      }
    }

    const total = values.reduce(
      (sum, value) => (sum + modPow(value, suits, modulus)) % modulus,
      0n,
    );
    const inverseLength = modPow(BigInt(length), modulus - 2n, modulus);
    return (total * inverseLength) % modulus;
  }

  root.Euler798Core = Object.freeze({
    subsetToState,
    legalMoves,
    grundyByMex,
    positionCharacteristics,
    grundyByFormula,
    enumerateDistribution,
    binomial,
    frequency,
    formulaDistribution,
    nextPowerOfTwo,
    hadamardStages,
    xorZeroCount,
    xorZeroCountMod,
  });
}(typeof window === "undefined" ? globalThis : window));
