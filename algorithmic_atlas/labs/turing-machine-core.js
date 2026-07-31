(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TuringMachineCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BLANK = "□";
  const MAX_INPUT_LENGTH = 240;
  const MAX_RUN_STEPS = 1000;
  const DEFAULT_WINDOW_RADIUS = 8;
  const GRAPH_VIEWBOX = Object.freeze({
    width: 760,
    height: 320,
  });

  const GRAPH_LAYOUTS = Object.freeze({
    "unary-increment": Object.freeze({
      q_scan: Object.freeze({ x: 190, y: 160 }),
      q_acc: Object.freeze({ x: 540, y: 90 }),
      q_rej: Object.freeze({ x: 540, y: 235 }),
    }),
    "ones-parity": Object.freeze({
      q_even: Object.freeze({ x: 150, y: 160 }),
      q_odd: Object.freeze({ x: 395, y: 160 }),
      q_acc: Object.freeze({ x: 650, y: 85 }),
      q_rej: Object.freeze({ x: 650, y: 235 }),
    }),
  });

  const MACHINES = {
    "unary-increment": {
      id: "unary-increment",
      title: "Инкремент унарного числа",
      description:
        "Единицы кодируют число. Машина идёт вправо до первой пустой ячейки, записывает ещё одну единицу и принимает.",
      inputHelp: "Строка из единиц; пустая строка кодирует ноль.",
      inputAlphabet: ["1"],
      tapeAlphabet: ["1", BLANK],
      blank: BLANK,
      states: ["q_scan", "q_acc", "q_rej"],
      startState: "q_scan",
      acceptState: "q_acc",
      rejectState: "q_rej",
      defaultInput: "111",
      kind: "transducer",
      transitions: [
        {
          id: "unary-scan-one",
          state: "q_scan",
          read: "1",
          write: "1",
          move: "R",
          nextState: "q_scan",
          explanation: "Единица уже принадлежит входу: оставляем её и идём вправо.",
        },
        {
          id: "unary-append-one",
          state: "q_scan",
          read: BLANK,
          write: "1",
          move: "R",
          nextState: "q_acc",
          explanation: "Первая пустая ячейка — конец записи: дописываем единицу и останавливаемся.",
        },
      ],
    },
    "ones-parity": {
      id: "ones-parity",
      title: "Чётность числа единиц",
      description:
        "Состояние хранит только чётность уже просмотренных единиц. На конце строки машина принимает чётный результат и отвергает нечётный.",
      inputHelp: "Двоичная строка из нулей и единиц; пустая строка содержит ноль единиц.",
      inputAlphabet: ["0", "1"],
      tapeAlphabet: ["0", "1", BLANK],
      blank: BLANK,
      states: ["q_even", "q_odd", "q_acc", "q_rej"],
      startState: "q_even",
      acceptState: "q_acc",
      rejectState: "q_rej",
      defaultInput: "101101",
      kind: "decider",
      transitions: [
        {
          id: "parity-even-zero",
          state: "q_even",
          read: "0",
          write: "0",
          move: "R",
          nextState: "q_even",
          explanation: "Ноль не меняет число единиц: чётность остаётся чётной.",
        },
        {
          id: "parity-even-one",
          state: "q_even",
          read: "1",
          write: "1",
          move: "R",
          nextState: "q_odd",
          explanation: "Новая единица переключает чётность с чётной на нечётную.",
        },
        {
          id: "parity-even-blank",
          state: "q_even",
          read: BLANK,
          write: BLANK,
          move: "R",
          nextState: "q_acc",
          explanation: "Вход закончился в чётном состоянии: строка принимается.",
        },
        {
          id: "parity-odd-zero",
          state: "q_odd",
          read: "0",
          write: "0",
          move: "R",
          nextState: "q_odd",
          explanation: "Ноль не меняет число единиц: чётность остаётся нечётной.",
        },
        {
          id: "parity-odd-one",
          state: "q_odd",
          read: "1",
          write: "1",
          move: "R",
          nextState: "q_even",
          explanation: "Новая единица переключает чётность с нечётной на чётную.",
        },
        {
          id: "parity-odd-blank",
          state: "q_odd",
          read: BLANK,
          write: BLANK,
          move: "R",
          nextState: "q_rej",
          explanation: "Вход закончился в нечётном состоянии: строка отвергается.",
        },
      ],
    },
  };

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function machineById(machineId) {
    const machine = MACHINES[machineId];
    if (!machine) {
      throw new Error("Неизвестная машина: " + machineId + ".");
    }
    return machine;
  }

  function validateMachine(machine) {
    assert(machine && typeof machine === "object", "machine must be an object");
    assert(typeof machine.id === "string" && machine.id, "machine id is required");
    assert(Array.isArray(machine.states) && machine.states.length, "states are required");
    assert(new Set(machine.states).size === machine.states.length, "state ids must be unique");
    assert(machine.states.includes(machine.startState), "unknown start state");
    assert(machine.states.includes(machine.acceptState), "unknown accept state");
    assert(machine.states.includes(machine.rejectState), "unknown reject state");
    assert(machine.acceptState !== machine.rejectState, "halting states must differ");
    assert(Array.isArray(machine.inputAlphabet), "input alphabet is required");
    assert(Array.isArray(machine.tapeAlphabet), "tape alphabet is required");
    assert(machine.tapeAlphabet.includes(machine.blank), "blank must belong to tape alphabet");
    assert(!machine.inputAlphabet.includes(machine.blank), "blank cannot belong to input alphabet");
    machine.inputAlphabet.forEach(function (symbol) {
      assert(machine.tapeAlphabet.includes(symbol), "input symbol missing from tape alphabet");
    });

    const ids = new Set();
    const keys = new Set();
    machine.transitions.forEach(function (transition) {
      assert(typeof transition.id === "string" && transition.id, "transition id is required");
      assert(!ids.has(transition.id), "duplicate transition id: " + transition.id);
      ids.add(transition.id);
      assert(machine.states.includes(transition.state), "unknown transition state");
      assert(machine.states.includes(transition.nextState), "unknown next state");
      assert(
        transition.state !== machine.acceptState && transition.state !== machine.rejectState,
        "halting states cannot have outgoing transitions"
      );
      assert(machine.tapeAlphabet.includes(transition.read), "unknown read symbol");
      assert(machine.tapeAlphabet.includes(transition.write), "unknown write symbol");
      assert(transition.move === "L" || transition.move === "R", "move must be L or R");
      const key = transition.state + "\u0000" + transition.read;
      assert(!keys.has(key), "nondeterministic transition: " + key);
      keys.add(key);
    });
    return machine;
  }

  function validateMachines() {
    Object.values(MACHINES).forEach(validateMachine);
    return true;
  }

  function parseInput(machineId, rawValue) {
    const machine = machineById(machineId);
    const value = String(rawValue).trim();
    if (value.length > MAX_INPUT_LENGTH) {
      throw new Error("Вход не должен быть длиннее " + MAX_INPUT_LENGTH + " символов.");
    }
    for (const symbol of value) {
      if (!machine.inputAlphabet.includes(symbol)) {
        throw new Error(
          "Символ «" + symbol + "» не входит во входной алфавит {" +
          machine.inputAlphabet.join(", ") + "}."
        );
      }
    }
    return value;
  }

  function initialCells(input) {
    const cells = {};
    Array.from(input).forEach(function (symbol, index) {
      cells[index] = symbol;
    });
    return Object.freeze(cells);
  }

  function statusForState(machine, stateId) {
    if (stateId === machine.acceptState) {
      return "accepted";
    }
    if (stateId === machine.rejectState) {
      return "rejected";
    }
    return "running";
  }

  function createState(machineId, rawInput) {
    const machine = machineById(machineId);
    const input = parseInput(machineId, rawInput);
    return Object.freeze({
      machineId: machineId,
      input: input,
      cells: initialCells(input),
      head: 0,
      state: machine.startState,
      stepNumber: 0,
      status: statusForState(machine, machine.startState),
      lastTransitionId: null,
    });
  }

  function readSymbol(state) {
    const machine = machineById(state.machineId);
    return Object.prototype.hasOwnProperty.call(state.cells, state.head)
      ? state.cells[state.head]
      : machine.blank;
  }

  function transitionFor(state) {
    if (state.status !== "running") {
      return null;
    }
    const machine = machineById(state.machineId);
    const symbol = readSymbol(state);
    return machine.transitions.find(function (transition) {
      return transition.state === state.state && transition.read === symbol;
    }) || null;
  }

  function applyTransition(state, transition) {
    const machine = machineById(state.machineId);
    const cells = Object.assign({}, state.cells);
    if (transition.write === machine.blank) {
      delete cells[state.head];
    } else {
      cells[state.head] = transition.write;
    }
    const nextStateId = transition.nextState;
    return Object.freeze({
      machineId: state.machineId,
      input: state.input,
      cells: Object.freeze(cells),
      head: state.head + (transition.move === "L" ? -1 : 1),
      state: nextStateId,
      stepNumber: state.stepNumber + 1,
      status: statusForState(machine, nextStateId),
      lastTransitionId: transition.id,
    });
  }

  function step(state) {
    if (!state || typeof state.head !== "number") {
      throw new TypeError("step expects a Turing machine state");
    }
    if (state.status !== "running") {
      return state;
    }
    const transition = transitionFor(state);
    if (!transition) {
      return Object.freeze(Object.assign({}, state, { status: "stuck" }));
    }
    return applyTransition(state, transition);
  }

  function manualStep(state, transitionId) {
    if (state.status !== "running") {
      return {
        ok: false,
        state: state,
        message: "Вычисление уже остановилось; применять новое правило нельзя.",
      };
    }
    const machine = machineById(state.machineId);
    const selected = machine.transitions.find(function (transition) {
      return transition.id === transitionId;
    });
    if (!selected) {
      return {
        ok: false,
        state: state,
        message: "Сначала выберите строку таблицы переходов.",
      };
    }
    const expected = transitionFor(state);
    if (!expected) {
      return {
        ok: false,
        state: state,
        message:
          "Для пары (" + state.state + ", " + readSymbol(state) +
          ") правило не задано: машина остановилась вне принимающего и отвергающего состояний.",
      };
    }
    if (selected.id !== expected.id) {
      return {
        ok: false,
        state: state,
        expectedTransitionId: expected.id,
        message:
          "Выбранная строка начинается с (" + selected.state + ", " + selected.read +
          "), а сейчас машина находится в " + state.state + " и читает «" +
          readSymbol(state) + "». Конфигурация не изменилась.",
      };
    }
    return {
      ok: true,
      state: applyTransition(state, selected),
      expectedTransitionId: expected.id,
      message: selected.explanation,
    };
  }

  function runWithLimit(initialState, limit) {
    const maximum = Number(limit);
    if (!Number.isInteger(maximum) || maximum < 0 || maximum > MAX_RUN_STEPS) {
      throw new RangeError("step limit must be between 0 and " + MAX_RUN_STEPS);
    }
    const trace = [initialState];
    let current = initialState;
    let executed = 0;
    while (current.status === "running" && executed < maximum) {
      current = step(current);
      trace.push(current);
      executed += 1;
    }
    return {
      state: current,
      trace: trace,
      stepsExecuted: executed,
      halted: current.status !== "running",
      stoppedByLimit: current.status === "running" && executed === maximum,
    };
  }

  function nonBlankBounds(state) {
    const positions = Object.keys(state.cells).map(Number);
    positions.push(state.head);
    return {
      minimum: Math.min.apply(null, positions),
      maximum: Math.max.apply(null, positions),
    };
  }

  function tapeSnapshot(state, radius) {
    const windowRadius = radius === undefined ? DEFAULT_WINDOW_RADIUS : Number(radius);
    if (!Number.isInteger(windowRadius) || windowRadius < 1 || windowRadius > 40) {
      throw new RangeError("window radius must be between 1 and 40");
    }
    const machine = machineById(state.machineId);
    const cells = [];
    for (let position = state.head - windowRadius; position <= state.head + windowRadius; position += 1) {
      cells.push({
        position: position,
        symbol: Object.prototype.hasOwnProperty.call(state.cells, position)
          ? state.cells[position]
          : machine.blank,
        isHead: position === state.head,
      });
    }
    return cells;
  }

  function tapeContents(state) {
    const machine = machineById(state.machineId);
    const positions = Object.keys(state.cells).map(Number);
    if (!positions.length) {
      return "";
    }
    const minimum = Math.min.apply(null, positions);
    const maximum = Math.max.apply(null, positions);
    let result = "";
    for (let position = minimum; position <= maximum; position += 1) {
      result += Object.prototype.hasOwnProperty.call(state.cells, position)
        ? state.cells[position]
        : machine.blank;
    }
    return result;
  }

  function configuration(state) {
    const machine = machineById(state.machineId);
    const bounds = nonBlankBounds(state);
    const minimum = Math.min(bounds.minimum, state.head) - 1;
    const maximum = Math.max(bounds.maximum, state.head) + 1;
    let left = "";
    let right = "";
    for (let position = minimum; position < state.head; position += 1) {
      left += Object.prototype.hasOwnProperty.call(state.cells, position)
        ? state.cells[position]
        : machine.blank;
    }
    for (let position = state.head + 1; position <= maximum; position += 1) {
      right += Object.prototype.hasOwnProperty.call(state.cells, position)
        ? state.cells[position]
        : machine.blank;
    }
    return {
      left: left,
      state: state.state,
      scanned: readSymbol(state),
      right: right,
      text: left + " [" + state.state + " · " + readSymbol(state) + "] " + right,
    };
  }

  function resultDescription(state) {
    const machine = machineById(state.machineId);
    if (state.status === "running") {
      return "Машина пока не остановилась.";
    }
    if (state.status === "stuck") {
      return "Переход не задан: машина остановилась вне q_acc и q_rej.";
    }
    if (machine.kind === "transducer" && state.status === "accepted") {
      const output = tapeContents(state);
      return "Принято. На ленте: " + (output || machine.blank) + ".";
    }
    return state.status === "accepted"
      ? "Строка принята: число единиц чётно."
      : "Строка отвергнута: число единиц нечётно.";
  }

  function graphModel(machineId, state) {
    let requestedMachineId = machineId;
    let currentState = state;
    if (state === undefined && machineId && typeof machineId === "object") {
      currentState = machineId;
      requestedMachineId = currentState.machineId;
    }
    const machine = machineById(requestedMachineId);
    if (!currentState || currentState.machineId !== requestedMachineId) {
      throw new Error("graph state must belong to machine " + requestedMachineId);
    }
    const layout = GRAPH_LAYOUTS[requestedMachineId];
    assert(layout, "graph layout is missing for " + requestedMachineId);
    machine.states.forEach(function (stateId) {
      assert(layout[stateId], "graph position is missing for " + stateId);
    });

    const applicable = transitionFor(currentState);
    const nodes = machine.states.map(function (stateId) {
      let kind = "working";
      if (stateId === machine.acceptState) {
        kind = "accept";
      } else if (stateId === machine.rejectState) {
        kind = "reject";
      }
      return Object.freeze({
        id: stateId,
        label: stateId,
        x: layout[stateId].x,
        y: layout[stateId].y,
        kind: kind,
        current: stateId === currentState.state,
      });
    });
    const edges = machine.transitions.map(function (transition) {
      return Object.freeze({
        id: transition.id,
        from: transition.state,
        to: transition.nextState,
        read: transition.read,
        write: transition.write,
        move: transition.move,
        label: transition.read + " → " + transition.write +
          ", " + transition.move,
        applicable: Boolean(applicable && applicable.id === transition.id),
        applied: currentState.lastTransitionId === transition.id,
      });
    });

    return Object.freeze({
      machineId: requestedMachineId,
      width: GRAPH_VIEWBOX.width,
      height: GRAPH_VIEWBOX.height,
      currentStateId: currentState.state,
      applicableTransitionId: applicable ? applicable.id : null,
      appliedTransitionId: currentState.lastTransitionId,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    });
  }

  validateMachines();

  return {
    BLANK: BLANK,
    MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
    MAX_RUN_STEPS: MAX_RUN_STEPS,
    DEFAULT_WINDOW_RADIUS: DEFAULT_WINDOW_RADIUS,
    MACHINES: MACHINES,
    machineById: machineById,
    validateMachine: validateMachine,
    validateMachines: validateMachines,
    parseInput: parseInput,
    createState: createState,
    readSymbol: readSymbol,
    transitionFor: transitionFor,
    step: step,
    manualStep: manualStep,
    runWithLimit: runWithLimit,
    tapeSnapshot: tapeSnapshot,
    tapeContents: tapeContents,
    configuration: configuration,
    resultDescription: resultDescription,
    GRAPH_VIEWBOX: GRAPH_VIEWBOX,
    graphModel: graphModel,
  };
});
