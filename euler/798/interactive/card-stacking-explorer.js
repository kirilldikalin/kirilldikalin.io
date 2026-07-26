(() => {
  "use strict";

  const root = document.getElementById("euler798-explorer");
  const core = window.Euler798Core;
  if (!root || !core) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const tabs = [...root.querySelectorAll("[data-e798-tab]")];
  const panels = [...root.querySelectorAll("[data-e798-panel]")];
  const positionN = root.querySelector("#e798-position-n");
  const distributionN = root.querySelector("#e798-distribution-n");
  const hadamardN = root.querySelector("#e798-hadamard-n");
  const suits = root.querySelector("#e798-suits");
  const stage = root.querySelector("#e798-stage");
  const cards = root.querySelector("[data-e798-cards]");
  const children = root.querySelector("[data-e798-children]");
  const positionMap = root.querySelector("[data-e798-position-map]");
  const distributionChart = root.querySelector("[data-e798-distribution-chart]");
  const hadamardNetwork = root.querySelector("[data-e798-hadamard-network]");
  let visibleCards = new Set([1, 3, 5]);
  let selectedChildKey = "";

  function svgElement(name, attributes = {}, text = "") {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    if (text !== "") node.textContent = text;
    return node;
  }

  function formatState(state) {
    return state.length === 0 ? "∅" : "(" + state.join(", ") + ")";
  }

  function switchPanel(name) {
    tabs.forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.e798Tab === name));
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.e798Panel !== name;
    });
  }

  function drawPositionRow(group, state, y, label, maxCoordinate, blockerIndex = -1) {
    const left = 125;
    const right = 820;
    const xFor = (coordinate) => maxCoordinate === 0
      ? (left + right) / 2
      : left + (coordinate * (right - left)) / maxCoordinate;
    const occupied = new Map(state.map((coordinate, index) => [coordinate, index]));

    group.append(svgElement("text", {
      x: 18,
      y: y + 6,
      class: "e798-row-title",
    }, label));
    group.append(svgElement("line", {
      x1: left,
      y1: y,
      x2: right,
      y2: y,
      class: "e798-axis",
    }));

    for (let coordinate = 0; coordinate <= maxCoordinate; coordinate += 1) {
      const index = occupied.get(coordinate);
      const isOpen = index !== undefined;
      const className = isOpen
        ? (index === blockerIndex ? "e798-open e798-blocker" : "e798-open")
        : "e798-free";
      group.append(svgElement("circle", {
        cx: xFor(coordinate),
        cy: y,
        r: isOpen ? 11 : 7,
        class: className,
      }));
      group.append(svgElement("text", {
        x: xFor(coordinate),
        y: y + 31,
        "text-anchor": "middle",
        class: "e798-label",
      }, coordinate));
    }
  }

  function renderPosition() {
    const n = Number(positionN.value);
    root.querySelector("[data-e798-position-n-value]").textContent = n;

    for (const card of [...visibleCards]) {
      if (card > n) visibleCards.delete(card);
    }

    cards.replaceChildren();
    for (let card = 1; card <= n; card += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = card;
      button.setAttribute("aria-pressed", String(visibleCards.has(card)));
      button.setAttribute(
        "aria-label",
        `Карта ${card}: ${visibleCards.has(card) ? "на столе" : "в колоде"}`,
      );
      button.addEventListener("click", () => {
        if (visibleCards.has(card)) visibleCards.delete(card);
        else visibleCards.add(card);
        selectedChildKey = "";
        renderPosition();
      });
      cards.append(button);
    }

    const state = core.subsetToState(n, [...visibleCards]);
    const characteristics = core.positionCharacteristics(state);
    const moves = core.legalMoves(state);
    const moveRecords = moves.map((move) => ({
      state: move,
      key: move.join(","),
      grundy: core.grundyByFormula(move),
    }));

    if (!moveRecords.some((record) => record.key === selectedChildKey)) {
      selectedChildKey = moveRecords[0]?.key || "";
    }
    const selectedChild = moveRecords.find((record) => record.key === selectedChildKey);

    root.querySelector("[data-e798-state]").textContent = "X = " + formatState(state);
    root.querySelector("[data-e798-characteristics]").textContent =
      `d = ${characteristics.d}, h = ${Number.isFinite(characteristics.h) ? characteristics.h : "∞"}`;
    root.querySelector("[data-e798-grundy]").textContent = "g = " + characteristics.grundy;

    positionMap.replaceChildren();
    const maxCoordinate = Math.max(n - 1, state.at(-1) || 0);
    drawPositionRow(
      positionMap,
      state,
      76,
      "Сейчас",
      maxCoordinate,
      characteristics.blockerIndex,
    );
    if (selectedChild) {
      drawPositionRow(
        positionMap,
        selectedChild.state,
        188,
        "После хода",
        maxCoordinate,
      );
    } else {
      positionMap.append(svgElement("text", {
        x: 470,
        y: 192,
        "text-anchor": "middle",
        class: "e798-label",
      }, "Допустимых ходов нет"));
    }

    const reachable = [...new Set(moveRecords.map((record) => record.grundy))]
      .sort((left, right) => left - right);
    root.querySelector("[data-e798-mex]").textContent = moveRecords.length === 0
      ? "Терминальная позиция: множество нимберов потомков пусто, поэтому mex = 0."
      : `Нимберы потомков: {${reachable.join(", ")}}; mex = ${characteristics.grundy}.`;

    children.replaceChildren();
    moveRecords.forEach((record) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${formatState(record.state)} → g=${record.grundy}`;
      button.setAttribute("aria-pressed", String(record.key === selectedChildKey));
      button.addEventListener("click", () => {
        selectedChildKey = record.key;
        renderPosition();
      });
      children.append(button);
    });
  }

  function renderDistribution() {
    const n = Number(distributionN.value);
    const suitCount = Number(suits.value);
    const distribution = core.formulaDistribution(n);
    const zeroCount = core.xorZeroCount(distribution, suitCount);
    root.querySelector("[data-e798-distribution-n-value]").textContent = n;
    root.querySelector("[data-e798-suits-value]").textContent = suitCount;
    root.querySelector("[data-e798-subsets]").textContent = (2 ** n).toLocaleString("ru-RU");
    root.querySelector("[data-e798-zero-frequency]").textContent =
      distribution[0].toLocaleString("ru-RU");
    root.querySelector("[data-e798-xor-zero]").textContent = zeroCount.toLocaleString("ru-RU");

    distributionChart.replaceChildren();
    const left = 74;
    const right = 830;
    const top = 42;
    const bottom = 325;
    const maxValue = Math.max(...distribution);
    const slot = (right - left) / distribution.length;
    const barWidth = Math.min(74, slot * 0.62);
    const yFor = (value) => bottom - (value / maxValue) * (bottom - top);

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = Math.round((maxValue * tick) / 4);
      const y = yFor(value);
      distributionChart.append(svgElement("line", {
        x1: left,
        y1: y,
        x2: right,
        y2: y,
        class: "e798-grid",
      }));
      distributionChart.append(svgElement("text", {
        x: left - 12,
        y: y + 5,
        "text-anchor": "end",
        class: "e798-label",
      }, value));
    }
    distributionChart.append(svgElement("line", {
      x1: left,
      y1: bottom,
      x2: right,
      y2: bottom,
      class: "e798-axis",
    }));

    distribution.forEach((value, grundy) => {
      const x = left + grundy * slot + (slot - barWidth) / 2;
      const y = yFor(value);
      distributionChart.append(svgElement("rect", {
        x,
        y,
        width: barWidth,
        height: bottom - y,
        rx: 3,
        class: grundy === 0 ? "e798-bar e798-bar-zero" : "e798-bar",
      }));
      distributionChart.append(svgElement("text", {
        x: x + barWidth / 2,
        y: y - 9,
        "text-anchor": "middle",
        class: "e798-value",
      }, value));
      distributionChart.append(svgElement("text", {
        x: x + barWidth / 2,
        y: bottom + 28,
        "text-anchor": "middle",
        class: "e798-label",
      }, "g=" + grundy));
    });

    root.querySelector("[data-e798-distribution-detail]").textContent =
      `Сумма столбцов: ${distribution.reduce((sum, value) => sum + value, 0)} = 2^${n}. `
      + `Для ${suitCount} ${suitCount === 1 ? "масти" : "мастей"} проигрышны наборы с XOR нимберов, равным нулю.`;
  }

  function renderHadamard() {
    const n = Number(hadamardN.value);
    const distribution = core.formulaDistribution(n);
    const stages = core.hadamardStages(distribution);
    const activeStage = Math.min(Number(stage.value), stages.length - 1);
    stage.max = String(stages.length - 1);
    stage.value = String(activeStage);

    root.querySelector("[data-e798-hadamard-n-value]").textContent = n;
    root.querySelector("[data-e798-stage-value]").textContent =
      activeStage + " / " + (stages.length - 1);
    root.querySelector("[data-e798-length]").textContent = "L = " + stages[0].length;
    root.querySelector("[data-e798-operation]").textContent = activeStage === 0
      ? "Исходные частоты"
      : "u + v, u − v";
    root.querySelector("[data-e798-first]").textContent =
      stages[activeStage][0].toLocaleString("ru-RU");

    hadamardNetwork.replaceChildren();
    const length = stages[0].length;
    const columns = stages.length;
    const left = 72;
    const right = 848;
    const top = 44;
    const bottom = 420;
    const xFor = (column) => columns === 1
      ? (left + right) / 2
      : left + (column * (right - left)) / (columns - 1);
    const yFor = (row) => length === 1
      ? (top + bottom) / 2
      : top + (row * (bottom - top)) / (length - 1);

    for (let column = 1; column < columns; column += 1) {
      const block = 2 ** (column - 1);
      for (let row = 0; row < length; row += 1) {
        const partner = row ^ block;
        const lowerOutput = (row & block) !== 0;
        const active = column === activeStage;
        hadamardNetwork.append(svgElement("line", {
          x1: xFor(column - 1) + 12,
          y1: yFor(partner),
          x2: xFor(column) - 12,
          y2: yFor(row),
          class: [
            "e798-edge",
            lowerOutput ? "e798-edge-minus" : "",
            active ? "e798-edge-active" : "",
          ].filter(Boolean).join(" "),
        }));
      }
    }

    for (let column = 0; column < columns; column += 1) {
      hadamardNetwork.append(svgElement("text", {
        x: xFor(column),
        y: 20,
        "text-anchor": "middle",
        class: "e798-label",
      }, column === 0 ? "f" : "этап " + column));

      for (let row = 0; row < length; row += 1) {
        const active = column === activeStage;
        hadamardNetwork.append(svgElement("circle", {
          cx: xFor(column),
          cy: yFor(row),
          r: 16,
          class: active ? "e798-node e798-node-active" : "e798-node",
        }));
        hadamardNetwork.append(svgElement("text", {
          x: xFor(column),
          y: yFor(row) + 5,
          "text-anchor": "middle",
          class: active ? "e798-value e798-value-active" : "e798-value",
        }, stages[column][row]));
      }
    }

    root.querySelector("[data-e798-hadamard-detail]").textContent = activeStage === 0
      ? `Массив (${distribution.join(", ")}) дополнен нулями до степени двойки.`
      : `На этапе ${activeStage} сплошная связь входит со знаком «+», штриховая — со знаком «−».`;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.e798Tab));
  });
  positionN.addEventListener("input", () => {
    visibleCards = new Set(
      Array.from({ length: Number(positionN.value) }, (_, index) => index + 1)
        .filter((card) => card % 2 === 1),
    );
    selectedChildKey = "";
    renderPosition();
  });
  distributionN.addEventListener("input", renderDistribution);
  suits.addEventListener("input", renderDistribution);
  hadamardN.addEventListener("input", () => {
    stage.value = "0";
    renderHadamard();
  });
  stage.addEventListener("input", renderHadamard);

  renderPosition();
  renderDistribution();
  renderHadamard();
})();
