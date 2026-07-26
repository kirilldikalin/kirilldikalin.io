(function (root) {
  "use strict";

  const FORBIDDEN_PATTERNS = Object.freeze({
    triangle: Object.freeze({
      label: "Треугольник",
      cells: Object.freeze([[0, 0], [1, 0], [0, 1]]),
      collision: Object.freeze([1, 1]),
      forcedSteps: 1,
    }),
    y: Object.freeze({
      label: "Y-ветвление",
      cells: Object.freeze([[0, 0], [1, 0], [2, 0], [1, 1], [1, -1]]),
      collision: Object.freeze([2, 1]),
      forcedSteps: 2,
    }),
    stapler: Object.freeze({
      label: "Степлер",
      cells: Object.freeze([[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2], [0, 1]]),
      collision: Object.freeze([2, 1]),
      forcedSteps: 3,
    }),
  });

  function cellKey(cell) {
    return cell.join(",");
  }

  function validateCell(cell) {
    if (
      !Array.isArray(cell)
      || cell.length !== 3
      || cell.some((value) => !Number.isInteger(value) || value < 0)
    ) {
      throw new Error("Клетка должна иметь три неотрицательные целые координаты");
    }
  }

  function splitCell(cell) {
    validateCell(cell);
    const [x, y, z] = cell;
    return [[x + 1, y, z], [x, y + 1, z], [x, y, z + 1]];
  }

  function layerIndex(cell) {
    validateCell(cell);
    return cell[0] + cell[1] + cell[2];
  }

  function layerCoordinates(layer) {
    if (!Number.isInteger(layer) || layer < 0) {
      throw new Error("Номер слоя должен быть неотрицательным целым");
    }
    const cells = [];
    for (let x = 0; x <= layer; x += 1) {
      for (let y = 0; y <= layer - x; y += 1) {
        cells.push([x, y, layer - x - y]);
      }
    }
    return cells;
  }

  function applySplits(splits) {
    const counts = new Map([[cellKey([0, 0, 0]), 1]]);

    for (const cell of splits) {
      validateCell(cell);
      const key = cellKey(cell);
      const available = counts.get(key) || 0;
      if (available !== 1) {
        throw new Error(`Деление в (${cell.join(", ")}) сейчас невозможно`);
      }
      counts.delete(key);
      for (const child of splitCell(cell)) {
        const childKey = cellKey(child);
        counts.set(childKey, (counts.get(childKey) || 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([key, count]) => ({
        cell: key.split(",").map(Number),
        count,
      }))
      .sort((left, right) => cellKey(left.cell).localeCompare(cellKey(right.cell)));
  }

  function forbiddenPattern(name) {
    const pattern = FORBIDDEN_PATTERNS[name];
    if (!pattern) throw new Error(`Неизвестная фигура: ${name}`);
    return pattern;
  }

  function rotateTriangularCell(cell, turns) {
    if (
      !Array.isArray(cell)
      || cell.length !== 2
      || cell.some((value) => !Number.isInteger(value))
      || !Number.isInteger(turns)
    ) {
      throw new Error("Поворот задаётся целым числом для клетки треугольной сетки");
    }
    let [q, r] = cell;
    const normalizedTurns = ((turns % 6) + 6) % 6;
    for (let turn = 0; turn < normalizedTurns; turn += 1) {
      [q, r] = [-r, q + r];
    }
    return [q, r];
  }

  function forbiddenPatternStage(name, step, turns = 0) {
    const pattern = forbiddenPattern(name);
    if (!Number.isInteger(step) || step < 0 || step > pattern.forcedSteps) {
      throw new Error(`Шаг фигуры ${name} должен быть от 0 до ${pattern.forcedSteps}`);
    }
    const rotate = (cell) => rotateTriangularCell(cell, turns);
    return {
      label: pattern.label,
      cells: pattern.cells.map(rotate),
      collision: rotate(pattern.collision),
      feeders: pattern.cells.slice(-3).map(rotate),
      step,
      forcedSteps: pattern.forcedSteps,
      progress: step / pattern.forcedSteps,
      collided: step === pattern.forcedSteps,
    };
  }

  function triangularCost(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      throw new Error("Параметры змейки должны быть неотрицательными целыми");
    }
    const lengthMinusOne = a + b;
    return (lengthMinusOne * (lengthMinusOne + 1)) / 2;
  }

  function snakeCells(a, b) {
    triangularCost(a, b);
    const cells = [];
    for (let index = 0; index <= a; index += 1) cells.push([index, 0]);
    for (let index = 1; index <= b; index += 1) cells.push([a, index]);
    return cells;
  }

  function transitionTerms(a, b) {
    triangularCost(a, b);

    if (a === 0 && b === 0) {
      return [
        { a: 0, b: 0, multiplicity: 3 },
        { a: 1, b: 0, multiplicity: 3 },
      ];
    }
    if (a === 0) {
      return [
        { a: 0, b, multiplicity: 1 },
        { a: b - 1, b: 1, multiplicity: 1 },
        { a: 0, b: b + 1, multiplicity: 1 },
        { a: b, b: 1, multiplicity: 1 },
      ];
    }
    if (a === 1 && b === 0) {
      return [
        { a: 0, b: 0, multiplicity: 1 },
        { a: 1, b: 0, multiplicity: 4 },
        { a: 2, b: 0, multiplicity: 1 },
        { a: 1, b: 1, multiplicity: 2 },
      ];
    }
    if (a === 1) {
      return [
        { a: b, b: 0, multiplicity: 1 },
        { a: b + 1, b: 0, multiplicity: 1 },
        { a: b, b: 1, multiplicity: 1 },
        { a: 1, b, multiplicity: 1 },
        { a: b + 1, b: 1, multiplicity: 1 },
        { a: 1, b: b + 1, multiplicity: 1 },
      ];
    }
    if (b === 0) {
      return [
        { a: a - 1, b: 0, multiplicity: 1 },
        { a, b: 0, multiplicity: 2 },
        { a: a - 1, b: 1, multiplicity: 2 },
        { a: a + 1, b: 0, multiplicity: 1 },
        { a, b: 1, multiplicity: 2 },
      ];
    }
    return [
      { a: a - 1, b, multiplicity: 1 },
      { a, b, multiplicity: 1 },
      { a: a - 1, b: b + 1, multiplicity: 1 },
      { a: a + b - 1, b: 1, multiplicity: 1 },
      { a, b: b + 1, multiplicity: 1 },
      { a: a + b, b: 1, multiplicity: 1 },
    ];
  }

  function transitionBudget(a, b, budget) {
    triangularCost(a, b);
    if (!Number.isInteger(budget) || budget < 0) {
      throw new Error("Бюджет перехода должен быть неотрицательным целым");
    }
    return transitionTerms(a, b).map((term) => {
      const remaining = budget - term.a - term.b - 1;
      return {
        ...term,
        remaining,
        viable: remaining >= triangularCost(term.a, term.b),
      };
    });
  }

  function countConfigurations(maxN, modulus = null) {
    if (!Number.isInteger(maxN) || maxN < 0 || maxN > 100) {
      throw new Error("Для интерактива N должно быть целым от 0 до 100");
    }
    if (modulus !== null && (!Number.isInteger(modulus) || modulus < 2)) {
      throw new Error("Модуль должен быть целым числом не меньше 2");
    }

    const memo = new Map();
    const normalize = (value) => modulus === null ? value : value % modulus;

    function F(a, b, m) {
      if (a < 0 || b < 0 || m < 0) return 0;
      if (m === 0) return a === 0 && b === 0 ? 1 : 0;
      if (m < triangularCost(a, b)) return 0;

      const key = `${a},${b},${m}`;
      if (memo.has(key)) return memo.get(key);

      let total = 0;
      for (const term of transitionTerms(a, b)) {
        const nextM = m - term.a - term.b - 1;
        total = normalize(total + term.multiplicity * F(term.a, term.b, nextM));
      }
      memo.set(key, total);
      return total;
    }

    const values = [1];
    for (let n = 1; n <= maxN; n += 1) {
      values.push(F(0, 0, n - 1));
    }
    return values;
  }

  root.Euler763Core = Object.freeze({
    splitCell,
    layerIndex,
    layerCoordinates,
    applySplits,
    forbiddenPattern,
    forbiddenPatternStage,
    rotateTriangularCell,
    triangularCost,
    snakeCells,
    transitionTerms,
    transitionBudget,
    countConfigurations,
  });
}(typeof window === "undefined" ? globalThis : window));
