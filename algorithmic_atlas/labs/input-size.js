(function () {
  "use strict";

  const core = window.InputSizeCore;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const elements = {};
  let magnitude = null;
  let gcdComparison = null;

  function init() {
    cacheElements();
    if (!core) {
      showError(elements.magnitudeError, "Не загрузилось вычислительное ядро лаборатории.");
      disableForms();
      return;
    }

    elements.modeInputs.forEach(function (input) {
      input.addEventListener("change", renderMode);
    });
    elements.magnitudeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      applyMagnitudeInput();
    });
    elements.exponent.addEventListener("input", applyExponent);
    elements.rate.addEventListener("change", applyMagnitudeInput);
    elements.gcdForm.addEventListener("submit", function (event) {
      event.preventDefault();
      applyGcdInputs();
    });

    renderMode();
    applyMagnitudeInput();
    applyGcdInputs();
  }

  function cacheElements() {
    elements.modeInputs = Array.from(document.querySelectorAll(
      'input[name="input-size-mode"]'
    ));
    elements.magnitudePanel = document.getElementById("input-size-magnitude-panel");
    elements.gcdPanel = document.getElementById("input-size-gcd-panel");
    elements.magnitudeForm = document.getElementById("input-size-form");
    elements.valueInput = document.getElementById("input-size-value");
    elements.exponent = document.getElementById("input-size-exponent");
    elements.exponentOutput = document.getElementById("input-size-exponent-output");
    elements.rate = document.getElementById("input-size-rate");
    elements.magnitudeError = document.getElementById("input-size-error");
    elements.value = document.getElementById("input-size-current-value");
    elements.binary = document.getElementById("input-size-binary");
    elements.bitLength = document.getElementById("input-size-bit-length");
    elements.unaryLength = document.getElementById("input-size-unary-length");
    elements.unaryPreview = document.getElementById("input-size-unary-preview");
    elements.binaryBounds = document.getElementById("input-size-binary-bounds");
    elements.encodingGeometry = document.getElementById(
      "input-size-encoding-geometry"
    );
    elements.encodingDescription = document.getElementById(
      "input-size-encoding-description"
    );
    elements.encodingCaption = document.getElementById(
      "input-size-encoding-caption"
    );
    elements.magnitudeBars = document.getElementById("input-size-bars");
    elements.magnitudeTable = document.getElementById("input-size-table-body");
    elements.magnitudeStatus = document.getElementById("input-size-status");
    elements.gcdForm = document.getElementById("input-size-gcd-form");
    elements.gcdLeft = document.getElementById("input-size-gcd-left");
    elements.gcdRight = document.getElementById("input-size-gcd-right");
    elements.gcdError = document.getElementById("input-size-gcd-error");
    elements.gcdResult = document.getElementById("input-size-gcd-result");
    elements.gcdBits = document.getElementById("input-size-gcd-bits");
    elements.gcdBars = document.getElementById("input-size-gcd-bars");
    elements.gcdTable = document.getElementById("input-size-gcd-table-body");
    elements.gcdBitWork = document.getElementById("input-size-gcd-bit-work");
    elements.gcdStatus = document.getElementById("input-size-gcd-status");
  }

  function renderMode() {
    const selected = elements.modeInputs.find(function (input) {
      return input.checked;
    });
    const gcdMode = selected && selected.value === "gcd";
    elements.magnitudePanel.hidden = gcdMode;
    elements.gcdPanel.hidden = !gcdMode;
  }

  function applyMagnitudeInput() {
    try {
      const value = core.parsePositiveInteger(elements.valueInput.value, "N");
      const rate = core.parsePositiveInteger(elements.rate.value, "Скорость");
      magnitude = core.magnitudeModel(value, rate);
      const exponent = Math.min(
        magnitude.bitLength - 1,
        core.MAX_SLIDER_EXPONENT
      );
      elements.exponent.value = String(exponent);
      hideError(elements.magnitudeError);
      renderMagnitude();
    } catch (error) {
      magnitude = null;
      showError(elements.magnitudeError, error.message);
    }
  }

  function applyExponent() {
    const exponent = Number(elements.exponent.value);
    elements.valueInput.value = String(core.powerOfTwo(exponent));
    applyMagnitudeInput();
  }

  function renderMagnitude() {
    if (!magnitude) {
      return;
    }
    const value = magnitude.value;
    const exponent = magnitude.bitLength - 1;
    elements.exponentOutput.textContent =
      "k = " + exponent + "; ползунок выбирает N = 2^k";
    elements.value.textContent = core.groupedInteger(value);
    elements.value.title = String(value);
    elements.binary.textContent = magnitude.binary.text;
    elements.binary.title = magnitude.binary.truncated
      ? "Показаны начало и конец записи из " + magnitude.binary.totalBits + " бит."
      : magnitude.binary.text;
    elements.bitLength.textContent = String(magnitude.bitLength);
    elements.unaryLength.textContent = core.compactInteger(magnitude.unaryLength);
    elements.unaryLength.title = String(magnitude.unaryLength);
    elements.unaryPreview.textContent = magnitude.unary.text;
    elements.binaryBounds.textContent =
      "2^" + exponent + " ≤ N < 2^" + magnitude.bitLength;

    renderEncodingGeometry(core.encodingGeometry(value));
    renderBars(elements.magnitudeBars, magnitude.algorithms);
    elements.magnitudeTable.replaceChildren();
    magnitude.algorithms.forEach(function (algorithm) {
      const row = document.createElement("tr");
      appendCell(row, algorithm.label, true);
      appendCell(row, core.compactInteger(algorithm.steps));
      appendCell(row, algorithm.duration);
      appendCell(row, evaluationLabel(algorithm.evaluation));
      elements.magnitudeTable.appendChild(row);
    });

    elements.magnitudeStatus.textContent =
      "Общая шкала логарифмическая. Граница прямой симуляции — " +
      core.groupedInteger(magnitude.directSimulationLimit) +
      " шагов; большие значения получены формулой, без выполнения циклов.";
  }

  function renderEncodingGeometry(model) {
    if (!elements.encodingGeometry) {
      return;
    }
    const svg = elements.encodingGeometry;
    svg.replaceChildren();
    svg.classList.add("input-size-encoding-geometry");
    svg.setAttribute("viewBox", "0 0 760 430");
    const title = createSvg("title", {
      id: "input-size-encoding-title",
    });
    title.textContent = "Одна величина в унарной и двоичной кодировках";
    const description = createSvg("desc", {
      id: "input-size-encoding-description",
    });
    svg.append(title, description);
    elements.encodingDescription = description;
    svg.setAttribute(
      "aria-labelledby",
      "input-size-encoding-title input-size-encoding-description"
    );

    const binarySymbols = model.binaryHead.split("");
    if (model.binaryOmitted > 0) {
      binarySymbols.push("…");
      binarySymbols.push.apply(binarySymbols, model.binaryTail.split(""));
    }
    const maximumCells = Math.max(
      model.unaryGroups.length,
      binarySymbols.length,
      1
    );
    const cellWidth = Math.min(25, 620 / maximumCells);
    const unaryStart = 75;
    const binaryStart = 75;

    appendEncodingText(svg, 75, 38, "Унарная запись", "start", "is-heading");
    model.unaryGroups.forEach(function (groupSize, index) {
      const cell = createSvg("rect", {
        x: unaryStart + index * cellWidth,
        y: 55,
        width: Math.max(cellWidth - 1, 1),
        height: 48,
        class: model.unaryExact
          ? "input-size-encoding-cell is-unary"
          : "input-size-encoding-cell is-unary is-aggregate",
      });
      svg.appendChild(cell);
      if (model.unaryExact && cellWidth >= 13) {
        appendEncodingText(
          svg,
          unaryStart + (index + 0.5) * cellWidth,
          86,
          "1",
          "middle",
          "is-cell-label"
        );
      }
      const cellTitle = createSvg("title");
      cellTitle.textContent = model.unaryExact
        ? "Один унарный символ"
        : "Сжатый блок: " + core.groupedInteger(groupSize) +
          " унарных символов";
      cell.appendChild(cellTitle);
    });
    appendEncodingText(
      svg,
      75,
      125,
      model.unaryExact
        ? core.groupedInteger(model.value) + " одинаковых символов"
        : model.unaryGroups.length + " блоков; один блок представляет " +
          compressionRange(model),
      "start",
      "is-note"
    );

    appendEncodingText(svg, 75, 168, "Двоичная запись", "start", "is-heading");
    binarySymbols.forEach(function (symbol, index) {
      const aggregate = symbol === "…";
      const cell = createSvg("rect", {
        x: binaryStart + index * cellWidth,
        y: 185,
        width: Math.max(cellWidth - 1, 1),
        height: 48,
        class: aggregate
          ? "input-size-encoding-cell is-binary is-aggregate"
          : "input-size-encoding-cell is-binary",
      });
      svg.appendChild(cell);
      if (cellWidth >= 11 || aggregate) {
        appendEncodingText(
          svg,
          binaryStart + (index + 0.5) * cellWidth,
          216,
          symbol,
          "middle",
          "is-cell-label"
        );
      }
    });
    appendEncodingText(
      svg,
      75,
      255,
      model.binaryExact
        ? model.binaryLength + " бит без сжатия"
        : model.binaryLength + " бит; между фрагментами скрыто " +
          model.binaryOmitted,
      "start",
      "is-note"
    );

    renderLengthRuler(svg, model);
    const compression = model.compressionNumerator /
      model.compressionDenominator;
    appendEncodingText(
      svg,
      380,
      407,
      model.binaryLength + " бит дают " +
        core.compactInteger(model.patternCapacity) +
        " двоичных комбинаций; N / |x| ≈ " +
        core.compactInteger(compression),
      "middle",
      "is-capacity"
    );

    const summary =
      "Число " + core.groupedInteger(model.value) +
      " занимает " + core.groupedInteger(model.value) +
      " символов в унарной записи и " + model.binaryLength +
      " бит в двоичной. " +
      (model.mode === "exact"
        ? "Все символы показаны отдельными клетками одинакового размера."
        : "Длинные записи агрегированы; точный коэффициент сжатия подписан.");
    description.textContent = summary;
    svg.setAttribute("aria-label", summary);
    if (elements.encodingCaption) {
      elements.encodingCaption.classList.add("input-size-encoding-caption");
      elements.encodingCaption.textContent = model.mode === "exact"
        ? "Клетки имеют одинаковую физическую ширину: разница длин показана без сжатия."
        : "Унарная строка агрегирована. Нижняя линейка логарифмическая; подписи сохраняют точные длины.";
    }
  }

  function renderLengthRuler(svg, model) {
    const startX = 75;
    const width = 610;
    const unaryWidth = width * model.unaryLogShare;
    const binaryWidth = Math.max(2, width * model.binaryLogShare);
    appendEncodingText(
      svg,
      startX,
      293,
      "Логарифмическая шкала физической длины",
      "start",
      "is-heading"
    );
    svg.appendChild(createSvg("rect", {
      x: startX,
      y: 310,
      width: width,
      height: 16,
      class: "input-size-length-track",
    }));
    svg.appendChild(createSvg("rect", {
      x: startX,
      y: 310,
      width: unaryWidth,
      height: 16,
      class: "input-size-length-bar is-unary",
    }));
    appendEncodingText(
      svg,
      startX,
      343,
      "унарная: " + core.compactInteger(model.value),
      "start",
      "is-note"
    );
    svg.appendChild(createSvg("rect", {
      x: startX,
      y: 354,
      width: width,
      height: 16,
      class: "input-size-length-track",
    }));
    svg.appendChild(createSvg("rect", {
      x: startX,
      y: 354,
      width: binaryWidth,
      height: 16,
      class: "input-size-length-bar is-binary",
    }));
    appendEncodingText(
      svg,
      startX,
      389,
      "двоичная: " + model.binaryLength,
      "start",
      "is-note"
    );
  }

  function compressionRange(model) {
    const lower = core.compactInteger(model.unaryCompressionFloor);
    const upper = core.compactInteger(model.unaryCompressionCeiling);
    return model.unaryCompressionFloor === model.unaryCompressionCeiling
      ? lower + " символов"
      : "от " + lower + " до " + upper + " символов";
  }

  function createSvg(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    return element;
  }

  function appendEncodingText(svg, x, y, value, anchor, className) {
    const element = createSvg("text", {
      x: x,
      y: y,
      "text-anchor": anchor || "start",
      class: className || "",
    });
    element.textContent = value;
    svg.appendChild(element);
    return element;
  }

  function applyGcdInputs() {
    try {
      const left = core.parsePositiveInteger(elements.gcdLeft.value, "a");
      const right = core.parsePositiveInteger(elements.gcdRight.value, "b");
      gcdComparison = core.gcdOperationCounts(left, right);
      hideError(elements.gcdError);
      renderGcdComparison();
    } catch (error) {
      gcdComparison = null;
      showError(elements.gcdError, error.message);
    }
  }

  function renderGcdComparison() {
    if (!gcdComparison) {
      return;
    }
    elements.gcdResult.textContent = core.groupedInteger(gcdComparison.gcd);
    elements.gcdBits.textContent = String(gcdComparison.maximumBitLength);
    elements.gcdBitWork.textContent = core.compactInteger(
      gcdComparison.schoolbookBitWork
    );
    elements.gcdBitWork.title = String(gcdComparison.schoolbookBitWork);
    renderBars(elements.gcdBars, gcdComparison.algorithms);
    elements.gcdTable.replaceChildren();
    gcdComparison.algorithms.forEach(function (algorithm) {
      const row = document.createElement("tr");
      appendCell(row, algorithm.label, true);
      appendCell(row, core.compactInteger(algorithm.steps));
      appendCell(row, gcdAssumption(algorithm.id));
      appendCell(row, evaluationLabel(algorithm.evaluation));
      elements.gcdTable.appendChild(row);
    });
    elements.gcdStatus.textContent =
      "Числа шагов выведены аналитически. Для делений отдельно показана " +
      "учебная оценка битовой работы Σ |a_i|·|b_i|; это модель школьного " +
      "деления, а не замер времени браузера.";
  }

  function renderBars(container, algorithms) {
    container.replaceChildren();
    algorithms.forEach(function (algorithm) {
      const row = document.createElement("div");
      row.className = "input-size-bar-row";

      const heading = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = algorithm.label;
      const value = document.createElement("span");
      value.textContent = core.compactInteger(algorithm.steps);
      value.title = String(algorithm.steps);
      heading.append(label, value);

      const track = document.createElement("div");
      track.className = "input-size-bar-track";
      track.setAttribute("role", "img");
      track.setAttribute(
        "aria-label",
        algorithm.label + ": " + core.groupedInteger(algorithm.steps) + " шагов"
      );
      const fill = document.createElement("i");
      fill.style.width = algorithm.steps === 0n
        ? "0"
        : Math.max(2, algorithm.logShare * 100).toFixed(2) + "%";
      track.appendChild(fill);
      row.append(heading, track);
      container.appendChild(row);
    });
  }

  function appendCell(row, value, header) {
    const cell = document.createElement(header ? "th" : "td");
    if (header) {
      cell.scope = "row";
    }
    cell.textContent = value;
    row.appendChild(cell);
  }

  function evaluationLabel(kind) {
    return kind === "direct-range"
      ? "в пределах прямой симуляции"
      : "аналитическая оценка";
  }

  function gcdAssumption(id) {
    if (id === "naive-divisors") {
      return "проверяем d от min(a,b) вниз";
    }
    if (id === "repeated-subtraction") {
      return "одно вычитание = один шаг";
    }
    return "одно деление с остатком = один шаг";
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function hideError(element) {
    element.hidden = true;
    element.textContent = "";
  }

  function disableForms() {
    Array.from(document.querySelectorAll("#input-size-lab input, #input-size-lab button, #input-size-lab select"))
      .forEach(function (control) {
        control.disabled = true;
      });
  }

  init();
})();
