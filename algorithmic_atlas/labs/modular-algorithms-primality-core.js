(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./numeric-lab-core.js")
    : root.AtlasNumericLabCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ModularAlgorithmsPrimalityCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  if (!shared) throw new Error("AtlasNumericLabCore is unavailable");
  const UINT64_LIMIT = 1n << 64n;
  const DETERMINISTIC_BASES_64 = Object.freeze([2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n]);
  const MAX_CRT_CONGRUENCES = 12;
  const MAX_WITNESS_FRAMES = 96;

  function modularInverse(value, modulus) {
    const result = shared.extendedGcd(value, modulus);
    if (result.gcd !== 1n) throw new RangeError("Обратного элемента не существует: НОД не равен 1.");
    return shared.mod(result.x, modulus);
  }

  function combineCongruences(left, right) {
    const a = shared.mod(left.residue, left.modulus);
    const b = shared.mod(right.residue, right.modulus);
    const g = shared.gcd(left.modulus, right.modulus);
    const delta = b - a;
    if (delta % g !== 0n) throw new RangeError("Система сравнений несовместна.");
    const m1 = left.modulus / g;
    const m2 = right.modulus / g;
    const step = shared.mod(delta / g * modularInverse(m1, m2), m2);
    const modulus = left.modulus * m2;
    return shared.deepFreeze({ residue: shared.mod(a + left.modulus * step, modulus), modulus: modulus });
  }

  function crtFrames(congruences) {
    if (!Array.isArray(congruences) || congruences.length === 0) {
      throw new RangeError("Нужно хотя бы одно сравнение.");
    }
    if (congruences.length > MAX_CRT_CONGRUENCES) {
      throw new RangeError("Для видимой трассы допустимо не более " + MAX_CRT_CONGRUENCES + " сравнений.");
    }
    const normalized = congruences.map(function (item, index) {
      const modulus = shared.parseBigInt(item.modulus, "Модуль " + (index + 1));
      if (modulus <= 0n) throw new RangeError("Модули должны быть положительными.");
      return { residue: shared.mod(shared.parseBigInt(item.residue, "Остаток " + (index + 1)), modulus), modulus: modulus };
    });
    let current = normalized[0];
    const frames = [{ mode: "crt", phase: "start", current: current, added: current, message: "Первое сравнение задаёт начальную арифметическую прогрессию." }];
    for (let index = 1; index < normalized.length; index += 1) {
      const added = normalized[index];
      current = combineCongruences(current, added);
      frames.push({ mode: "crt", phase: "combine", current: current, added: added, message: "Пересечение двух прогрессий даёт один класс по модулю НОК: x ≡ " + current.residue + " (mod " + current.modulus + ")." });
    }
    frames.push({ mode: "crt", phase: "done", current: current, added: null, message: "Все сравнения объединены в единственный класс по общему модулю." });
    return shared.deepFreeze(frames);
  }

  function decomposeMinusOne(n) {
    if (n < 3n) throw new RangeError("Разложение n−1 требует n ≥ 3.");
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s += 1;
    }
    return shared.deepFreeze({ s: s, d: d });
  }

  function witnessTrace(n, rawBase) {
    if (n < 3n || (n & 1n) === 0n) throw new RangeError("Пошаговый witness требует нечётное n ≥ 3.");
    if (n === 3n) return shared.deepFreeze([{ mode: "miller-rabin", phase: "done", n: n, base: 2n, s: 1, d: 1n, round: 0, value: 2n, passed: true, composite: false, message: "n = 3 проверяется как малое простое до раундов Миллера — Рабина." }]);
    const decomposition = decomposeMinusOne(n);
    const base = shared.mod(rawBase, n);
    if (base < 2n || base > n - 2n) throw new RangeError("Основание witness после приведения должно лежать от 2 до n−2.");
    if (decomposition.s + 2 > MAX_WITNESS_FRAMES) throw new RangeError("Для видимой трассы в n−1 слишком много последовательных множителей 2.");
    let x = shared.modPow(base, decomposition.d, n);
    const frames = [{ mode: "miller-rabin", phase: "power", n: n, base: base, s: decomposition.s, d: decomposition.d, round: 0, value: x, passed: x === 1n || x === n - 1n, composite: false, message: "Вычислено a^d mod n = " + x + "." }];
    if (x === 1n || x === n - 1n) {
      frames.push({ mode: "miller-rabin", phase: "done", n: n, base: base, s: decomposition.s, d: decomposition.d, round: 0, value: x, passed: true, composite: false, message: "Этот witness не обнаружил составность." });
      return shared.deepFreeze(frames);
    }
    for (let round = 1; round < decomposition.s; round += 1) {
      x = x * x % n;
      const passed = x === n - 1n;
      frames.push({ mode: "miller-rabin", phase: "square", n: n, base: base, s: decomposition.s, d: decomposition.d, round: round, value: x, passed: passed, composite: false, message: "Квадрат номер " + round + " даёт остаток " + x + "." });
      if (passed) {
        frames.push({ mode: "miller-rabin", phase: "done", n: n, base: base, s: decomposition.s, d: decomposition.d, round: round, value: x, passed: true, composite: false, message: "Получен −1 modulo n: witness не доказал составность." });
        return shared.deepFreeze(frames);
      }
    }
    frames.push({ mode: "miller-rabin", phase: "done", n: n, base: base, s: decomposition.s, d: decomposition.d, round: decomposition.s, value: x, passed: false, composite: true, message: "Цепочка не достигла −1: найден сертификат составности для выбранного основания." });
    return shared.deepFreeze(frames);
  }

  function isStrongProbablePrime(n, base) {
    const normalized = shared.mod(base, n);
    if (normalized < 2n || normalized > n - 2n) return true;
    const trace = witnessTrace(n, normalized);
    return !trace[trace.length - 1].composite;
  }

  function isPrime64(raw) {
    const n = typeof raw === "bigint" ? raw : shared.parseBigInt(raw, "n");
    if (n >= UINT64_LIMIT) throw new RangeError("Детерминированная гарантия этой функции ограничена n < 2^64.");
    if (n < 2n) return false;
    for (const prime of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
      if (n === prime) return true;
      if (n % prime === 0n) return false;
    }
    return DETERMINISTIC_BASES_64.every(function (base) {
      return isStrongProbablePrime(n, base);
    });
  }

  function sieve(limit) {
    const n = shared.boundedInteger(limit, "Граница решета", 0, 1000000);
    const composite = new Uint8Array(n + 1);
    const primes = [];
    for (let value = 2; value <= n; value += 1) {
      if (!composite[value]) {
        primes.push(value);
        if (value * value <= n) {
          for (let multiple = value * value; multiple <= n; multiple += value) composite[multiple] = 1;
        }
      }
    }
    return Object.freeze(primes);
  }

  function integerSqrt(value) {
    if (value < 0n) throw new RangeError("Квадратный корень требует неотрицательное число.");
    if (value < 2n) return value;
    let x = 1n << BigInt(Math.ceil(shared.bitLength(value) / 2));
    while (true) {
      const next = (x + value / x) >> 1n;
      if (next >= x) return x;
      x = next;
    }
  }

  function smallTrialDivisor(n, limit) {
    if (n === 2n || n === 3n) return 1n;
    if (n % 2n === 0n) return 2n;
    const maximum = limit === undefined ? 100000n : BigInt(limit);
    const root = integerSqrt(n);
    if (root > maximum) return null;
    for (let divisor = 3n; divisor <= root; divisor += 2n) {
      if (n % divisor === 0n) return divisor;
    }
    return 1n;
  }

  function comparisonFrames(rawN, rawBase) {
    const n = typeof rawN === "bigint" ? rawN : shared.parseBigInt(rawN, "n", 200);
    const base = typeof rawBase === "bigint" ? rawBase : shared.parseBigInt(rawBase === undefined ? "2" : rawBase, "Основание", 200);
    if (n < 2n) throw new RangeError("Сравнение методов требует n ≥ 2.");
    const root = integerSqrt(n);
    const trial = smallTrialDivisor(n, 100000n);
    const trialResult = trial === null
      ? "только оценка: полный проход длиннее 100 000 делителей"
      : trial === 1n ? "точно простое после полного прохода" : "точно составное: делитель " + trial;
    const sieveApplicable = n <= 1000000n;
    const normalizedBase = shared.mod(base, n);
    const coprime = shared.gcd(normalizedBase, n) === 1n;
    const fermatPass = n === 2n || (coprime && shared.modPow(normalizedBase, n - 1n, n) === 1n);
    let millerResult;
    if (n === 2n || n === 3n) millerResult = "малое простое обработано точно";
    else if ((n & 1n) === 0n) millerResult = "точно составное: чётное";
    else {
      const witnessBase = normalizedBase < 2n || normalizedBase > n - 2n ? 2n : normalizedBase;
      millerResult = witnessTrace(n, witnessBase).at(-1).composite
        ? "точно составное: witness найден"
        : n < UINT64_LIMIT && isPrime64(n)
          ? "простое в 64-битном диапазоне после полного набора оснований"
          : "один witness не обнаружил составность";
    }
    return shared.deepFreeze([
      {
        mode: "comparison", phase: "trial", method: "Пробное деление",
        guarantee: "точная", work: "до ⌊√n⌋ = " + root + " кандидатов",
        result: trialResult, n: n, base: base,
        message: "Пробное деление даёт сертификат, но растёт экспоненциально по битовой длине.",
      },
      {
        mode: "comparison", phase: "sieve", method: "Решето",
        guarantee: "точная для всего диапазона", work: "память и проход до n",
        result: sieveApplicable ? (sieve(Number(n)).includes(Number(n)) ? "n входит в список простых" : "n вычеркнуто") : "схематически: массив до n не строится",
        n: n, base: base,
        message: "Решето выгодно для диапазона, но не для одного огромного кандидата.",
      },
      {
        mode: "comparison", phase: "fermat", method: "Тест Ферма",
        guarantee: "односторонний слабый фильтр", work: "одна модульная степень",
        result: n === 2n || n === 3n ? "малое простое обработано до общего теста" : fermatPass ? "условие выполнено; простота не доказана" : "точно составное для выбранного основания",
        n: n, base: base,
        message: "Числа Кармайкла показывают, почему успешный Fermat round ненадёжен.",
      },
      {
        mode: "comparison", phase: "miller-rabin", method: "Miller–Rabin",
        guarantee: n < UINT64_LIMIT ? "детерминированная возможна полным набором оснований" : "вероятностная серия раундов",
        work: "O(log n) модульных умножений на основание",
        result: millerResult, n: n, base: base,
        message: "Witness составности точен; успешный одиночный раунд остаётся ограниченным утверждением.",
      },
      {
        mode: "comparison", phase: "aks", method: "AKS",
        guarantee: "детерминированная полиномиальная", work: "концептуальная оценка, без запуска тяжёлой трассы",
        result: "показывается математическая роль, а не фиктивный benchmark",
        n: n, base: base,
        message: "AKS доказывает PRIMES ∈ P, но лаборатория не выдаёт концептуальную строку за исполнение.",
      },
    ]);
  }

  function createState(options) {
    const settings = options || {};
    const mode = settings.mode || "miller-rabin";
    let frames;
    let inputs;
    if (mode === "miller-rabin") {
      const n = shared.parseBigInt(settings.n === undefined ? "561" : settings.n, "n", 200);
      const base = shared.parseBigInt(settings.base === undefined ? "2" : settings.base, "Основание", 200);
      frames = witnessTrace(n, base);
      inputs = { n: n, base: base };
    } else if (mode === "crt") {
      const congruences = settings.congruences || [
        { residue: "2", modulus: "3" },
        { residue: "3", modulus: "5" },
        { residue: "2", modulus: "7" },
      ];
      frames = crtFrames(congruences);
      inputs = { congruences: congruences };
    } else if (mode === "comparison") {
      const n = shared.parseBigInt(settings.n === undefined ? "561" : settings.n, "n", 200);
      const base = shared.parseBigInt(settings.base === undefined ? "2" : settings.base, "Основание", 200);
      frames = comparisonFrames(n, base);
      inputs = { n: n, base: base };
    } else {
      throw new RangeError("Неизвестный режим модульной лаборатории.");
    }
    return shared.makePlayback(frames, { mode: mode, inputs: inputs });
  }

  return Object.freeze({
    UINT64_LIMIT: UINT64_LIMIT,
    DETERMINISTIC_BASES_64: DETERMINISTIC_BASES_64,
    MAX_CRT_CONGRUENCES: MAX_CRT_CONGRUENCES,
    MAX_WITNESS_FRAMES: MAX_WITNESS_FRAMES,
    modularInverse: modularInverse,
    combineCongruences: combineCongruences,
    crtFrames: crtFrames,
    decomposeMinusOne: decomposeMinusOne,
    witnessTrace: witnessTrace,
    isPrime64: isPrime64,
    sieve: sieve,
    integerSqrt: integerSqrt,
    comparisonFrames: comparisonFrames,
    createState: createState,
    step: shared.step,
    seek: shared.seek,
    reset: shared.reset,
    isFinished: function (state) { return Boolean(state && state.finished); },
  });
});
