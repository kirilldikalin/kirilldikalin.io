(function () {
  "use strict";

  const core = window.Euler1003Core;
  const svgNamespace = "http://www.w3.org/2000/svg";
  let selectedPositions = [2, 5, 8, 13];

  function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text) element.textContent = text;
    return element;
  }

  function clear(element) {
    element.replaceChildren();
  }

  function line(scene, x1, y1, x2, y2, className) {
    scene.append(svgElement("line", { x1, y1, x2, y2, class: className }));
  }

  function text(scene, x, y, value, className = "e1003-label", anchor = "start") {
    scene.append(svgElement("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    }, value));
  }

  function formatInteger(value) {
    return String(value).replace("-", "−");
  }

  function formatPair(pair) {
    return `(${formatInteger(pair.u)}, ${formatInteger(pair.v)})`;
  }

  function formatDigits(value, alphabet) {
    const normal = "0123456789";
    return String(value).split("").map((digit) => alphabet[normal.indexOf(digit)]).join("");
  }

  function subscript(value) {
    return formatDigits(value, "₀₁₂₃₄₅₆₇₈₉");
  }

  function superscript(value) {
    return formatDigits(value, "⁰¹²³⁴⁵⁶⁷⁸⁹");
  }

  function formatLinear(pair) {
    const xTerm = pair.u === 1
      ? "x"
      : pair.u === -1
        ? "−x"
        : `${formatInteger(pair.u)}x`;
    return `${xTerm} ${pair.v < 0 ? "−" : "+"} ${Math.abs(pair.v)}`;
  }

  function drawArrow(scene, fromX, fromY, toX, toY, label) {
    scene.append(svgElement("path", {
      d: `M ${fromX} ${fromY} Q ${(fromX + toX) / 2} ${Math.min(fromY, toY) - 45} ${toX} ${toY}`,
      class: "e1003-transfer",
    }));
    text(scene, (fromX + toX) / 2, Math.min(fromY, toY) - 28, label, "e1003-note", "middle");
  }

  function drawStones() {
    const n = Number(document.querySelector("#e1003-n").value);
    const step = Number(document.querySelector("#e1003-step").value);
    const state = core.simulateSteps(n, step);
    const scene = document.querySelector("[data-e1003-stones-scene]");
    clear(scene);

    const startX = 70;
    const spacing = 82;
    const axisY = 220;
    line(scene, startX - 20, axisY, startX + spacing * 9 + 20, axisY, "e1003-axis");

    const lastEvent = state.lastEvent;
    if (lastEvent) {
      const fromX = startX + lastEvent.index * spacing;
      drawArrow(scene, fromX, axisY - 35, fromX + spacing, axisY - 35, `q=${lastEvent.moved}`);
      drawArrow(scene, fromX, axisY - 35, fromX + spacing * 3, axisY - 35, `q=${lastEvent.moved}`);
    }

    for (let index = 0; index <= 9; index += 1) {
      const x = startX + index * spacing;
      const value = state.positions[index] ?? 0;
      const processed = index < step;
      const singleton = processed && value === 1;
      const className = singleton
        ? "e1003-node e1003-node-singleton"
        : value > 0 && !processed
          ? "e1003-node e1003-node-active"
          : "e1003-node";
      scene.append(svgElement("circle", {
        cx: x,
        cy: axisY,
        r: 27,
        class: className,
      }));
      text(
        scene,
        x,
        axisY + 6,
        String(value),
        value > 0 && (!processed || singleton) ? "e1003-label e1003-inverse" : "e1003-label",
        "middle"
      );
      text(scene, x, axisY + 55, `i=${index}`, "e1003-note", "middle");
    }

    text(scene, 460, 55, "каждая обработанная куча m превращается в", "e1003-note", "middle");
    text(scene, 460, 85, "остаток m mod 2 и два одинаковых переноса ⌊m/2⌋", "e1003-label", "middle");
    text(scene, 460, 325, `в показанных позициях остаётся ${state.visibleStoneCount} камней`, "e1003-note", "middle");

    document.querySelector("[data-e1003-n-value]").textContent = n;
    document.querySelector("[data-e1003-step-value]").textContent = step;
    if (!lastEvent) {
      document.querySelector("[data-e1003-pile]").textContent = "обработка не начата";
      document.querySelector("[data-e1003-moved]").textContent = "—";
      document.querySelector("[data-e1003-singleton]").textContent = "—";
      document.querySelector("[data-e1003-stones-detail]").textContent =
        `В позиции 0 лежит исходная куча из ${n} камней.`;
      return;
    }
    document.querySelector("[data-e1003-pile]").textContent =
      `позиция ${lastEvent.index}: ${lastEvent.before}`;
    document.querySelector("[data-e1003-moved]").textContent = `по ${lastEvent.moved}`;
    document.querySelector("[data-e1003-singleton]").textContent =
      lastEvent.singleton ? `остаётся в ${lastEvent.index}` : "нет";
    document.querySelector("[data-e1003-stones-detail]").textContent =
      `После обработки позиции ${lastEvent.index} её чётность b${subscript(lastEvent.index)} равна ${lastEvent.singleton}, а q${subscript(lastEvent.index)} = ${lastEvent.moved}.`;
  }

  function drawResidues() {
    const selected = Number(document.querySelector("#e1003-index").value);
    const pairs = core.residuePairs(13);
    const scene = document.querySelector("[data-e1003-residues-scene]");
    clear(scene);

    pairs.forEach((pair, index) => {
      const column = index % 7;
      const row = Math.floor(index / 7);
      const x = 48 + column * 124;
      const y = 80 + row * 145;
      const active = index === selected;
      scene.append(svgElement("rect", {
        x,
        y,
        width: 104,
        height: 92,
        rx: 8,
        class: active ? "e1003-card e1003-card-active" : "e1003-card",
      }));
      text(scene, x + 52, y + 30, `x${superscript(index)}`, active ? "e1003-label e1003-inverse" : "e1003-label", "middle");
      text(scene, x + 52, y + 65, formatPair(pair), active ? "e1003-note e1003-inverse" : "e1003-note", "middle");
    });

    const pair = pairs[selected];
    if (selected >= 2) {
      text(scene, 460, 362,
        `−${formatPair(pairs[selected - 1])} − 2·${formatPair(pairs[selected - 2])} = ${formatPair(pair)}`,
        "e1003-note", "middle");
    } else {
      text(scene, 460, 362, selected === 0 ? "x⁰ ≡ 1" : "x¹ ≡ x", "e1003-note", "middle");
    }
    text(scene, 460, 398, "x² ≡ −x−2  (mod x²+x+2)", "e1003-label", "middle");

    document.querySelector("[data-e1003-index-value]").textContent = selected;
    document.querySelector("[data-e1003-pair]").textContent = formatPair(pair);
    document.querySelector("[data-e1003-u]").textContent = `u${subscript(selected)} = ${formatInteger(pair.u)}`;
    document.querySelector("[data-e1003-v]").textContent = `v${subscript(selected)} = ${formatInteger(pair.v)}`;
    document.querySelector("[data-e1003-residues-detail]").textContent =
      `Степень x${superscript(selected)} заменяется линейным остатком ${formatLinear(pair)}. Для множества позиции просто складываются покомпонентно.`;
  }

  function drawMeet() {
    const split = Number(document.querySelector("#e1003-split").value);
    const summary = core.meetInTheMiddleSummary(selectedPositions, split);
    const scene = document.querySelector("[data-e1003-meet-scene]");
    clear(scene);

    const startX = 65;
    const spacing = 58;
    const axisY = 190;
    line(scene, startX - 18, axisY, startX + spacing * 13 + 18, axisY, "e1003-axis");
    const splitX = startX + 6.5 * spacing;
    line(scene, splitX, 35, splitX, 260, "e1003-split");
    text(scene, splitX - 15, 55, "левая половина", "e1003-note", "end");
    text(scene, splitX + 15, 55, "правая половина", "e1003-note");

    for (let index = 0; index <= 13; index += 1) {
      const x = startX + index * spacing;
      const selected = selectedPositions.includes(index);
      scene.append(svgElement("circle", {
        cx: x,
        cy: axisY,
        r: 19,
        class: selected ? "e1003-node e1003-node-singleton" : "e1003-node",
      }));
      text(scene, x, axisY + 5, String(index), selected ? "e1003-note e1003-inverse" : "e1003-note", "middle");
    }

    text(scene, 245, 105,
      `Σ(u,v) = ${formatPair(summary.left.residue)}`,
      "e1003-label", "middle");
    text(scene, 675, 105,
      `Σ(u,v) = ${formatPair(summary.right.residue)}`,
      "e1003-label", "middle");
    text(scene, 245, 135, `граничная маска ${summary.left.mask}`, "e1003-note", "middle");
    text(scene, 675, 135, `граничная маска ${summary.right.mask}`, "e1003-note", "middle");

    const baseY = 405;
    text(scene, 460, 278, "восстановленные переносы qᵢ", "e1003-label", "middle");
    const reconstruction = summary.candidate.reconstruction;
    if (reconstruction) {
      const rows = reconstruction.rows.slice(0, 14);
      const finiteValues = rows
        .map((row) => row.q)
        .filter(Number.isFinite)
        .map(Math.abs);
      const maxQ = Math.max(1, ...finiteValues);
      rows.forEach((row) => {
        const x = startX + row.index * spacing;
        const height = Number.isFinite(row.q) ? 105 * Math.abs(row.q) / maxQ : 4;
        scene.append(svgElement("rect", {
          x: x - 12,
          y: baseY - height,
          width: 24,
          height,
          rx: 3,
          class: row.valid ? "e1003-q-bar" : "e1003-q-bar is-invalid",
        }));
        text(scene, x, baseY + 22, `q${subscript(row.index)}`, "e1003-note", "middle");
      });
    } else {
      text(
        scene,
        460,
        350,
        "сначала нужны Σuᵢ=0 и положительный свободный член",
        "e1003-note",
        "middle"
      );
    }

    document.querySelector("[data-e1003-split-value]").textContent = split;
    document.querySelector("[data-e1003-combined-u]").textContent =
      `Σuᵢ = ${formatInteger(summary.combinedResidue.u)}`;
    document.querySelector("[data-e1003-candidate]").textContent =
      `n = ${summary.candidate.n ?? "—"}`;
    document.querySelector("[data-e1003-q-check]").textContent = reconstruction
      ? reconstruction.valid
        ? `min qᵢ = ${reconstruction.minQ}`
        : "проверка не пройдена"
      : "не вычисляются";

    let detail;
    if (selectedPositions.length === 0) {
      detail = "Выберите singleton-позиции: две единицы не должны стоять ближе чем через три места.";
    } else if (!summary.compatible) {
      detail = "Набор не проходит условие одиночности: две выбранные позиции находятся слишком близко.";
    } else if (summary.combinedResidue.u !== 0) {
      detail = `Маски ${summary.left.mask} и ${summary.right.mask} совместимы, но Σuᵢ=${formatInteger(summary.combinedResidue.u)}: коэффициенты двух половин не уничтожились.`;
    } else if (summary.candidate.n === null) {
      detail = `Коэффициент при x уничтожился, но свободный член ${formatInteger(summary.combinedResidue.v)} не даёт положительного кандидата.`;
    } else if (!reconstruction.valid) {
      detail = `Получился кандидат n=${summary.candidate.n}, но восстановление нашло недопустимые переносы qᵢ.`;
    } else {
      detail = `Маски ${summary.left.mask} и ${summary.right.mask} совместимы; суммы u уничтожаются, все qᵢ неотрицательны, хвост стабилизируется на ${reconstruction.tailValue}.`;
    }
    document.querySelector("[data-e1003-meet-detail]").textContent = detail;
  }

  function syncMeetControls() {
    const selected = new Set(selectedPositions);
    document.querySelectorAll("[data-e1003-position]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(selected.has(Number(button.dataset.e1003Position)))
      );
    });
    const key = selectedPositions.join(",");
    document.querySelectorAll("[data-e1003-preset]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.e1003Preset === key);
    });
  }

  function setSelectedPositions(positions) {
    selectedPositions = core.normalizePositions(positions)
      .filter((position) => position >= 0 && position <= 13);
    syncMeetControls();
    drawMeet();
  }

  function initializePositionPicker() {
    const picker = document.querySelector("[data-e1003-position-picker]");
    for (let position = 0; position <= 13; position += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.e1003Position = position;
      button.textContent = String(position);
      button.setAttribute("aria-label", `Позиция ${position}`);
      button.addEventListener("click", () => {
        const next = new Set(selectedPositions);
        if (next.has(position)) next.delete(position);
        else next.add(position);
        setSelectedPositions([...next]);
      });
      picker.append(button);
    }
    syncMeetControls();
  }

  function selectTab(name) {
    document.querySelectorAll("[data-e1003-tab]").forEach((tab) => {
      const active = tab.dataset.e1003Tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-e1003-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.e1003Panel !== name;
    });
  }

  document.querySelectorAll("[data-e1003-tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.e1003Tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-e1003-tab]")];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
      selectTab(next.dataset.e1003Tab);
      next.focus();
    });
  });

  ["#e1003-n", "#e1003-step"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", drawStones);
  });
  document.querySelector("#e1003-index").addEventListener("input", drawResidues);
  document.querySelectorAll("[data-e1003-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedPositions(button.dataset.e1003Preset.split(",").map(Number));
    });
  });
  document.querySelector("[data-e1003-clear]").addEventListener("click", () => {
    setSelectedPositions([]);
  });
  document.querySelector("#e1003-split").addEventListener("input", drawMeet);

  initializePositionPicker();
  drawStones();
  drawResidues();
  drawMeet();
})();
