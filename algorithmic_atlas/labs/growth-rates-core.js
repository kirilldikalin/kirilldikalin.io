(function (root, factory) {
  "use strict";
  const shared = typeof module === "object" && module.exports
    ? require("./mathematical-tools-core.js")
    : root.AtlasMathToolsCore;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrowthRatesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";

  const MAX_N = 1000000000;
  const MAX_SAMPLES = 96;
  const LOG10_2 = Math.log10(2);

  const DEFINITIONS = [
    { id: "constant", label: "1", tex: "1", log: function () { return 0; } },
    { id: "log", label: "log₂ n", tex: "\\log_2 n", log: function (n) {
      return n === 1 ? -Infinity : Math.log10(Math.log2(n));
    } },
    { id: "sqrt", label: "√n", tex: "\\sqrt n", log: function (n) {
      return 0.5 * Math.log10(n);
    } },
    { id: "linear", label: "n", tex: "n", log: function (n) {
      return Math.log10(n);
    } },
    { id: "thousand-linear", label: "1000n", tex: "1000n", log: function (n) {
      return 3 + Math.log10(n);
    } },
    { id: "n-log-n", label: "20n log₂ n", tex: "20n\\log_2n", log: function (n) {
      return n === 1 ? -Infinity : Math.log10(20) + Math.log10(n) + Math.log10(Math.log2(n));
    } },
    { id: "square", label: "n²", tex: "n^2", log: function (n) {
      return 2 * Math.log10(n);
    } },
    { id: "cube", label: "n³", tex: "n^3", log: function (n) {
      return 3 * Math.log10(n);
    } },
    { id: "exponential", label: "2ⁿ", tex: "2^n", log: function (n) {
      return n * LOG10_2;
    } },
    { id: "factorial", label: "n!", tex: "n!", log: function (n) {
      return shared.logFactorial(n);
    } },
    { id: "self-power", label: "nⁿ", tex: "n^n", log: function (n) {
      return n * Math.log10(n);
    } },
  ];
  const BY_ID = new Map(DEFINITIONS.map(function (entry) {
    return [entry.id, entry];
  }));
  const FUNCTIONS = Object.freeze(DEFINITIONS.map(function (entry) {
    return Object.freeze({ id: entry.id, label: entry.label, tex: entry.tex });
  }));

  function definition(id) {
    const result = BY_ID.get(String(id));
    if (!result) throw new RangeError("unknown growth function: " + id);
    return result;
  }

  function logValue(id, rawN) {
    const n = shared.boundedInteger(rawN, "n", 1, MAX_N);
    return definition(id).log(n);
  }

  function crossings(leftId, rightId, minimum, maximum) {
    const start = shared.boundedInteger(minimum, "minimum", 1, MAX_N);
    const end = shared.boundedInteger(maximum, "maximum", start, MAX_N);
    const samples = shared.sampleIntegers(start, end, MAX_SAMPLES, true);
    const result = [];
    let previous = null;
    samples.forEach(function (n) {
      const difference = logValue(leftId, n) - logValue(rightId, n);
      if (Number.isFinite(difference)) {
        if (difference === 0) {
          result.push({ n: n, exact: true });
        } else if (previous && Math.sign(previous.difference) !== Math.sign(difference)) {
          result.push({
            n: Math.round(Math.sqrt(previous.n * n)),
            exact: false,
            bracket: [previous.n, n],
          });
        }
        previous = { n: n, difference: difference };
      }
    });
    return shared.deepFreeze(result.slice(0, 4));
  }

  function sampleRace(functionIds, rawOptions) {
    const ids = Array.from(new Set(functionIds.map(String)));
    if (ids.length < 2 || ids.length > 4) {
      throw new RangeError("choose between two and four distinct functions");
    }
    ids.forEach(definition);
    const options = rawOptions || {};
    const minimumN = shared.boundedInteger(options.minimumN || 1, "minimumN", 1, MAX_N);
    const maximumN = shared.boundedInteger(options.maximumN || 1000, "maximumN", minimumN, MAX_N);
    const sampleCount = shared.boundedInteger(options.sampleCount || 65, "sampleCount", 8, MAX_SAMPLES);
    const xScale = options.xScale === "log" ? "log" : "linear";
    const yScale = options.yScale === "linear" ? "linear" : "log";
    const ns = shared.sampleIntegers(minimumN, maximumN, sampleCount, xScale === "log");
    const rawSeries = ids.map(function (id) {
      return {
        id: id,
        label: definition(id).label,
        points: ns.map(function (n) {
          return { n: n, log10Value: logValue(id, n) };
        }),
      };
    });
    const finiteLogs = rawSeries.flatMap(function (series) {
      return series.points.map(function (point) { return point.log10Value; });
    }).filter(Number.isFinite);
    const minimumLog = Math.min.apply(null, finiteLogs);
    const maximumLog = Math.max.apply(null, finiteLogs);
    const logMinimumN = Math.log10(minimumN);
    const logMaximumN = Math.log10(maximumN);

    function xShare(n) {
      return xScale === "log"
        ? shared.normalizedShare(Math.log10(n), logMinimumN, logMaximumN)
        : shared.normalizedShare(n, minimumN, maximumN);
    }
    function yShare(logValueAtPoint) {
      if (logValueAtPoint === -Infinity) return 0;
      if (yScale === "log") {
        return shared.normalizedShare(logValueAtPoint, minimumLog, maximumLog);
      }
      return shared.clamp(Math.pow(10, logValueAtPoint - maximumLog), 0, 1);
    }

    const series = rawSeries.map(function (entry) {
      return Object.freeze({
        id: entry.id,
        label: entry.label,
        points: Object.freeze(entry.points.map(function (point) {
          return Object.freeze({
            n: point.n,
            log10Value: point.log10Value,
            xShare: xShare(point.n),
            yShare: yShare(point.log10Value),
          });
        })),
      });
    });
    const pairCrossings = [];
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        crossings(ids[left], ids[right], minimumN, maximumN).forEach(function (crossing) {
          pairCrossings.push(Object.freeze({
            leftId: ids[left],
            rightId: ids[right],
            n: crossing.n,
            exact: crossing.exact,
            xShare: xShare(crossing.n),
          }));
        });
      }
    }
    return shared.deepFreeze({
      kind: "finite-illustration",
      proves: false,
      warning: "График показывает конечный диапазон и не заменяет доказательство порядка роста.",
      minimumN: minimumN,
      maximumN: maximumN,
      xScale: xScale,
      yScale: yScale,
      minimumLog: minimumLog,
      maximumLog: maximumLog,
      series: series,
      crossings: pairCrossings,
      sampleCount: ns.length,
    });
  }

  function createState(functionIds, options) {
    const race = sampleRace(functionIds, options);
    return Object.freeze({ race: race, pointIndex: 0 });
  }

  function step(state) {
    const maximum = state.race.series[0].points.length - 1;
    return Object.freeze({
      race: state.race,
      pointIndex: Math.min(maximum, state.pointIndex + 1),
    });
  }

  function isFinished(state) {
    return state.pointIndex >= state.race.series[0].points.length - 1;
  }

  return {
    MAX_N: MAX_N,
    FUNCTIONS: FUNCTIONS,
    logValue: logValue,
    crossings: crossings,
    sampleRace: sampleRace,
    createState: createState,
    step: step,
    isFinished: isFinished,
  };
});
