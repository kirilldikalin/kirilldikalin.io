(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.InputSizeCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_DIGITS = 121;
  const MAX_SLIDER_EXPONENT = 399;
  const DIRECT_SIMULATION_LIMIT = 100000n;
  const SECONDS_PER_YEAR = 31557600n;
  const DEFAULT_ENCODING_CELL_LIMIT = 48;

  function absolute(value) {
    return value < 0n ? -value : value;
  }

  function parsePositiveInteger(rawValue, fieldName) {
    const label = fieldName || "Значение";
    const text = String(rawValue).trim();
    if (!text) {
      throw new Error(label + ": введите положительное целое число.");
    }
    if (!/^\+?\d+$/.test(text)) {
      throw new Error(label + ": допустимо только положительное целое число.");
    }
    const digits = text.replace(/^\+?0*/, "") || "0";
    if (digits.length > MAX_DIGITS) {
      throw new Error(label + ": не больше " + MAX_DIGITS + " цифр.");
    }
    const value = BigInt(text);
    if (value === 0n) {
      throw new Error(label + ": число должно быть больше нуля.");
    }
    return value;
  }

  function bitLength(value) {
    const magnitude = absolute(value);
    return magnitude === 0n ? 1 : magnitude.toString(2).length;
  }

  function powerOfTwo(exponent) {
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_SLIDER_EXPONENT) {
      throw new RangeError(
        "exponent must be between 0 and " + MAX_SLIDER_EXPONENT
      );
    }
    return 1n << BigInt(exponent);
  }

  function groupedInteger(value) {
    const text = absolute(value).toString();
    const grouped = text.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
    return value < 0n ? "−" + grouped : grouped;
  }

  function scientificInteger(value, significantDigits) {
    const magnitude = absolute(value);
    const text = magnitude.toString();
    const precision = Math.max(2, Math.min(Number(significantDigits) || 4, 8));
    if (text.length <= precision) {
      return groupedInteger(value);
    }
    const fraction = text.slice(1, precision).replace(/0+$/, "");
    const mantissa = text[0] + (fraction ? "," + fraction : "");
    return (value < 0n ? "−" : "") + mantissa + " × 10^" + (text.length - 1);
  }

  function compactInteger(value) {
    return absolute(value) < 1000000000000000n
      ? groupedInteger(value)
      : scientificInteger(value, 4);
  }

  function binaryPreview(value, headLength, tailLength) {
    const bits = absolute(value).toString(2);
    const head = headLength || 48;
    const tail = tailLength || 32;
    if (bits.length <= head + tail + 1) {
      return {
        text: bits,
        totalBits: bits.length,
        truncated: false,
      };
    }
    return {
      text: bits.slice(0, head) + "…" + bits.slice(-tail),
      totalBits: bits.length,
      truncated: true,
    };
  }

  function unaryPreview(value, limit) {
    const maximum = BigInt(limit || 48);
    if (value <= maximum) {
      return {
        text: "1".repeat(Number(value)),
        totalSymbols: value,
        truncated: false,
      };
    }
    return {
      text: "1".repeat(Number(maximum)) + "…",
      totalSymbols: value,
      truncated: true,
    };
  }

  function log10BigInt(value) {
    const magnitude = absolute(value);
    if (magnitude === 0n) {
      return 0;
    }
    const text = magnitude.toString();
    const head = text.slice(0, 15);
    const mantissa = Number(head) / Math.pow(10, head.length - 1);
    return text.length - 1 + Math.log10(mantissa);
  }

  function logScale(value, maximum) {
    if (value <= 0n || maximum <= 0n) {
      return 0;
    }
    if (value >= maximum) {
      return 1;
    }
    const denominator = log10BigInt(maximum + 1n);
    return denominator === 0 ? 1 : log10BigInt(value + 1n) / denominator;
  }

  function formatDuration(steps, operationsPerSecond) {
    if (typeof steps !== "bigint" || steps < 0n) {
      throw new TypeError("steps must be a non-negative BigInt");
    }
    if (typeof operationsPerSecond !== "bigint" || operationsPerSecond <= 0n) {
      throw new TypeError("operationsPerSecond must be a positive BigInt");
    }
    if (steps === 0n) {
      return "0 с";
    }
    if (steps < operationsPerSecond) {
      const milliseconds = steps * 1000n / operationsPerSecond;
      return milliseconds === 0n ? "< 1 мс" : "≈ " + groupedInteger(milliseconds) + " мс";
    }

    const seconds = steps / operationsPerSecond;
    if (seconds < 60n) {
      const tenths = steps * 10n / operationsPerSecond;
      const whole = tenths / 10n;
      const fraction = tenths % 10n;
      return fraction === 0n
        ? groupedInteger(whole) + " с"
        : groupedInteger(whole) + "," + fraction + " с";
    }
    if (seconds < 3600n) {
      return "≈ " + groupedInteger(seconds / 60n) + " мин " +
        groupedInteger(seconds % 60n) + " с";
    }
    if (seconds < 86400n) {
      return "≈ " + groupedInteger(seconds / 3600n) + " ч " +
        groupedInteger(seconds % 3600n / 60n) + " мин";
    }
    if (seconds < SECONDS_PER_YEAR) {
      return "≈ " + groupedInteger(seconds / 86400n) + " суток";
    }

    const years = seconds / SECONDS_PER_YEAR;
    return "≈ " + compactInteger(years) + " лет";
  }

  function evaluationKind(steps) {
    return steps <= DIRECT_SIMULATION_LIMIT ? "direct-range" : "analytic";
  }

  function magnitudeModel(value, operationsPerSecond) {
    if (typeof value !== "bigint" || value <= 0n) {
      throw new TypeError("value must be a positive BigInt");
    }
    const rate = operationsPerSecond || 1000000000n;
    const bits = BigInt(bitLength(value));
    const algorithms = [
      {
        id: "value-linear",
        label: "N шагов",
        steps: value,
      },
      {
        id: "bit-linear",
        label: "|x| шагов",
        steps: bits,
      },
      {
        id: "bit-square",
        label: "|x|² шагов",
        steps: bits * bits,
      },
    ];
    const maximum = algorithms.reduce(function (current, item) {
      return item.steps > current ? item.steps : current;
    }, 1n);

    return {
      value: value,
      bitLength: Number(bits),
      unaryLength: value,
      binary: binaryPreview(value),
      unary: unaryPreview(value),
      operationsPerSecond: rate,
      directSimulationLimit: DIRECT_SIMULATION_LIMIT,
      algorithms: algorithms.map(function (item) {
        return Object.freeze({
          id: item.id,
          label: item.label,
          steps: item.steps,
          duration: formatDuration(item.steps, rate),
          evaluation: evaluationKind(item.steps),
          logShare: logScale(item.steps, maximum),
        });
      }),
    };
  }

  function gcd(left, right) {
    let a = absolute(left);
    let b = absolute(right);
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function gcdOperationCounts(left, right) {
    if (typeof left !== "bigint" || typeof right !== "bigint" ||
        left <= 0n || right <= 0n) {
      throw new TypeError("gcd inputs must be positive BigInt values");
    }

    let a = left >= right ? left : right;
    let b = left >= right ? right : left;
    const divisor = gcd(a, b);
    const naiveChecks = b - divisor + 1n;
    let divisionSteps = 0n;
    let subtractionSteps = 0n;
    let schoolbookBitWork = 0n;

    while (b !== 0n) {
      const quotient = a / b;
      const remainder = a % b;
      subtractionSteps += remainder === 0n ? quotient - 1n : quotient;
      schoolbookBitWork += BigInt(bitLength(a)) * BigInt(bitLength(b));
      divisionSteps += 1n;
      a = b;
      b = remainder;
    }

    const algorithms = [
      {
        id: "naive-divisors",
        label: "Проверка делителей",
        steps: naiveChecks,
      },
      {
        id: "repeated-subtraction",
        label: "Повторное вычитание",
        steps: subtractionSteps,
      },
      {
        id: "euclidean-remainder",
        label: "Деление с остатком",
        steps: divisionSteps,
      },
    ];
    const maximum = algorithms.reduce(function (current, item) {
      return item.steps > current ? item.steps : current;
    }, 1n);

    return {
      left: left,
      right: right,
      gcd: divisor,
      maximumBitLength: Math.max(bitLength(left), bitLength(right)),
      naiveChecks: naiveChecks,
      subtractionSteps: subtractionSteps,
      divisionSteps: divisionSteps,
      schoolbookBitWork: schoolbookBitWork,
      directSimulationLimit: DIRECT_SIMULATION_LIMIT,
      algorithms: algorithms.map(function (item) {
        return Object.freeze({
          id: item.id,
          label: item.label,
          steps: item.steps,
          evaluation: evaluationKind(item.steps),
          logShare: logScale(item.steps, maximum),
        });
      }),
    };
  }

  function encodingGeometry(value, cellLimit) {
    if (typeof value !== "bigint" || value <= 0n) {
      throw new TypeError("value must be a positive BigInt");
    }
    const maximum = cellLimit === undefined
      ? DEFAULT_ENCODING_CELL_LIMIT
      : Number(cellLimit);
    if (!Number.isInteger(maximum) || maximum < 8 || maximum > 96) {
      throw new RangeError("cell limit must be between 8 and 96");
    }

    const bits = value.toString(2);
    const length = bits.length;
    const binaryExact = length <= maximum;
    const binaryHeadLength = binaryExact
      ? length
      : Math.ceil(maximum * 0.6);
    const binaryTailLength = binaryExact ? 0 : maximum - binaryHeadLength;
    const binaryHead = bits.slice(0, binaryHeadLength);
    const binaryTail = binaryExact
      ? ""
      : bits.slice(bits.length - binaryTailLength);
    const binaryOmitted = binaryExact
      ? 0
      : length - binaryHeadLength - binaryTailLength;

    const unaryExact = value <= BigInt(maximum);
    const groupCount = unaryExact ? Number(value) : maximum;
    const divisor = BigInt(groupCount);
    const baseGroupSize = value / divisor;
    const largerGroupCount = Number(value % divisor);
    const unaryGroups = [];
    for (let index = 0; index < groupCount; index += 1) {
      unaryGroups.push(
        baseGroupSize + (index < largerGroupCount ? 1n : 0n)
      );
    }
    const representedUnaryLength = unaryGroups.reduce(function (sum, group) {
      return sum + group;
    }, 0n);
    const maximumLength = value;
    const binaryLengthBigInt = BigInt(length);
    const lowerBound = 1n << BigInt(length - 1);
    const patternCapacity = 1n << BigInt(length);

    return Object.freeze({
      value: value,
      cellLimit: maximum,
      mode: unaryExact && binaryExact ? "exact" : "aggregated",
      unaryExact: unaryExact,
      unaryGroups: Object.freeze(unaryGroups),
      representedUnaryLength: representedUnaryLength,
      unaryCompressionFloor: baseGroupSize,
      unaryCompressionCeiling:
        baseGroupSize + (largerGroupCount > 0 ? 1n : 0n),
      binaryExact: binaryExact,
      binaryHead: binaryHead,
      binaryTail: binaryTail,
      binaryOmitted: binaryOmitted,
      binaryLength: length,
      binaryValue: BigInt("0b" + bits),
      lowerBound: lowerBound,
      upperBoundExclusive: patternCapacity,
      patternCapacity: patternCapacity,
      unaryLogShare: logScale(value, maximumLength),
      binaryLogShare: logScale(binaryLengthBigInt, maximumLength),
      compressionNumerator: value,
      compressionDenominator: binaryLengthBigInt,
    });
  }

  return {
    MAX_DIGITS: MAX_DIGITS,
    MAX_SLIDER_EXPONENT: MAX_SLIDER_EXPONENT,
    DIRECT_SIMULATION_LIMIT: DIRECT_SIMULATION_LIMIT,
    DEFAULT_ENCODING_CELL_LIMIT: DEFAULT_ENCODING_CELL_LIMIT,
    absolute: absolute,
    parsePositiveInteger: parsePositiveInteger,
    bitLength: bitLength,
    powerOfTwo: powerOfTwo,
    groupedInteger: groupedInteger,
    scientificInteger: scientificInteger,
    compactInteger: compactInteger,
    binaryPreview: binaryPreview,
    unaryPreview: unaryPreview,
    log10BigInt: log10BigInt,
    logScale: logScale,
    formatDuration: formatDuration,
    evaluationKind: evaluationKind,
    magnitudeModel: magnitudeModel,
    gcd: gcd,
    gcdOperationCounts: gcdOperationCounts,
    encodingGeometry: encodingGeometry,
  };
});
