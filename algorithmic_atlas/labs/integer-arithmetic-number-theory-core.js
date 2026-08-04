(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./numeric-lab-core.js")
    : root.AtlasNumericLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IntegerArithmeticNumberTheoryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasNumericLabCore is unavailable");
  const MAX_FRAMES = 320;
  const MAX_UNMODULAR_POWER_BITS = 200000n;

  function euclidFrames(rawA, rawB) {
    let oldR = shared.abs(rawA);
    let r = shared.abs(rawB);
    let oldS = rawA < 0n ? -1n : 1n;
    let s = 0n;
    let oldT = 0n;
    let t = rawB < 0n ? -1n : 1n;
    const frames = [{
      mode: "euclid", phase: "start", a: oldR, b: r, q: null, remainder: null,
      x: oldS, y: oldT, gcd: null,
      message: "Начинаем с двух модулей; коэффициенты уже описывают первый остаток.",
    }];
    while (r !== 0n) {
      const q = oldR / r;
      const nextR = oldR - q * r;
      const nextS = oldS - q * s;
      const nextT = oldT - q * t;
      frames.push({
        mode: "euclid", phase: "division", a: oldR, b: r, q: q,
        remainder: nextR, x: nextS, y: nextT, gcd: null,
        message: oldR + " = " + q + " · " + r + " + " + nextR +
          "; тот же линейный шаг обновляет коэффициенты Безу.",
      });
      [oldR, r] = [r, nextR];
      [oldS, s] = [s, nextS];
      [oldT, t] = [t, nextT];
      if (frames.length > MAX_FRAMES) throw new RangeError("Слишком длинная трасса Евклида.");
    }
    frames.push({
      mode: "euclid", phase: "done", a: oldR, b: 0n, q: null,
      remainder: 0n, x: oldS, y: oldT, gcd: oldR,
      message: "Нулевой остаток завершает процесс: НОД равен " + oldR +
        ", а коэффициенты дают точное тождество Безу.",
    });
    return shared.deepFreeze(frames);
  }

  function binaryGcd(rawA, rawB) {
    let a = shared.abs(rawA);
    let b = shared.abs(rawB);
    if (a === 0n) return b;
    if (b === 0n) return a;
    let shift = 0n;
    while (((a | b) & 1n) === 0n) {
      a >>= 1n;
      b >>= 1n;
      shift += 1n;
    }
    while ((a & 1n) === 0n) a >>= 1n;
    do {
      while ((b & 1n) === 0n) b >>= 1n;
      if (a > b) [a, b] = [b, a];
      b -= a;
    } while (b !== 0n);
    return a << shift;
  }

  function powerFrames(base, exponent, modulus) {
    if (exponent < 0n) throw new RangeError("Показатель должен быть неотрицательным.");
    if (exponent.toString(2).length > 320) throw new RangeError("Для покадрового режима допустимо не более 320 бит показателя.");
    if (modulus !== null && modulus <= 0n) throw new RangeError("Модуль должен быть положительным.");
    const magnitude = shared.abs(base);
    if (
      modulus === null &&
      exponent > 0n &&
      magnitude > 1n &&
      BigInt(shared.bitLength(magnitude)) * exponent > MAX_UNMODULAR_POWER_BITS
    ) {
      throw new RangeError(
        "Консервативная оценка результата степени без модуля превышает безопасную границу " +
        MAX_UNMODULAR_POWER_BITS + " бит. Уменьшите показатель или укажите модуль."
      );
    }
    let result = modulus === null ? 1n : 1n % modulus;
    let factor = modulus === null ? base : shared.mod(base, modulus);
    let remaining = exponent;
    const frames = [{
      mode: "power", phase: "start", result: result, factor: factor,
      remaining: remaining, bit: null,
      message: "Инвариант: результат · основание^оставшийся_показатель равен исходной степени.",
    }];
    while (remaining > 0n) {
      const bit = Number(remaining & 1n);
      if (bit) result = modulus === null ? result * factor : result * factor % modulus;
      remaining >>= 1n;
      if (remaining > 0n) factor = modulus === null ? factor * factor : factor * factor % modulus;
      frames.push({
        mode: "power", phase: remaining === 0n ? "done" : "bit", result: result,
        factor: factor, remaining: remaining, bit: bit,
        message: bit
          ? "Младший бит равен 1: множитель включён в аккумулятор, затем показатель делится пополам."
          : "Младший бит равен 0: аккумулятор не меняется, основание возводится в квадрат.",
      });
    }
    if (exponent === 0n) {
      frames.push({ mode: "power", phase: "done", result: result, factor: factor, remaining: 0n, bit: 0, message: "Нулевая степень равна единице в выбранном кольце." });
    }
    return shared.deepFreeze(frames);
  }

  function decimalDigits(value) {
    return shared.abs(value).toString().length;
  }

  function karatsubaTrace(rawA, rawB) {
    if (decimalDigits(rawA) > 80 || decimalDigits(rawB) > 80) {
      throw new RangeError("Для визуальной рекурсии допустимо не более 80 десятичных цифр.");
    }
    const sign = (rawA < 0n) !== (rawB < 0n) ? -1n : 1n;
    const frames = [];
    function multiply(a, b, depth) {
      const digits = Math.max(decimalDigits(a), decimalDigits(b));
      if (digits <= 2) {
        const value = a * b;
        frames.push({ mode: "karatsuba", phase: "base", depth: depth, a: a, b: b, result: value, split: null, message: "Базовое умножение " + a + " · " + b + " = " + value + "." });
        return value;
      }
      const half = Math.ceil(digits / 2);
      const power = 10n ** BigInt(half);
      const highA = a / power;
      const lowA = a % power;
      const highB = b / power;
      const lowB = b % power;
      frames.push({ mode: "karatsuba", phase: "split", depth: depth, a: a, b: b, result: null, split: { highA: highA, lowA: lowA, highB: highB, lowB: lowB, power: power }, message: "Разрезаем оба числа по степени 10^" + half + "." });
      const z0 = multiply(lowA, lowB, depth + 1);
      const z2 = multiply(highA, highB, depth + 1);
      const z1 = multiply(lowA + highA, lowB + highB, depth + 1) - z0 - z2;
      const value = z2 * power * power + z1 * power + z0;
      frames.push({ mode: "karatsuba", phase: "combine", depth: depth, a: a, b: b, result: value, split: { z0: z0, z1: z1, z2: z2, power: power }, message: "Три произведения собраны: z₂B² + z₁B + z₀ = " + value + "." });
      return value;
    }
    const magnitude = multiply(shared.abs(rawA), shared.abs(rawB), 0);
    const result = sign * magnitude;
    frames.push({ mode: "karatsuba", phase: "done", depth: 0, a: rawA, b: rawB, result: result, split: null, message: "Знак восстановлен; точный результат равен " + result + "." });
    return shared.deepFreeze({ frames: frames, result: result });
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "euclid";
    let frames;
    let inputs;
    if (mode === "euclid") {
      const a = shared.parseBigInt(settings.a === undefined ? "1071" : settings.a, "a");
      const b = shared.parseBigInt(settings.b === undefined ? "462" : settings.b, "b");
      frames = euclidFrames(a, b);
      inputs = { a: a, b: b };
    } else if (mode === "power") {
      const base = shared.parseBigInt(settings.a === undefined ? "7" : settings.a, "Основание");
      const exponent = shared.parseBigInt(settings.b === undefined ? "181" : settings.b, "Показатель");
      const modulus = settings.modulus === "" || settings.modulus === null
        ? null
        : shared.parseBigInt(settings.modulus === undefined ? "1009" : settings.modulus, "Модуль");
      frames = powerFrames(base, exponent, modulus);
      inputs = { a: base, b: exponent, modulus: modulus };
    } else if (mode === "karatsuba") {
      const a = shared.parseBigInt(settings.a === undefined ? "12345678" : settings.a, "a", 80);
      const b = shared.parseBigInt(settings.b === undefined ? "87654321" : settings.b, "b", 80);
      const trace = karatsubaTrace(a, b);
      frames = trace.frames;
      inputs = { a: a, b: b, result: trace.result };
    } else {
      throw new RangeError("Неизвестный режим целочисленной лаборатории.");
    }
    return shared.makePlayback(frames, { mode: mode, inputs: inputs });
  }

  return Object.freeze({
    MAX_FRAMES: MAX_FRAMES,
    MAX_UNMODULAR_POWER_BITS: MAX_UNMODULAR_POWER_BITS,
    euclidFrames: euclidFrames,
    binaryGcd: binaryGcd,
    powerFrames: powerFrames,
    karatsubaTrace: karatsubaTrace,
    createState: createState,
    step: shared.step,
    seek: shared.seek,
    reset: shared.reset,
    isFinished: function (state) { return Boolean(state && state.finished); },
  });
});
