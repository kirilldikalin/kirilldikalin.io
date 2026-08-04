(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AtlasNumericLabCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value, seen) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    const visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key], visited);
    });
    return Object.freeze(value);
  }

  function parseBigInt(value, label, maximumDigits) {
    const text = String(value).trim();
    const name = label || "Целое число";
    const limit = maximumDigits === undefined ? 500 : maximumDigits;
    if (!/^[+-]?\d+$/.test(text)) {
      throw new RangeError(name + " должно быть записано целыми десятичными цифрами.");
    }
    if (text.replace(/^[+-]?0*/, "").length > limit) {
      throw new RangeError(name + " содержит больше " + limit + " значащих цифр.");
    }
    return BigInt(text);
  }

  function boundedInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw new RangeError(
        (label || "Значение") + " должно быть целым от " + minimum + " до " + maximum + "."
      );
    }
    return number;
  }

  function abs(value) {
    return value < 0n ? -value : value;
  }

  function mod(value, modulus) {
    if (modulus <= 0n) throw new RangeError("Модуль должен быть положительным.");
    const residue = value % modulus;
    return residue < 0n ? residue + modulus : residue;
  }

  function bitLength(value) {
    const magnitude = abs(value);
    return magnitude === 0n ? 1 : magnitude.toString(2).length;
  }

  function makePlayback(frames, metadata) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new RangeError("Трасса должна содержать хотя бы один кадр.");
    }
    const cursor = 0;
    return deepFreeze(Object.assign({
      frames: frames,
      cursor: cursor,
      current: frames[cursor],
      finished: frames.length === 1,
    }, metadata || {}));
  }

  function withCursor(state, cursor) {
    const next = Math.max(0, Math.min(state.frames.length - 1, cursor));
    return deepFreeze(Object.assign({}, state, {
      cursor: next,
      current: state.frames[next],
      finished: next === state.frames.length - 1,
    }));
  }

  function step(state) {
    return withCursor(state, state.cursor + 1);
  }

  function seek(state, cursor) {
    return withCursor(state, boundedInteger(cursor, "Номер кадра", 0, state.frames.length - 1));
  }

  function reset(state) {
    return withCursor(state, 0);
  }

  function gcd(left, right) {
    let a = abs(left);
    let b = abs(right);
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function extendedGcd(left, right) {
    const signA = left < 0n ? -1n : 1n;
    const signB = right < 0n ? -1n : 1n;
    let oldR = abs(left);
    let r = abs(right);
    let oldS = 1n;
    let s = 0n;
    let oldT = 0n;
    let t = 1n;
    while (r !== 0n) {
      const q = oldR / r;
      [oldR, r] = [r, oldR - q * r];
      [oldS, s] = [s, oldS - q * s];
      [oldT, t] = [t, oldT - q * t];
    }
    return deepFreeze({ gcd: oldR, x: oldS * signA, y: oldT * signB });
  }

  function modPow(base, exponent, modulus) {
    if (exponent < 0n) throw new RangeError("Показатель степени не может быть отрицательным.");
    if (modulus <= 0n) throw new RangeError("Модуль должен быть положительным.");
    let factor = mod(base, modulus);
    let power = exponent;
    let result = 1n % modulus;
    while (power > 0n) {
      if (power & 1n) result = result * factor % modulus;
      factor = factor * factor % modulus;
      power >>= 1n;
    }
    return result;
  }

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new RangeError((label || "Число") + " должно быть конечным.");
    }
    return number;
  }

  return Object.freeze({
    deepFreeze: deepFreeze,
    parseBigInt: parseBigInt,
    boundedInteger: boundedInteger,
    abs: abs,
    mod: mod,
    bitLength: bitLength,
    makePlayback: makePlayback,
    step: step,
    seek: seek,
    reset: reset,
    gcd: gcd,
    extendedGcd: extendedGcd,
    modPow: modPow,
    finiteNumber: finiteNumber,
  });
});
