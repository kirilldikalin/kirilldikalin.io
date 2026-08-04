(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./numeric-lab-core.js")
    : root.AtlasNumericLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PolynomialsFftNttCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasNumericLabCore is unavailable");
  const NTT_MODULUS = 998244353n;
  const NTT_ROOT = 3n;
  const MAX_SIZE = 64;

  function complex(re, im) {
    const real = Number(re);
    const imaginary = Number(im);
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) {
      throw new RangeError("FFT вышла за конечный диапазон Number.");
    }
    return { re: real, im: imaginary };
  }
  function add(a, b) { return complex(a.re + b.re, a.im + b.im); }
  function subtract(a, b) { return complex(a.re - b.re, a.im - b.im); }
  function multiply(a, b) { return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }

  function nextPowerOfTwo(value) {
    const n = shared.boundedInteger(value, "Длина", 1, MAX_SIZE);
    let power = 1;
    while (power < n) power <<= 1;
    return power;
  }

  function parseCoefficients(value, exact) {
    const parts = Array.isArray(value) ? value : String(value).split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new RangeError("Нужен хотя бы один коэффициент.");
    if (parts.length > MAX_SIZE / 2) throw new RangeError("Для визуализации допустимо не более " + (MAX_SIZE / 2) + " коэффициентов.");
    return parts.map(function (part, index) {
      return exact
        ? shared.parseBigInt(part, "Коэффициент " + index, 30)
        : shared.finiteNumber(part, "Коэффициент " + index);
    });
  }

  function reverseBits(value, bits) {
    let result = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      result = (result << 1) | ((value >> bit) & 1);
    }
    return result;
  }

  function fftFrames(rawValues, inverse) {
    const input = rawValues.map(function (value) {
      return typeof value === "number" ? complex(value, 0) : complex(value.re, value.im);
    });
    const n = nextPowerOfTwo(input.length);
    while (input.length < n) input.push(complex(0, 0));
    const bits = Math.log2(n);
    const values = new Array(n);
    for (let index = 0; index < n; index += 1) values[reverseBits(index, bits)] = input[index];
    const frames = [{ mode: "fft", phase: "bit-reversal", stage: 0, size: 1, values: values.map(function (z) { return complex(z.re, z.im); }), active: [], message: "Коэффициенты переставлены в bit-reversal порядке." }];
    for (let size = 2, stage = 1; size <= n; size <<= 1, stage += 1) {
      const angle = (inverse ? 2 : -2) * Math.PI / size;
      const root = complex(Math.cos(angle), Math.sin(angle));
      for (let start = 0; start < n; start += size) {
        let omega = complex(1, 0);
        for (let offset = 0; offset < size / 2; offset += 1) {
          const left = start + offset;
          const right = left + size / 2;
          const even = values[left];
          const odd = multiply(values[right], omega);
          values[left] = add(even, odd);
          values[right] = subtract(even, odd);
          frames.push({ mode: "fft", phase: "butterfly", stage: stage, size: size, values: values.map(function (z) { return complex(z.re, z.im); }), active: [left, right], omega: complex(omega.re, omega.im), message: "Butterfly объединяет позиции " + left + " и " + right + " корнем порядка " + size + "." });
          omega = multiply(omega, root);
        }
      }
    }
    if (inverse) values.forEach(function (z) { z.re /= n; z.im /= n; });
    frames.push({ mode: "fft", phase: "done", stage: bits, size: n, values: values.map(function (z) { return complex(z.re, z.im); }), active: [], message: inverse ? "Обратное преобразование нормировано делением на n." : "Все стадии FFT завершены." });
    return shared.deepFreeze(frames);
  }

  function modularInverse(value, modulus) {
    const result = shared.extendedGcd(value, modulus);
    if (result.gcd !== 1n) throw new RangeError("Обратный элемент не существует.");
    return shared.mod(result.x, modulus);
  }

  function nttFrames(rawValues, inverse, modulus, primitiveRoot) {
    const p = modulus || NTT_MODULUS;
    const generator = primitiveRoot || NTT_ROOT;
    const n = nextPowerOfTwo(rawValues.length);
    if ((p - 1n) % BigInt(n) !== 0n) throw new RangeError("Длина не делит p−1: корня нужного порядка нет.");
    const values = rawValues.map(function (value) { return shared.mod(BigInt(value), p); });
    while (values.length < n) values.push(0n);
    const bits = Math.log2(n);
    const permuted = new Array(n);
    for (let index = 0; index < n; index += 1) permuted[reverseBits(index, bits)] = values[index];
    for (let index = 0; index < n; index += 1) values[index] = permuted[index];
    const frames = [{ mode: "ntt", phase: "bit-reversal", stage: 0, size: 1, values: values.slice(), active: [], modulus: p, message: "Точные остатки переставлены в bit-reversal порядке." }];
    for (let size = 2, stage = 1; size <= n; size <<= 1, stage += 1) {
      let root = shared.modPow(generator, (p - 1n) / BigInt(size), p);
      if (inverse) root = modularInverse(root, p);
      for (let start = 0; start < n; start += size) {
        let omega = 1n;
        for (let offset = 0; offset < size / 2; offset += 1) {
          const left = start + offset;
          const right = left + size / 2;
          const even = values[left];
          const odd = values[right] * omega % p;
          values[left] = (even + odd) % p;
          values[right] = shared.mod(even - odd, p);
          frames.push({ mode: "ntt", phase: "butterfly", stage: stage, size: size, values: values.slice(), active: [left, right], omega: omega, modulus: p, message: "Точный butterfly modulo " + p + " объединяет позиции " + left + " и " + right + "." });
          omega = omega * root % p;
        }
      }
    }
    if (inverse) {
      const inverseN = modularInverse(BigInt(n), p);
      for (let index = 0; index < n; index += 1) values[index] = values[index] * inverseN % p;
    }
    frames.push({ mode: "ntt", phase: "done", stage: bits, size: n, values: values.slice(), active: [], modulus: p, message: inverse ? "Обратное NTT нормировано точным n⁻¹." : "Все точные стадии NTT завершены." });
    return shared.deepFreeze(frames);
  }

  function naiveConvolution(left, right) {
    const result = new Array(left.length + right.length - 1).fill(0);
    left.forEach(function (a, i) { right.forEach(function (b, j) { result[i + j] += a * b; }); });
    return result;
  }

  function fftConvolution(left, right) {
    const size = nextPowerOfTwo(left.length + right.length - 1);
    const paddedLeft = left.concat(new Array(size - left.length).fill(0));
    const paddedRight = right.concat(new Array(size - right.length).fill(0));
    const transformedLeft = fftFrames(paddedLeft, false).at(-1).values;
    const transformedRight = fftFrames(paddedRight, false).at(-1).values;
    const product = transformedLeft.map(function (value, index) { return multiply(value, transformedRight[index]); });
    return fftFrames(product, true).at(-1).values.slice(0, left.length + right.length - 1).map(function (value) { return value.re; });
  }

  function nttConvolution(left, right, modulus) {
    const p = modulus || NTT_MODULUS;
    const size = nextPowerOfTwo(left.length + right.length - 1);
    const paddedLeft = left.concat(new Array(size - left.length).fill(0n));
    const paddedRight = right.concat(new Array(size - right.length).fill(0n));
    const transformedLeft = nttFrames(paddedLeft, false, p, NTT_ROOT).at(-1).values;
    const transformedRight = nttFrames(paddedRight, false, p, NTT_ROOT).at(-1).values;
    const product = transformedLeft.map(function (value, index) { return value * transformedRight[index] % p; });
    return nttFrames(product, true, p, NTT_ROOT).at(-1).values.slice(0, left.length + right.length - 1);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "fft";
    if (mode === "fft") {
      const values = parseCoefficients(settings.coefficients === undefined ? "1, 2, 3, 4" : settings.coefficients, false);
      return shared.makePlayback(fftFrames(values, false), { mode: mode, coefficients: values });
    }
    if (mode === "ntt") {
      const values = parseCoefficients(settings.coefficients === undefined ? "1, 2, 3, 4" : settings.coefficients, true);
      return shared.makePlayback(nttFrames(values, false, NTT_MODULUS, NTT_ROOT), { mode: mode, coefficients: values });
    }
    throw new RangeError("Неизвестный режим преобразования.");
  }

  return Object.freeze({
    NTT_MODULUS: NTT_MODULUS,
    NTT_ROOT: NTT_ROOT,
    MAX_SIZE: MAX_SIZE,
    nextPowerOfTwo: nextPowerOfTwo,
    parseCoefficients: parseCoefficients,
    fftFrames: fftFrames,
    nttFrames: nttFrames,
    naiveConvolution: naiveConvolution,
    fftConvolution: fftConvolution,
    nttConvolution: nttConvolution,
    createState: createState,
    step: shared.step,
    seek: shared.seek,
    reset: shared.reset,
    isFinished: function (state) { return Boolean(state && state.finished); },
  });
});
