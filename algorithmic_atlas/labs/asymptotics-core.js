(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AsymptoticsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_SAMPLE_POWER = 996;
  const MIN_SAMPLE_COUNT = 2;
  const MAX_SAMPLE_COUNT = 64;
  const MAX_WINDOW_N = 1000000;
  const LOG10_2 = Math.log10(2);

  const RELATIONS = Object.freeze([
    Object.freeze({
      id: "O",
      symbol: "O",
      name: "ограничение сверху",
      definition:
        "Существуют c > 0 и n₀, после которых f(n) ≤ c·g(n).",
    }),
    Object.freeze({
      id: "Omega",
      symbol: "Ω",
      name: "ограничение снизу",
      definition:
        "Существуют c > 0 и n₀, после которых f(n) ≥ c·g(n).",
    }),
    Object.freeze({
      id: "Theta",
      symbol: "Θ",
      name: "одинаковый порядок",
      definition:
        "После некоторого n₀ функция f зажата между двумя положительными кратными g.",
    }),
    Object.freeze({
      id: "o",
      symbol: "o",
      name: "строго меньший порядок",
      definition:
        "Для любого c > 0 после некоторого n₀ выполнено f(n) < c·g(n).",
    }),
    Object.freeze({
      id: "omega",
      symbol: "ω",
      name: "строго больший порядок",
      definition:
        "Для любого c > 0 после некоторого n₀ выполнено f(n) > c·g(n).",
    }),
  ]);

  const RELATION_BY_ID = new Map(RELATIONS.map(function (relation) {
    return [relation.id, relation];
  }));

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function trueClaim(kind, explanation, witness) {
    return {
      holds: true,
      evidence: {
        kind: kind,
        explanation: explanation,
        witness: witness,
        counterexample: null,
      },
    };
  }

  function falseClaim(kind, explanation, counterexample) {
    return {
      holds: false,
      evidence: {
        kind: kind,
        explanation: explanation,
        witness: null,
        counterexample: counterexample,
      },
    };
  }

  function log10Sum(left, right) {
    const larger = Math.max(left, right);
    const smaller = Math.min(left, right);
    if (!Number.isFinite(larger)) {
      return larger;
    }
    const gap = smaller - larger;
    return gap < -16
      ? larger
      : larger + Math.log10(1 + Math.pow(10, gap));
  }

  function log10BigInt(value) {
    if (typeof value !== "bigint" || value <= 0n) {
      throw new TypeError("value must be a positive BigInt");
    }
    const text = value.toString();
    const headLength = Math.min(16, text.length);
    const head = Number(text.slice(0, headLength));
    const mantissa = head / Math.pow(10, headLength - 1);
    return text.length - 1 + Math.log10(mantissa);
  }

  function finiteMagnitude(value) {
    const text = value.toString();
    const headLength = Math.min(16, text.length);
    const head = Number(text.slice(0, headLength));
    const mantissa = head / Math.pow(10, headLength - 1);
    const result = mantissa * Math.pow(10, text.length - 1);
    if (!Number.isFinite(result)) {
      throw new RangeError("value is too large for a finite logarithmic model");
    }
    return result;
  }

  function logLinearAffine(n) {
    const logN = log10BigInt(n);
    return log10Sum(Math.log10(2) + logN, Math.log10(7));
  }

  function logIdentity(n) {
    return log10BigInt(n);
  }

  function logNLogN(n) {
    const logN = log10BigInt(n);
    const log2N = logN / LOG10_2;
    if (log2N <= 0) {
      throw new RangeError("n log n is sampled only for n >= 2");
    }
    return logN + Math.log10(log2N);
  }

  function logSquare(n) {
    return 2 * log10BigInt(n);
  }

  function logCube(n) {
    return 3 * log10BigInt(n);
  }

  function logQuadraticPolynomial(n) {
    return log10BigInt(3n * n * n + 5n * n + 7n);
  }

  function logExponential(n) {
    return finiteMagnitude(n) * LOG10_2;
  }

  function logTenthPower(n) {
    return 10 * log10BigInt(n);
  }

  function logOscillatingSpikes(n) {
    const logN = log10BigInt(n);
    return n % 2n === 0n ? logN : 2 * logN;
  }

  function logBoundedOscillation(n) {
    return log10BigInt(n) + (n % 2n === 0n ? 0 : Math.log10(3));
  }

  function oscillatingSampleValues(power) {
    const even = 1n << BigInt(power);
    if (power === 0) {
      return [{ n: 1n, branch: "odd" }];
    }
    return [
      { n: even, branch: "even" },
      { n: even + 1n, branch: "odd" },
    ];
  }

  const SCENARIO_DEFINITIONS = deepFreeze([
    {
      id: "quadratic-polynomial-vs-square",
      title: "Квадратичный многочлен",
      prompt: "Сравните f(n)=3n²+5n+7 и g(n)=n²",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: { label: "3n² + 5n + 7", tex: "3n^2+5n+7" },
      g: { label: "n²", tex: "n^2" },
      ratioSummary: "(3n²+5n+7)/n² = 3+5/n+7/n² → 3",
      logF: logQuadraticPolynomial,
      logG: logSquare,
      claims: {
        O: trueClaim(
          "constant-witness",
          "При n ≥ 1 младшие члены не превосходят 5n² и 7n².",
          {
            c: "15",
            n0: "1",
            inequality: "3n²+5n+7 ≤ 15n²",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Все слагаемые неотрицательны, поэтому остаётся 3n².",
          {
            c: "3",
            n0: "1",
            inequality: "3n²+5n+7 ≥ 3n²",
          }
        ),
        Theta: trueClaim(
          "two-sided-witness",
          "Обе постоянные границы действуют на одном хвосте.",
          {
            lowerC: "3",
            upperC: "15",
            n0: "1",
            inequality: "3n² ≤ 3n²+5n+7 ≤ 15n²",
          }
        ),
        o: falseClaim(
          "nonzero-limit",
          "Отношение стремится к 3, а не к нулю.",
          {
            kind: "ratio-limit",
            ratio: "3+5/n+7/n²",
            limit: "3",
          }
        ),
        omega: falseClaim(
          "finite-limit",
          "Отношение ограничено и стремится к 3.",
          {
            kind: "ratio-limit",
            ratio: "3+5/n+7/n²",
            limit: "3",
          }
        ),
      },
    },
    {
      id: "square-vs-linear",
      title: "Ложная линейная верхняя граница",
      prompt: "Сравните f(n)=n² и g(n)=n",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: { label: "n²", tex: "n^2" },
      g: { label: "n", tex: "n" },
      ratioSummary: "n²/n = n → +∞",
      logF: logSquare,
      logG: logIdentity,
      claims: {
        O: falseClaim(
          "unbounded-ratio",
          "Для любой константы c можно выбрать n>c.",
          {
            kind: "explicit-family",
            choose: "n>max(c,n₀)",
            inequality: "n²>c·n",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "При n ≥ 1 выполнено n² ≥ n.",
          {
            c: "1",
            n0: "1",
            inequality: "n² ≥ n",
          }
        ),
        Theta: falseClaim(
          "missing-upper-bound",
          "Нижняя граница есть, но верхней линейной границы нет.",
          {
            kind: "failed-required-relation",
            missingRelation: "O",
            sequence: "n → ∞",
            ratio: "n²/n = n → +∞",
          }
        ),
        o: falseClaim(
          "diverging-ratio",
          "Отношение растёт, а не стремится к нулю.",
          {
            kind: "ratio-limit",
            ratio: "n",
            limit: "+∞",
          }
        ),
        omega: trueClaim(
          "ratio-limit",
          "Квадратичная функция превосходит любую постоянную кратность n.",
          {
            limit: "+∞",
            ratio: "n",
            quantifier: "Для каждого c>0 достаточно взять n₀>c.",
          }
        ),
      },
    },
    {
      id: "linear-vs-square",
      title: "Неточная квадратичная граница",
      prompt: "Сравните f(n)=n и g(n)=n²",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: { label: "n", tex: "n" },
      g: { label: "n²", tex: "n^2" },
      ratioSummary: "n/n² = 1/n → 0",
      logF: logIdentity,
      logG: logSquare,
      claims: {
        O: trueClaim(
          "constant-witness",
          "При n ≥ 1 выполнено n ≤ n².",
          {
            c: "1",
            n0: "1",
            inequality: "n ≤ n²",
          }
        ),
        Omega: falseClaim(
          "vanishing-ratio",
          "Никакая положительная кратность n² не остаётся снизу.",
          {
            kind: "arbitrarily-small-ratio",
            ratio: "1/n → 0",
          }
        ),
        Theta: falseClaim(
          "missing-lower-bound",
          "Верхняя граница верна, но не точна.",
          {
            kind: "failed-required-relation",
            missingRelation: "Omega",
            sequence: "n → ∞",
            ratio: "n/n² = 1/n → 0",
          }
        ),
        o: trueClaim(
          "ratio-limit",
          "Отношение 1/n стремится к нулю.",
          {
            limit: "0",
            ratio: "1/n",
            quantifier: "Для каждого c>0 достаточно взять n₀>1/c.",
          }
        ),
        omega: falseClaim(
          "vanishing-ratio",
          "Отношение стремится к нулю.",
          {
            kind: "ratio-limit",
            ratio: "1/n",
            limit: "0",
          }
        ),
      },
    },
    {
      id: "exponential-vs-cubic",
      title: "Ложная кубическая верхняя граница",
      prompt: "Сравните f(n)=2ⁿ и g(n)=n³",
      domain: "n ∈ ℕ, n ≥ 2",
      minimumN: 2n,
      f: { label: "2ⁿ", tex: "2^n" },
      g: { label: "n³", tex: "n^3" },
      ratioSummary: "2ⁿ/n³ → +∞",
      logF: logExponential,
      logG: logCube,
      claims: {
        O: falseClaim(
          "unbounded-ratio",
          "Экспонента в итоге превосходит любую постоянную кратность n³.",
          {
            kind: "arbitrarily-large-ratio",
            ratio: "2ⁿ/n³ → +∞",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Начиная с n=10 отношение больше единицы и возрастает.",
          {
            c: "1",
            n0: "10",
            inequality: "2ⁿ ≥ n³ при n ≥ 10",
          }
        ),
        Theta: falseClaim(
          "missing-upper-bound",
          "Нижняя граница есть, но кубической верхней границы нет.",
          {
            kind: "failed-required-relation",
            missingRelation: "O",
            sequence: "n → ∞",
            ratio: "2ⁿ/n³ → +∞",
          }
        ),
        o: falseClaim(
          "diverging-ratio",
          "Отношение стремится к бесконечности.",
          {
            kind: "ratio-limit",
            ratio: "2ⁿ/n³",
            limit: "+∞",
          }
        ),
        omega: trueClaim(
          "ratio-limit",
          "Экспонента имеет строго больший порядок.",
          {
            limit: "+∞",
            ratio: "2ⁿ/n³",
            quantifier: "Для каждого c>0 найдётся подходящий хвост.",
          }
        ),
      },
    },
    {
      id: "affine-vs-linear",
      title: "Линейная функция с добавкой",
      prompt: "Сравните f(n)=2n+7 и g(n)=n",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: { label: "2n + 7", tex: "2n+7" },
      g: { label: "n", tex: "n" },
      ratioSummary: "(2n+7)/n = 2+7/n → 2",
      logF: logLinearAffine,
      logG: logIdentity,
      claims: {
        O: trueClaim(
          "constant-witness",
          "Добавка 7 перестаёт менять порядок роста.",
          {
            c: "9",
            n0: "1",
            inequality: "2n+7 ≤ 9n при n ≥ 1",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Функция f всегда не меньше 2n.",
          {
            c: "2",
            n0: "1",
            inequality: "2n+7 ≥ 2n при n ≥ 1",
          }
        ),
        Theta: trueClaim(
          "two-sided-witness",
          "Обе постоянные границы действуют одновременно.",
          {
            lowerC: "2",
            upperC: "9",
            n0: "1",
            inequality: "2n ≤ 2n+7 ≤ 9n",
          }
        ),
        o: falseClaim(
          "nonzero-limit",
          "Отношение не стремится к нулю.",
          {
            kind: "ratio-limit",
            ratio: "2+7/n",
            limit: "2",
          }
        ),
        omega: falseClaim(
          "finite-limit",
          "Отношение не растёт без границ.",
          {
            kind: "ratio-limit",
            ratio: "2+7/n",
            limit: "2",
          }
        ),
      },
    },
    {
      id: "n-log-n-vs-square",
      title: "Линейно-логарифмический рост против квадратичного",
      prompt: "Сравните f(n)=n·log₂n и g(n)=n²",
      domain: "n ∈ ℕ, n ≥ 2",
      minimumN: 2n,
      f: { label: "n · log₂ n", tex: "n\\log_2 n" },
      g: { label: "n²", tex: "n^2" },
      ratioSummary: "(n log₂n)/n² = log₂n/n → 0",
      logF: logNLogN,
      logG: logSquare,
      claims: {
        O: trueClaim(
          "constant-witness",
          "Для n ≥ 2 выполнено log₂n ≤ n.",
          {
            c: "1",
            n0: "2",
            inequality: "n·log₂n ≤ n²",
          }
        ),
        Omega: falseClaim(
          "vanishing-ratio",
          "Нельзя подобрать положительную нижнюю константу для всех больших n.",
          {
            kind: "arbitrarily-small-ratio",
            sequence: "n → ∞",
            ratio: "log₂n/n → 0",
          }
        ),
        Theta: falseClaim(
          "missing-lower-bound",
          "Верхняя граница есть, но нижней границы того же порядка нет.",
          {
            kind: "failed-required-relation",
            missingRelation: "Omega",
            ratio: "log₂n/n → 0",
          }
        ),
        o: trueClaim(
          "ratio-limit",
          "Отношение f(n)/g(n) стремится к нулю.",
          {
            limit: "0",
            ratio: "log₂n/n",
            quantifier:
              "Для каждого ε>0 найдётся n₀, после которого log₂n/n<ε.",
          }
        ),
        omega: falseClaim(
          "vanishing-ratio",
          "Отношение идёт в противоположную сторону: к нулю.",
          {
            kind: "ratio-limit",
            ratio: "log₂n/n",
            limit: "0",
          }
        ),
      },
    },
    {
      id: "exponential-vs-polynomial",
      title: "Экспонента против многочлена",
      prompt: "Сравните f(n)=2ⁿ и g(n)=n¹⁰",
      domain: "n ∈ ℕ, n ≥ 2",
      minimumN: 2n,
      f: { label: "2ⁿ", tex: "2^n" },
      g: { label: "n¹⁰", tex: "n^{10}" },
      ratioSummary: "2ⁿ/n¹⁰ → +∞",
      logF: logExponential,
      logG: logTenthPower,
      claims: {
        O: falseClaim(
          "unbounded-ratio",
          "Никакая постоянная кратность n¹⁰ не ограничивает 2ⁿ сверху.",
          {
            kind: "arbitrarily-large-ratio",
            sequence: "n → ∞",
            ratio: "2ⁿ/n¹⁰ → +∞",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Начиная с 60 отношение больше единицы и затем возрастает.",
          {
            c: "1",
            n0: "60",
            inequality: "2ⁿ ≥ n¹⁰ при n ≥ 60",
            monotonicity:
              "Следующее отношение делится на предыдущее как 2(n/(n+1))¹⁰>1.",
          }
        ),
        Theta: falseClaim(
          "missing-upper-bound",
          "Нижняя граница есть, но верхней границы того же порядка нет.",
          {
            kind: "failed-required-relation",
            missingRelation: "O",
            ratio: "2ⁿ/n¹⁰ → +∞",
          }
        ),
        o: falseClaim(
          "diverging-ratio",
          "Отношение не стремится к нулю.",
          {
            kind: "ratio-limit",
            ratio: "2ⁿ/n¹⁰",
            limit: "+∞",
          }
        ),
        omega: trueClaim(
          "ratio-limit",
          "Экспонента превосходит любую постоянную кратность этого многочлена.",
          {
            limit: "+∞",
            ratio: "2ⁿ/n¹⁰",
            quantifier:
              "Для каждого c>0 найдётся n₀, после которого 2ⁿ>c·n¹⁰.",
          }
        ),
      },
    },
    {
      id: "oscillating-spikes",
      title: "Чередующиеся масштабы",
      prompt: "f(n)=n для чётных n и n² для нечётных; g(n)=n",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: {
        label: "n (чётные), n² (нечётные)",
        tex: "\\begin{cases}n,&2\\mid n\\\\n^2,&2\\nmid n\\end{cases}",
      },
      g: { label: "n", tex: "n" },
      ratioSummary: "f(n)/g(n) равно 1 на чётных n и n на нечётных",
      logF: logOscillatingSpikes,
      logG: logIdentity,
      sampleValues: oscillatingSampleValues,
      claims: {
        O: falseClaim(
          "odd-subsequence",
          "На нечётной подпоследовательности отношение равно n и не ограничено.",
          {
            kind: "subsequence",
            choose:
              "Для любых c и n₀ возьмите нечётное n>max(c,n₀). Тогда f(n)>c·g(n).",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Обе ветви не меньше n.",
          {
            c: "1",
            n0: "1",
            inequality: "f(n) ≥ n = g(n)",
          }
        ),
        Theta: falseClaim(
          "missing-upper-bound",
          "Одной нижней границы недостаточно для Θ.",
          {
            kind: "failed-required-relation",
            missingRelation: "O",
            sequence: "нечётные n",
          }
        ),
        o: falseClaim(
          "even-subsequence",
          "На всех чётных n отношение остаётся равным 1.",
          {
            kind: "subsequence",
            sequence: "n=2k",
            ratio: "1",
          }
        ),
        omega: falseClaim(
          "even-subsequence",
          "Для c=2 никакой порог не исключит чётные n с отношением 1.",
          {
            kind: "subsequence",
            sequence: "n=2k",
            ratio: "1",
            failedConstant: "2",
          }
        ),
      },
    },
    {
      id: "bounded-oscillation",
      title: "Одинаковый порядок без предела отношения",
      prompt: "f(n)=n для чётных n и 3n для нечётных; g(n)=n",
      domain: "n ∈ ℕ, n ≥ 1",
      minimumN: 1n,
      f: {
        label: "n (чётные), 3n (нечётные)",
        tex: "\\begin{cases}n,&2\\mid n\\\\3n,&2\\nmid n\\end{cases}",
      },
      g: { label: "n", tex: "n" },
      ratioSummary: "f(n)/g(n) чередуется между 1 и 3",
      logF: logBoundedOscillation,
      logG: logIdentity,
      sampleValues: oscillatingSampleValues,
      claims: {
        O: trueClaim(
          "constant-witness",
          "Обе ветви не превосходят 3n.",
          {
            c: "3",
            n0: "1",
            inequality: "f(n) ≤ 3n",
          }
        ),
        Omega: trueClaim(
          "constant-witness",
          "Обе ветви не меньше n.",
          {
            c: "1",
            n0: "1",
            inequality: "f(n) ≥ n",
          }
        ),
        Theta: trueClaim(
          "two-sided-witness",
          "Для Θ не требуется существование предела отношения.",
          {
            lowerC: "1",
            upperC: "3",
            n0: "1",
            inequality: "n ≤ f(n) ≤ 3n",
          }
        ),
        o: falseClaim(
          "bounded-away-from-zero",
          "Отношение всегда не меньше единицы.",
          {
            kind: "uniform-bound",
            inequality: "f(n)/g(n) ≥ 1",
          }
        ),
        omega: falseClaim(
          "bounded-ratio",
          "Отношение всегда не больше трёх.",
          {
            kind: "uniform-bound",
            inequality: "f(n)/g(n) ≤ 3",
          }
        ),
      },
    },
  ]);

  const SCENARIO_BY_ID = new Map(SCENARIO_DEFINITIONS.map(function (scenario) {
    return [scenario.id, scenario];
  }));

  function publicScenario(scenario) {
    return deepFreeze({
      id: scenario.id,
      title: scenario.title,
      prompt: scenario.prompt,
      domain: scenario.domain,
      minimumN: scenario.minimumN,
      f: scenario.f,
      g: scenario.g,
    });
  }

  const SCENARIOS = Object.freeze(SCENARIO_DEFINITIONS.map(publicScenario));

  function getScenarioDefinition(scenarioId) {
    const scenario = SCENARIO_BY_ID.get(String(scenarioId));
    if (!scenario) {
      throw new RangeError("unknown asymptotic scenario: " + scenarioId);
    }
    return scenario;
  }

  function getRelation(relationId) {
    const relation = RELATION_BY_ID.get(String(relationId));
    if (!relation) {
      throw new RangeError("unknown asymptotic relation: " + relationId);
    }
    return relation;
  }

  function getScenario(scenarioId) {
    return publicScenario(getScenarioDefinition(scenarioId));
  }

  function relationStatement(scenario, relation) {
    return scenario.f.tex + " \\in " + relation.symbol + "(" + scenario.g.tex + ")";
  }

  function relationResult(scenarioId, relationId) {
    const scenario = getScenarioDefinition(scenarioId);
    const relation = getRelation(relationId);
    const claim = scenario.claims[relation.id];
    return deepFreeze({
      scenarioId: scenario.id,
      relationId: relation.id,
      symbol: relation.symbol,
      statement: relationStatement(scenario, relation),
      holds: claim.holds,
      basis: "analytic",
      ratioSummary: scenario.ratioSummary,
      evidence: claim.evidence,
    });
  }

  function checkClaim(scenarioId, relationId, claimedTrue) {
    if (typeof claimedTrue !== "boolean") {
      throw new TypeError("claimedTrue must be a boolean");
    }
    const result = relationResult(scenarioId, relationId);
    return deepFreeze({
      scenarioId: result.scenarioId,
      relationId: result.relationId,
      claimed: claimedTrue,
      holds: result.holds,
      correct: claimedTrue === result.holds,
      basis: result.basis,
      evidence: result.evidence,
    });
  }

  function checkClassification(scenarioId, selectedRelationIds) {
    if (!Array.isArray(selectedRelationIds)) {
      throw new TypeError("selectedRelationIds must be an array");
    }
    const selected = new Set();
    selectedRelationIds.forEach(function (relationId) {
      const relation = getRelation(relationId);
      if (selected.has(relation.id)) {
        throw new Error("duplicate asymptotic relation: " + relation.id);
      }
      selected.add(relation.id);
    });

    const actual = RELATIONS.filter(function (relation) {
      return relationResult(scenarioId, relation.id).holds;
    }).map(function (relation) {
      return relation.id;
    });
    const actualSet = new Set(actual);
    const missing = actual.filter(function (relationId) {
      return !selected.has(relationId);
    });
    const extra = Array.from(selected).filter(function (relationId) {
      return !actualSet.has(relationId);
    });

    return deepFreeze({
      scenarioId: getScenarioDefinition(scenarioId).id,
      selected: Array.from(selected),
      actual: actual,
      missing: missing,
      extra: extra,
      correct: missing.length === 0 && extra.length === 0,
    });
  }

  function parseSampleOptions(scenario, rawOptions) {
    const options = rawOptions || {};
    const defaultMinimumPower = scenario.minimumN > 1n ? 1 : 0;
    const minimumPower = options.minimumPower === undefined
      ? defaultMinimumPower
      : Number(options.minimumPower);
    const maximumPower = options.maximumPower === undefined
      ? 64
      : Number(options.maximumPower);
    const count = options.count === undefined ? 17 : Number(options.count);

    if (!Number.isInteger(minimumPower) ||
        !Number.isInteger(maximumPower) ||
        minimumPower < 0 ||
        maximumPower < minimumPower ||
        maximumPower > MAX_SAMPLE_POWER) {
      throw new RangeError(
        "sample powers must satisfy 0 ≤ minimum ≤ maximum ≤ " +
        MAX_SAMPLE_POWER
      );
    }
    if (!Number.isInteger(count) ||
        count < MIN_SAMPLE_COUNT ||
        count > MAX_SAMPLE_COUNT) {
      throw new RangeError(
        "sample count must be between " + MIN_SAMPLE_COUNT +
        " and " + MAX_SAMPLE_COUNT
      );
    }
    if (count > maximumPower - minimumPower + 1) {
      throw new RangeError("sample range is too short for unique points");
    }
    if ((1n << BigInt(minimumPower)) < scenario.minimumN) {
      throw new RangeError("sample range starts outside the scenario domain");
    }
    return {
      minimumPower: minimumPower,
      maximumPower: maximumPower,
      count: count,
    };
  }

  function normalizedShare(value, minimum, maximum) {
    if (maximum === minimum) {
      return 0.5;
    }
    const share = (value - minimum) / (maximum - minimum);
    return Math.max(0, Math.min(1, share));
  }

  function sampleScenario(scenarioId, rawOptions) {
    const scenario = getScenarioDefinition(scenarioId);
    const options = parseSampleOptions(scenario, rawOptions);
    const span = options.maximumPower - options.minimumPower;
    const powers = [];
    for (let index = 0; index < options.count; index += 1) {
      const power = options.minimumPower +
        Math.round(index * span / (options.count - 1));
      if (powers.at(-1) !== power) {
        powers.push(power);
      }
    }

    const rawPoints = powers.flatMap(function (power) {
      const values = scenario.sampleValues
        ? scenario.sampleValues(power)
        : [{ n: 1n << BigInt(power), branch: null }];
      return values.map(function (sample) {
        const n = sample.n;
        const log10N = log10BigInt(n);
        const log10F = scenario.logF(n);
        const log10G = scenario.logG(n);
        if (![log10N, log10F, log10G].every(Number.isFinite)) {
          throw new RangeError("scenario produced a non-finite logarithmic sample");
        }
        return {
          power: power,
          branch: sample.branch,
          n: n,
          nLabel: power <= 52 ? n.toString() : "≈ 2^" + power,
          log10N: log10N,
          log10F: log10F,
          log10G: log10G,
          log10Ratio: log10F - log10G,
        };
      });
    });

    const allLogs = rawPoints.flatMap(function (point) {
      return [point.log10F, point.log10G];
    });
    const minimumLog = Math.min.apply(null, allLogs);
    const maximumLog = Math.max.apply(null, allLogs);
    const points = rawPoints.map(function (point) {
      return Object.freeze(Object.assign({}, point, {
        xShare: normalizedShare(
          point.power,
          options.minimumPower,
          options.maximumPower
        ),
        fShare: normalizedShare(point.log10F, minimumLog, maximumLog),
        gShare: normalizedShare(point.log10G, minimumLog, maximumLog),
      }));
    });

    return deepFreeze({
      scenarioId: scenario.id,
      kind: "finite-illustration",
      proves: false,
      warning:
        "Конечный график иллюстрирует значения, но не доказывает асимптотическое отношение.",
      xScale: "log2",
      yScale: "log10",
      sampleBuckets: options.count,
      minimumPower: options.minimumPower,
      maximumPower: options.maximumPower,
      minimumLog: minimumLog,
      maximumLog: maximumLog,
      points: points,
    });
  }

  function parsePositiveConstant(rawValue) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0 || value > 1000000) {
      throw new RangeError("c must be a positive finite number not exceeding 1000000");
    }
    return value;
  }

  function parseNatural(rawValue, label) {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_WINDOW_N) {
      throw new RangeError(
        (label || "n") + " must be an integer between 1 and " + MAX_WINDOW_N
      );
    }
    return value;
  }

  function logRatioAt(scenario, rawN) {
    const n = typeof rawN === "bigint" ? rawN : BigInt(rawN);
    if (n < scenario.minimumN) {
      throw new RangeError("n is outside the scenario domain");
    }
    return scenario.logF(n) - scenario.logG(n);
  }

  function minimumLogRatioOnRange(scenario, start, end) {
    let minimum = Infinity;
    for (let n = start; n <= end; n += 1) {
      minimum = Math.min(minimum, logRatioAt(scenario, n));
    }
    return minimum;
  }

  function tailRatioBounds(scenarioId, rawN0) {
    const scenario = getScenarioDefinition(scenarioId);
    const n0 = Math.max(
      parseNatural(rawN0, "n0"),
      Number(scenario.minimumN)
    );
    const atN0 = logRatioAt(scenario, n0);

    switch (scenario.id) {
      case "quadratic-polynomial-vs-square":
        return { lower: Math.log10(3), upper: atN0, exact: true };
      case "affine-vs-linear":
        return { lower: Math.log10(2), upper: atN0, exact: true };
      case "square-vs-linear":
        return { lower: atN0, upper: Infinity, exact: true };
      case "linear-vs-square":
        return { lower: -Infinity, upper: atN0, exact: true };
      case "n-log-n-vs-square": {
        const maximumAt = n0 <= 3 ? 3 : n0;
        return {
          lower: -Infinity,
          upper: logRatioAt(scenario, maximumAt),
          exact: true,
        };
      }
      case "exponential-vs-cubic": {
        const end = Math.max(n0, 10);
        return {
          lower: minimumLogRatioOnRange(scenario, n0, end),
          upper: Infinity,
          exact: true,
        };
      }
      case "exponential-vs-polynomial": {
        const end = Math.max(n0, 60);
        return {
          lower: minimumLogRatioOnRange(scenario, n0, end),
          upper: Infinity,
          exact: true,
        };
      }
      case "oscillating-spikes":
        return { lower: 0, upper: Infinity, exact: true };
      case "bounded-oscillation":
        return { lower: 0, upper: Math.log10(3), exact: true };
      default:
        throw new RangeError("tail bounds are unavailable for " + scenario.id);
    }
  }

  function compareLogs(left, right, strict) {
    return strict ? left < right : left <= right;
  }

  function pointSatisfies(relationId, logRatio, constant) {
    const logC = Math.log10(constant);
    switch (getRelation(relationId).id) {
      case "O":
        return compareLogs(logRatio, logC, false);
      case "Omega":
        return compareLogs(logC, logRatio, false);
      case "Theta":
        return compareLogs(logRatio, logC, false) &&
          compareLogs(-logC, logRatio, false);
      case "o":
        return compareLogs(logRatio, logC, true);
      case "omega":
        return compareLogs(logC, logRatio, true);
      default:
        return false;
    }
  }

  function tailConditionStep(relationId, bounds, constant) {
    const lower = formatLogMagnitude(bounds.lower);
    const upper = formatLogMagnitude(bounds.upper);
    const reciprocal = formatLogMagnitude(-Math.log10(constant));

    switch (relationId) {
      case "O":
        return "На всём хвосте sup f(n)/g(n) = " + upper +
          "; для выбранного c требуется значение не больше " + constant + ".";
      case "Omega":
        return "На всём хвосте inf f(n)/g(n) = " + lower +
          "; для выбранного c требуется значение не меньше " + constant + ".";
      case "Theta":
        return "На всём хвосте отношение лежит между " + lower + " и " +
          upper + "; выбранная полоса требует границ от " + reciprocal +
          " до " + constant + ".";
      case "o":
        return "Для выбранного c верхняя граница отношения на хвосте равна " +
          upper + " и должна быть строго меньше " + constant + ".";
      case "omega":
        return "Для выбранного c нижняя граница отношения на хвосте равна " +
          lower + " и должна быть строго больше " + constant + ".";
      default:
        return "";
    }
  }

  function witnessSteps(
    result,
    constant,
    n0,
    selectedTailValid,
    witnessValid,
    bounds
  ) {
    const relation = getRelation(result.relationId);
    const evidence = result.evidence;
    const steps = [
      relation.definition,
      "Выбраны c=" + constant + " и n₀=" + n0 + ".",
      tailConditionStep(result.relationId, bounds, constant),
    ];
    if (result.holds) {
      steps.push(evidence.explanation);
      const witness = evidence.witness || {};
      if (witness.ratio) {
        steps.push("Рассматриваем отношение " + witness.ratio + ".");
      }
      if (witness.monotonicity) {
        steps.push(witness.monotonicity);
      }
      if (witness.quantifier) {
        steps.push(witness.quantifier);
      }
      steps.push(witnessValid
        ? "Выбранные параметры покрывают весь требуемый хвост."
        : "Эти параметры ещё не покрывают весь хвост; увеличьте c или n₀ в нужном направлении.");
    } else {
      steps.push(evidence.explanation);
      if (selectedTailValid &&
          (result.relationId === "o" || result.relationId === "omega")) {
        steps.push(
          "Для этого конкретного c неравенство на выбранном хвосте выполнено, " +
          "но отношение требует того же результата для каждого c>0."
        );
      } else {
        steps.push(
          "Выбранная пара не покрывает весь хвост; нарушение можно искать отдельно " +
          "от аналитического опровержения самого отношения."
        );
      }
      steps.push(
        "Аналитическое опровержение отношения не зависит от ширины показанного графика."
      );
    }
    return steps;
  }

  function checkWitness(scenarioId, relationId, rawConstant, rawN0) {
    const constant = parsePositiveConstant(rawConstant);
    const scenario = getScenarioDefinition(scenarioId);
    const n0 = Math.max(
      parseNatural(rawN0, "n0"),
      Number(scenario.minimumN)
    );
    const result = relationResult(scenario.id, relationId);
    const bounds = tailRatioBounds(scenario.id, n0);
    const logC = Math.log10(constant);
    let selectedTailValid = false;

    switch (result.relationId) {
      case "O":
        selectedTailValid = compareLogs(bounds.upper, logC, false);
        break;
      case "Omega":
        selectedTailValid = compareLogs(logC, bounds.lower, false);
        break;
      case "Theta":
        selectedTailValid = constant >= 1 &&
          compareLogs(bounds.upper, logC, false) &&
          compareLogs(-logC, bounds.lower, false);
        break;
      case "o":
        selectedTailValid = compareLogs(bounds.upper, logC, true);
        break;
      case "omega":
        selectedTailValid = compareLogs(logC, bounds.lower, true);
        break;
      default:
        selectedTailValid = false;
    }
    const witnessValid = result.holds && selectedTailValid;

    return deepFreeze({
      scenarioId: scenario.id,
      relationId: result.relationId,
      statement: result.statement,
      relationHolds: result.holds,
      witnessValid: witnessValid,
      selectedTailValid: selectedTailValid,
      basis: "analytic",
      constant: constant,
      n0: n0,
      tailBounds: {
        lowerLog10: bounds.lower,
        upperLog10: bounds.upper,
        lowerLabel: formatLogMagnitude(bounds.lower),
        upperLabel: formatLogMagnitude(bounds.upper),
        exact: bounds.exact,
      },
      interpretation: result.relationId === "Theta"
        ? "Лаборатория проверяет симметричную полосу g/c ≤ f ≤ c·g."
        : result.relationId === "o" || result.relationId === "omega"
          ? "Пара проверяет выбранное c; истинность для каждого c установлена аналитическим сценарием."
          : "Пара (c,n₀) проверена для всего бесконечного хвоста.",
      evidence: result.evidence,
      steps: witnessSteps(
        result,
        constant,
        n0,
        selectedTailValid,
        witnessValid,
        bounds
      ),
    });
  }

  function formatLogMagnitude(logValue) {
    if (!Number.isFinite(logValue)) {
      return logValue > 0 ? "+∞" : "0";
    }
    if (logValue < 9) {
      const value = Math.pow(10, logValue);
      const rounded = Math.abs(value - Math.round(value)) < 1e-7
        ? Math.round(value)
        : Number(value.toPrecision(6));
      return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 6,
      }).format(rounded);
    }
    const exponent = Math.floor(logValue);
    const mantissa = Math.pow(10, logValue - exponent);
    return "≈ " + mantissa.toFixed(3).replace(".", ",") + "·10^" + exponent;
  }

  function evaluatePoint(scenarioId, rawN, rawConstant, relationId) {
    const scenario = getScenarioDefinition(scenarioId);
    const n = Math.max(
      parseNatural(rawN, "n"),
      Number(scenario.minimumN)
    );
    const constant = parsePositiveConstant(rawConstant);
    const log10F = scenario.logF(BigInt(n));
    const log10G = scenario.logG(BigInt(n));
    const log10Ratio = log10F - log10G;
    const log10Bound = log10G + Math.log10(constant);
    const log10LowerBound = log10G - Math.log10(constant);
    return deepFreeze({
      scenarioId: scenario.id,
      relationId: getRelation(relationId).id,
      n: n,
      nLabel: new Intl.NumberFormat("ru-RU").format(n),
      log10F: log10F,
      log10G: log10G,
      log10Ratio: log10Ratio,
      log10Bound: log10Bound,
      log10LowerBound: log10LowerBound,
      fLabel: formatLogMagnitude(log10F),
      gLabel: formatLogMagnitude(log10G),
      boundLabel: formatLogMagnitude(log10Bound),
      lowerBoundLabel: formatLogMagnitude(log10LowerBound),
      ratioLabel: formatLogMagnitude(log10Ratio),
      satisfies: pointSatisfies(relationId, log10Ratio, constant),
    });
  }

  function uniqueNumbers(values) {
    return Array.from(new Set(values)).sort(function (left, right) {
      return left - right;
    });
  }

  function sampleWindow(scenarioId, rawOptions) {
    const scenario = getScenarioDefinition(scenarioId);
    const options = rawOptions || {};
    const minimumN = Number(scenario.minimumN);
    const maximumN = parseNatural(options.maximumN === undefined ? 120 : options.maximumN, "maximumN");
    const count = Number(options.count === undefined ? 49 : options.count);
    const scale = options.scale === "log" ? "log" : "linear";
    const constant = parsePositiveConstant(
      options.constant === undefined ? 1 : options.constant
    );
    const relationId = getRelation(options.relationId || "O").id;
    const n0 = Math.max(
      parseNatural(options.n0 === undefined ? minimumN : options.n0, "n0"),
      minimumN
    );
    if (maximumN < minimumN) {
      throw new RangeError("maximumN is outside the scenario domain");
    }
    if (!Number.isInteger(count) || count < 2 || count > MAX_SAMPLE_COUNT) {
      throw new RangeError(
        "sample count must be between 2 and " + MAX_SAMPLE_COUNT
      );
    }

    const baseValues = [];
    const logMinimum = Math.log(minimumN);
    const logMaximum = Math.log(maximumN);
    for (let index = 0; index < count; index += 1) {
      const share = index / (count - 1);
      const raw = scale === "log"
        ? Math.exp(logMinimum + share * (logMaximum - logMinimum))
        : minimumN + share * (maximumN - minimumN);
      baseValues.push(Math.max(minimumN, Math.min(maximumN, Math.round(raw))));
    }
    baseValues.push(n0 <= maximumN ? n0 : maximumN);

    if (scenario.sampleValues) {
      baseValues.slice().forEach(function (n) {
        if (n % 2 === 0 && n + 1 <= maximumN) {
          baseValues.push(n + 1);
        } else if (n % 2 === 1 && n - 1 >= minimumN) {
          baseValues.push(n - 1);
        }
      });
    }

    const values = uniqueNumbers(baseValues);
    const logC = Math.log10(constant);
    const rawPoints = values.map(function (n) {
      const log10N = Math.log10(n);
      const log10F = scenario.logF(BigInt(n));
      const log10G = scenario.logG(BigInt(n));
      const log10Ratio = log10F - log10G;
      const log10Bound = log10G + logC;
      const log10LowerBound = log10G - logC;
      return {
        n: n,
        log10N: log10N,
        log10F: log10F,
        log10G: log10G,
        log10Ratio: log10Ratio,
        log10Bound: log10Bound,
        log10LowerBound: log10LowerBound,
        inTail: n >= n0,
        satisfies: pointSatisfies(relationId, log10Ratio, constant),
      };
    });
    const allLogs = rawPoints.flatMap(function (point) {
      return relationId === "Theta"
        ? [point.log10F, point.log10G, point.log10Bound, point.log10LowerBound]
        : [point.log10F, point.log10G, point.log10Bound];
    });
    const minimumLog = Math.min.apply(null, allLogs);
    const maximumLog = Math.max.apply(null, allLogs);

    function xShare(point) {
      if (maximumN === minimumN) {
        return 0.5;
      }
      return scale === "log"
        ? normalizedShare(point.log10N, Math.log10(minimumN), Math.log10(maximumN))
        : normalizedShare(point.n, minimumN, maximumN);
    }

    function yShare(logValue) {
      if (scale === "log") {
        return normalizedShare(logValue, minimumLog, maximumLog);
      }
      if (maximumLog === minimumLog) {
        return 0.5;
      }
      return Math.max(0, Math.min(1, Math.pow(10, logValue - maximumLog)));
    }

    const points = rawPoints.map(function (point) {
      return Object.freeze(Object.assign({}, point, {
        xShare: xShare(point),
        fShare: yShare(point.log10F),
        gShare: yShare(point.log10G),
        boundShare: yShare(point.log10Bound),
        lowerBoundShare: yShare(point.log10LowerBound),
        violation: point.inTail && !point.satisfies,
      }));
    });

    return deepFreeze({
      scenarioId: scenario.id,
      relationId: relationId,
      kind: "finite-illustration",
      proves: false,
      warning:
        "Проверка конечного диапазона иллюстрирует утверждение, но не доказывает его для всех n ≥ n₀.",
      scale: scale,
      minimumN: minimumN,
      maximumN: maximumN,
      n0: n0,
      constant: constant,
      minimumLog: minimumLog,
      maximumLog: maximumLog,
      points: points,
    });
  }

  function findCounterexample(scenarioId, relationId, rawConstant, rawN0) {
    const scenario = getScenarioDefinition(scenarioId);
    const relation = relationResult(scenario.id, relationId);
    const constant = parsePositiveConstant(rawConstant);
    const n0 = Math.max(
      parseNatural(rawN0, "n0"),
      Number(scenario.minimumN)
    );
    const witness = checkWitness(
      scenario.id,
      relation.relationId,
      constant,
      n0
    );

    if (witness.selectedTailValid) {
      const selectedConstantBenign = !relation.holds &&
        (relation.relationId === "o" || relation.relationId === "omega");
      return deepFreeze({
        found: false,
        relationHolds: relation.holds,
        witnessValid: witness.witnessValid,
        selectedTailValid: true,
        selectedConstantBenign: selectedConstantBenign,
        subject: selectedConstantBenign ? "relation" : "selected-witness",
        reason: selectedConstantBenign
          ? "Выбранное c совместимо с неравенством на этом хвосте, но " +
            "отношение требует его для каждого c>0 и опровергается аналитически."
          : "Выбранная пара покрывает весь хвост; нарушения для неё нет.",
        evidence: relation.holds ? relation.evidence.witness :
          relation.evidence.counterexample,
        analyticRefutation: relation.holds ? null :
          relation.evidence.counterexample,
      });
    }

    const candidates = [];
    const localEnd = Math.min(MAX_WINDOW_N, n0 + 10000);
    for (let n = n0; n <= localEnd; n += 1) {
      candidates.push(n);
    }
    let n = Math.max(localEnd + 1, n0 * 2);
    while (n <= MAX_WINDOW_N) {
      candidates.push(n);
      if (n % 2 === 0 && n + 1 <= MAX_WINDOW_N) {
        candidates.push(n + 1);
      }
      n = Math.min(MAX_WINDOW_N + 1, n * 2);
    }

    const violating = candidates.find(function (candidate) {
      return !pointSatisfies(
        relationId,
        logRatioAt(scenario, candidate),
        constant
      );
    });
    if (violating !== undefined) {
      return deepFreeze({
        found: true,
        relationHolds: relation.holds,
        witnessValid: false,
        selectedTailValid: false,
        selectedConstantBenign: false,
        subject: "selected-witness",
        n: violating,
        point: evaluatePoint(scenario.id, violating, constant, relationId),
        reason: relation.holds
          ? "Точка нарушает выбранную пару (c,n₀), но не опровергает само " +
            "асимптотическое отношение: для него существует другой свидетель."
          : "Точка нарушает выбранную пару; само отношение независимо " +
            "опровергается аналитическим аргументом.",
        evidence: relation.holds ? relation.evidence.witness :
          relation.evidence.counterexample,
        analyticRefutation: relation.holds ? null :
          relation.evidence.counterexample,
      });
    }
    return deepFreeze({
      found: false,
      relationHolds: relation.holds,
      witnessValid: false,
      selectedTailValid: false,
      selectedConstantBenign: false,
      subject: relation.holds ? "selected-witness" : "relation",
      reason:
        "Нарушение выбранной пары не попало в безопасный диапазон поиска. " +
        (relation.holds
          ? "Это не меняет истинность отношения с другим свидетелем."
          : "Само отношение всё равно опровергается аналитически."),
      evidence: relation.holds ? relation.evidence.witness :
        relation.evidence.counterexample,
      analyticRefutation: relation.holds ? null :
        relation.evidence.counterexample,
    });
  }

  function hasSubstantiveCounterexample(counterexample) {
    return [
      "ratio",
      "sequence",
      "choose",
      "inequality",
      "failedConstant",
    ].some(function (key) {
      return typeof counterexample[key] === "string" &&
        counterexample[key].trim().length > 0;
    });
  }

  function validateScenarioTable() {
    const ids = new Set();
    SCENARIO_DEFINITIONS.forEach(function (scenario) {
      if (!/^[a-z0-9-]+$/.test(scenario.id) || ids.has(scenario.id)) {
        throw new Error("invalid or duplicate scenario id: " + scenario.id);
      }
      ids.add(scenario.id);
      RELATIONS.forEach(function (relation) {
        const claim = scenario.claims[relation.id];
        if (!claim || typeof claim.holds !== "boolean") {
          throw new Error(
            "missing relation " + relation.id + " in scenario " + scenario.id
          );
        }
        if (claim.holds && !claim.evidence.witness) {
          throw new Error("true relation must have an analytic witness");
        }
        if (!claim.holds && !claim.evidence.counterexample) {
          throw new Error("false relation must have a counterexample");
        }
        if (!claim.holds &&
            !hasSubstantiveCounterexample(claim.evidence.counterexample)) {
          throw new Error(
            "false relation must have substantive analytic evidence: " +
            scenario.id + " " + relation.id
          );
        }
      });

      const holds = function (relationId) {
        return scenario.claims[relationId].holds;
      };
      if (holds("Theta") !== (holds("O") && holds("Omega"))) {
        throw new Error("Theta must agree with O and Omega: " + scenario.id);
      }
      if (holds("o") && (!holds("O") || holds("Omega"))) {
        throw new Error("little-o relation is inconsistent: " + scenario.id);
      }
      if (holds("omega") && (!holds("Omega") || holds("O"))) {
        throw new Error("little-omega relation is inconsistent: " + scenario.id);
      }
    });
    return true;
  }

  validateScenarioTable();

  return {
    MAX_SAMPLE_POWER: MAX_SAMPLE_POWER,
    MIN_SAMPLE_COUNT: MIN_SAMPLE_COUNT,
    MAX_SAMPLE_COUNT: MAX_SAMPLE_COUNT,
    MAX_WINDOW_N: MAX_WINDOW_N,
    RELATIONS: RELATIONS,
    SCENARIOS: SCENARIOS,
    getScenario: getScenario,
    relationResult: relationResult,
    checkClaim: checkClaim,
    checkClassification: checkClassification,
    checkWitness: checkWitness,
    findCounterexample: findCounterexample,
    evaluatePoint: evaluatePoint,
    sampleWindow: sampleWindow,
    sampleScenario: sampleScenario,
    log10BigInt: log10BigInt,
    validateScenarioTable: validateScenarioTable,
  };
});
