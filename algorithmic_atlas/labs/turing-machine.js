(function () {
  "use strict";

  const core = window.TuringMachineCore;
  const controls = window.AtlasLabControlsCore;
  const root = document.getElementById("turing-lab");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  if (!core || !controls || !root) {
    return;
  }

  const elements = {
    form: document.getElementById("turing-form"),
    machine: document.getElementById("turing-machine-select"),
    input: document.getElementById("turing-input"),
    inputHelp: document.getElementById("turing-input-help"),
    machineDescription: document.getElementById("turing-machine-description"),
    error: document.getElementById("turing-error"),
    status: document.getElementById("turing-status"),
    roleInputs: Array.from(document.querySelectorAll('input[name="turing-role"]')),
    speed: document.getElementById("turing-speed"),
    speedValue: document.getElementById("turing-speed-value"),
    limit: document.getElementById("turing-step-limit"),
    step: document.getElementById("turing-step"),
    run: document.getElementById("turing-run"),
    pause: document.getElementById("turing-pause"),
    reset: document.getElementById("turing-reset"),
    tapeViewport: document.getElementById("turing-tape-viewport"),
    tape: document.getElementById("turing-tape"),
    graph: document.getElementById("turing-state-graph"),
    graphDescription: document.getElementById("turing-state-graph-description"),
    graphCaption: document.getElementById("turing-state-graph-caption"),
    state: document.getElementById("turing-current-state"),
    symbol: document.getElementById("turing-current-symbol"),
    steps: document.getElementById("turing-step-count"),
    outcome: document.getElementById("turing-outcome"),
    configuration: document.getElementById("turing-configuration"),
    rule: document.getElementById("turing-current-rule"),
    rulesBody: document.getElementById("turing-rules-body"),
  };

  let machineId = elements.machine.value;
  let initialInput = elements.input.value;
  let state = core.createState(machineId, initialInput);
  let selectedTransitionId = null;
  let timer = null;
  let automaticSteps = 0;

  function machine() {
    return core.machineById(machineId);
  }

  function role() {
    const selected = elements.roleInputs.find(function (input) {
      return input.checked;
    });
    return selected ? selected.value : "manual";
  }

  function delay() {
    return controls.speedModel(elements.speed.value).delayMs;
  }

  function statusLabel(status) {
    return {
      running: "работает",
      accepted: "принято",
      rejected: "отвергнуто",
      stuck: "нет правила",
    }[status] || status;
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = !message;
  }

  function announce(message) {
    elements.status.textContent = message;
  }

  function stopAutomatic(message) {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    elements.pause.disabled = true;
    if (message) {
      announce(message);
    }
    renderControls();
  }

  function setRole(nextRole) {
    elements.roleInputs.forEach(function (input) {
      input.checked = input.value === nextRole;
    });
    selectedTransitionId = null;
    stopAutomatic();
    render();
  }

  function loadMachine(nextMachineId, useDefaultInput) {
    stopAutomatic();
    machineId = nextMachineId;
    const nextMachine = machine();
    if (useDefaultInput) {
      elements.input.value = nextMachine.defaultInput;
    }
    initialInput = core.parseInput(machineId, elements.input.value);
    state = core.createState(machineId, initialInput);
    selectedTransitionId = null;
    elements.inputHelp.textContent = nextMachine.inputHelp;
    elements.machineDescription.textContent = nextMachine.description;
    showError("");
    announce("Новая конфигурация готова. Выберите правило или передайте работу исполнителю.");
    render();
  }

  function applyInputs() {
    try {
      loadMachine(elements.machine.value, false);
    } catch (error) {
      stopAutomatic();
      showError(error.message);
      announce("Вход не применён.");
    }
  }

  function reset() {
    stopAutomatic();
    state = core.createState(machineId, initialInput);
    selectedTransitionId = null;
    showError("");
    announce("Машина возвращена к начальной конфигурации.");
    render();
  }

  function performAutomaticStep() {
    if (state.status !== "running") {
      stopAutomatic(core.resultDescription(state));
      return false;
    }
    const transition = core.transitionFor(state);
    state = core.step(state);
    selectedTransitionId = null;
    showError("");
    announce(transition ? transition.explanation : core.resultDescription(state));
    render();
    return true;
  }

  function performStep() {
    stopAutomatic();
    if (role() === "automatic") {
      performAutomaticStep();
      return;
    }
    const result = core.manualStep(state, selectedTransitionId);
    if (!result.ok) {
      showError(result.message);
      announce("Правило не применено.");
      renderRules();
      renderGraph();
      return;
    }
    state = result.state;
    selectedTransitionId = null;
    showError("");
    announce(result.message);
    render();
  }

  function automaticTick() {
    timer = null;
    if (state.status !== "running") {
      stopAutomatic(core.resultDescription(state));
      return;
    }
    const maximum = Number(elements.limit.value);
    if (automaticSteps >= maximum) {
      stopAutomatic(
        "Достигнут предел " + maximum +
        " автоматических шагов. Машина пока не остановилась; можно продолжить запуск или сделать шаг вручную."
      );
      return;
    }
    performAutomaticStep();
    automaticSteps += 1;
    if (state.status !== "running") {
      stopAutomatic(core.resultDescription(state));
      return;
    }
    elements.pause.disabled = false;
    timer = window.setTimeout(automaticTick, delay());
  }

  function runAutomatic() {
    if (state.status !== "running") {
      announce(core.resultDescription(state));
      return;
    }
    if (role() !== "automatic") {
      setRole("automatic");
    }
    if (timer !== null) {
      return;
    }
    automaticSteps = 0;
    showError("");
    elements.pause.disabled = false;
    announce("Автоматический исполнитель следует таблице переходов.");
    automaticTick();
  }

  function renderTape() {
    const snapshot = core.tapeSnapshot(state);
    const fragment = document.createDocumentFragment();
    snapshot.forEach(function (cell) {
      const item = document.createElement("div");
      item.className = "turing-cell" + (cell.isHead ? " is-head" : "");
      item.setAttribute("aria-hidden", "true");

      const position = document.createElement("span");
      position.className = "turing-cell__position";
      position.textContent = String(cell.position);

      const symbol = document.createElement("strong");
      symbol.className = "turing-cell__symbol";
      symbol.textContent = cell.symbol;

      item.append(position, symbol);
      if (cell.isHead) {
        const head = document.createElement("span");
        head.className = "turing-cell__head";
        head.textContent = "▲ " + state.state;
        item.appendChild(head);
      }
      fragment.appendChild(item);
    });
    elements.tape.replaceChildren(fragment);
    elements.tape.setAttribute(
      "aria-label",
      "Видимая часть ленты. Головка на позиции " + state.head +
      ", читает " + core.readSymbol(state) + ", состояние " + state.state + "."
    );
    elements.tapeViewport.scrollLeft =
      (elements.tapeViewport.scrollWidth - elements.tapeViewport.clientWidth) / 2;
  }

  function renderGraph() {
    if (!elements.graph) {
      return;
    }
    const graph = core.graphModel(machineId, state);
    const nodes = new Map(graph.nodes.map(function (node) {
      return [node.id, node];
    }));
    elements.graph.replaceChildren();
    elements.graph.classList.add("turing-state-graph");
    if (elements.graphCaption) {
      elements.graphCaption.classList.add("turing-graph-caption");
    }
    elements.graph.setAttribute(
      "viewBox",
      "0 0 " + graph.width + " " + graph.height
    );
    elements.graph.style.setProperty(
      "--turing-motion-duration",
      controls.motionDurationMs(elements.speed.value, reducedMotion.matches) + "ms"
    );

    const title = createSvg("title", {
      id: "turing-state-graph-title",
    });
    title.textContent = "Граф состояний выбранной машины";
    const description = createSvg("desc", {
      id: "turing-state-graph-description",
    });
    elements.graph.append(title, description);
    elements.graphDescription = description;
    elements.graph.setAttribute(
      "aria-labelledby",
      "turing-state-graph-title turing-state-graph-description"
    );
    appendGraphMarkers();

    const edgesLayer = createSvg("g", {
      class: "turing-graph-edges",
    });
    graph.edges.forEach(function (edge) {
      edgesLayer.appendChild(renderGraphEdge(
        edge,
        nodes,
        graph.edges
      ));
    });
    elements.graph.appendChild(edgesLayer);

    const nodesLayer = createSvg("g", {
      class: "turing-graph-nodes",
    });
    graph.nodes.forEach(function (node) {
      nodesLayer.appendChild(renderGraphNode(node));
    });
    elements.graph.appendChild(nodesLayer);

    const applicable = graph.edges.find(function (edge) {
      return edge.applicable;
    });
    const applied = graph.edges.find(function (edge) {
      return edge.applied;
    });
    const summary =
      "Текущее состояние " + graph.currentStateId + ". " +
      (applicable
        ? "Применимое ребро: " + applicable.label +
          ", переход в " + applicable.to + "."
        : "Для текущей пары состояния и символа исходящего ребра нет.") +
      (applied
        ? " На предыдущем шаге применено ребро " + applied.label + "."
        : "");
    description.textContent = summary;
    elements.graph.setAttribute("aria-label", summary);
    if (elements.graphCaption) {
      elements.graphCaption.textContent = summary;
    }
  }

  function appendGraphMarkers() {
    const definitions = createSvg("defs");
    [
      ["turing-arrow", "turing-graph-marker"],
      ["turing-arrow-applicable", "turing-graph-marker is-applicable"],
      ["turing-arrow-applied", "turing-graph-marker is-applied"],
      ["turing-arrow-selected", "turing-graph-marker is-selected"],
    ].forEach(function (definition) {
      const marker = createSvg("marker", {
        id: definition[0],
        viewBox: "0 0 10 10",
        refX: "9",
        refY: "5",
        markerWidth: "7",
        markerHeight: "7",
        orient: "auto-start-reverse",
      });
      const arrow = createSvg("path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        class: definition[1],
      });
      marker.appendChild(arrow);
      definitions.appendChild(marker);
    });
    elements.graph.appendChild(definitions);
  }

  function renderGraphEdge(edge, nodes, edges) {
    const group = createSvg("g", {
      class: graphEdgeClass(edge),
      "data-transition-id": edge.id,
    });
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const geometry = edgeGeometry(edge, from, to, edges);
    const path = createSvg("path", {
      d: geometry.path,
      class: "turing-graph-edge__path",
      "marker-end": markerForEdge(edge),
    });
    const title = createSvg("title");
    title.textContent =
      edge.from + ", " + edge.read + ": записать " + edge.write +
      ", сдвиг " + edge.move + ", перейти в " + edge.to;
    const label = createSvg("text", {
      x: geometry.labelX,
      y: geometry.labelY,
      "text-anchor": "middle",
      class: "turing-graph-edge__label",
    });
    label.textContent = edge.label;
    group.append(title, path, label);
    return group;
  }

  function graphEdgeClass(edge) {
    const classes = ["turing-graph-edge"];
    if (edge.applicable) {
      classes.push("is-applicable");
    }
    if (edge.applied) {
      classes.push("was-applied");
    }
    if (edge.id === selectedTransitionId) {
      classes.push("is-selected");
    }
    return classes.join(" ");
  }

  function markerForEdge(edge) {
    if (edge.applied) {
      return "url(#turing-arrow-applied)";
    }
    if (edge.id === selectedTransitionId) {
      return "url(#turing-arrow-selected)";
    }
    if (edge.applicable) {
      return "url(#turing-arrow-applicable)";
    }
    return "url(#turing-arrow)";
  }

  function edgeGeometry(edge, from, to, edges) {
    const radius = 36;
    if (from.id === to.id) {
      return {
        path:
          "M " + (from.x - 22) + " " + (from.y - 29) +
          " C " + (from.x - 92) + " " + (from.y - 118) +
          ", " + (from.x + 92) + " " + (from.y - 118) +
          ", " + (from.x + 22) + " " + (from.y - 29),
        labelX: from.x,
        labelY: from.y - 93,
      };
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const unitX = dx / length;
    const unitY = dy / length;
    const startX = from.x + unitX * radius;
    const startY = from.y + unitY * radius;
    const endX = to.x - unitX * (radius + 5);
    const endY = to.y - unitY * (radius + 5);
    const hasReverse = edges.some(function (candidate) {
      return candidate.from === edge.to && candidate.to === edge.from;
    });
    const bend = hasReverse ? 42 : 0;
    const normalX = -unitY;
    const normalY = unitX;
    const controlX = (startX + endX) / 2 + normalX * bend;
    const controlY = (startY + endY) / 2 + normalY * bend;
    return {
      path:
        "M " + startX + " " + startY +
        " Q " + controlX + " " + controlY +
        " " + endX + " " + endY,
      labelX: controlX,
      labelY: controlY - 8,
    };
  }

  function renderGraphNode(node) {
    const group = createSvg("g", {
      class:
        "turing-graph-node is-" + node.kind +
        (node.current ? " is-current" : ""),
      transform: "translate(" + node.x + " " + node.y + ")",
      "data-state-id": node.id,
    });
    const title = createSvg("title");
    title.textContent =
      node.id + ": " +
      (node.kind === "accept"
        ? "принимающее состояние"
        : node.kind === "reject"
          ? "отвергающее состояние"
          : "рабочее состояние") +
      (node.current ? ", текущее" : "");
    const shape = createSvg("circle", {
      cx: "0",
      cy: "0",
      r: "34",
      class: "turing-graph-node__shape",
    });
    group.append(title, shape);
    if (node.kind === "accept") {
      group.appendChild(createSvg("circle", {
        cx: "0",
        cy: "0",
        r: "27",
        class: "turing-graph-node__inner",
      }));
    } else if (node.kind === "reject") {
      group.append(
        createSvg("path", {
          d: "M -15 -15 L 15 15 M 15 -15 L -15 15",
          class: "turing-graph-node__reject-mark",
        })
      );
    }
    const label = createSvg("text", {
      x: "0",
      y: node.kind === "reject" ? "50" : "5",
      "text-anchor": "middle",
      class: "turing-graph-node__label",
    });
    label.textContent = node.label;
    group.appendChild(label);
    return group;
  }

  function createSvg(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    return element;
  }

  function renderRules() {
    const currentMachine = machine();
    const applicable = core.transitionFor(state);
    const manual = role() === "manual";
    const fragment = document.createDocumentFragment();

    currentMachine.transitions.forEach(function (transition) {
      const row = document.createElement("tr");
      if (applicable && transition.id === applicable.id) {
        row.classList.add("is-applicable");
      }
      if (state.lastTransitionId === transition.id) {
        row.classList.add("was-applied");
      }

      const choiceCell = document.createElement("td");
      const choice = document.createElement("input");
      choice.type = "radio";
      choice.name = "turing-transition";
      choice.value = transition.id;
      choice.checked = selectedTransitionId === transition.id;
      choice.disabled = !manual || state.status !== "running";
      choice.setAttribute(
        "aria-label",
        "Выбрать правило " + transition.state + ", " + transition.read +
        ": записать " + transition.write + ", " + transition.move +
        ", перейти в " + transition.nextState
      );
      choice.addEventListener("change", function () {
        selectedTransitionId = transition.id;
        showError("");
        renderGraph();
      });
      choiceCell.appendChild(choice);

      [
        transition.state,
        transition.read,
        transition.write,
        transition.move === "L" ? "←" : "→",
        transition.nextState,
      ].forEach(function (value) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      row.prepend(choiceCell);
      fragment.appendChild(row);
    });
    elements.rulesBody.replaceChildren(fragment);
  }

  function renderControls() {
    const running = state.status === "running";
    elements.step.disabled = !running || timer !== null;
    elements.run.disabled = !running || timer !== null;
    elements.pause.disabled = timer === null;
    elements.reset.disabled = false;
    elements.machine.disabled = timer !== null;
    elements.input.disabled = timer !== null;
    elements.roleInputs.forEach(function (input) {
      input.disabled = timer !== null;
    });
    elements.step.textContent = role() === "manual"
      ? "Применить выбранное правило"
      : "Один шаг";
  }

  function renderState() {
    const applicable = core.transitionFor(state);
    const currentConfiguration = core.configuration(state);
    elements.state.textContent = state.state;
    elements.symbol.textContent = core.readSymbol(state);
    elements.steps.textContent = String(state.stepNumber);
    elements.outcome.textContent = statusLabel(state.status);
    elements.configuration.textContent = currentConfiguration.text;
    elements.rule.textContent = applicable
      ? "(" + applicable.state + ", " + applicable.read + ") → (" +
        applicable.nextState + ", " + applicable.write + ", " +
        (applicable.move === "L" ? "L" : "R") + "). " + applicable.explanation
      : core.resultDescription(state);
  }

  function render() {
    elements.speedValue.textContent =
      controls.speedModel(elements.speed.value).label;
    renderTape();
    renderGraph();
    renderState();
    renderRules();
    renderControls();
  }

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    applyInputs();
  });
  elements.machine.addEventListener("change", function () {
    loadMachine(elements.machine.value, true);
  });
  elements.roleInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      setRole(input.value);
      announce(
        input.value === "manual"
          ? "Ручной режим: выберите строку таблицы и примените её."
          : "Исполнитель готов сам выбирать единственное применимое правило."
      );
    });
  });
  elements.speed.addEventListener("input", render);
  elements.step.addEventListener("click", performStep);
  elements.run.addEventListener("click", runAutomatic);
  elements.pause.addEventListener("click", function () {
    stopAutomatic("Выполнение приостановлено. Текущая конфигурация сохранена.");
  });
  elements.reset.addEventListener("click", reset);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && timer !== null) {
      stopAutomatic("Выполнение приостановлено, потому что вкладка стала неактивной.");
    }
  });

  elements.inputHelp.textContent = machine().inputHelp;
  elements.machineDescription.textContent = machine().description;
  announce("Выберите строку таблицы, которая подходит к состоянию и символу под головкой.");
  render();
})();
