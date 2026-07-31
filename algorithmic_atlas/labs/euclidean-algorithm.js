(function () {
  "use strict";

  const core = window.EuclideanAlgorithmCore;
  const controls = window.AtlasLabControlsCore;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TRACE_LIMIT = 70;
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const elements = {};
  let initialState = null;
  let state = null;
  let trace = [];
  let fullRun = null;
  let autoTimer = null;
  let transitionTimer = null;
  let running = false;
  let transitionGeometry = null;
  let badCaseMode = false;

  function init() {
    cacheElements();
    if (!core || !controls) {
      showError("Не загрузилось вычислительное ядро лаборатории.");
      disableControls();
      return;
    }

    elements.form.addEventListener("submit", function (event) {
      event.preventDefault();
      exitBadCaseMode();
      applyInputs();
    });
    elements.form.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || !event.target.matches("input")) {
        return;
      }
      event.preventDefault();
      exitBadCaseMode();
      applyInputs();
    });
    elements.step.addEventListener("click", takeStep);
    elements.auto.addEventListener("click", startAutomaticRun);
    elements.pause.addEventListener("click", function () {
      stopAutomaticRun("Выполнение приостановлено. Текущая пара сохранена.");
    });
    elements.reset.addEventListener("click", resetRun);
    elements.speed.addEventListener("input", updateSpeedLabel);
    elements.badCaseToggle.addEventListener("click", toggleBadCaseMode);
    elements.fibonacciIndex.addEventListener("input", loadBadCase);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopAutomaticRun();
      }
    });

    updateSpeedLabel();
    applyInputs();
  }

  function cacheElements() {
    elements.form = document.getElementById("euclid-form");
    elements.left = document.getElementById("euclid-left");
    elements.right = document.getElementById("euclid-right");
    elements.apply = document.getElementById("euclid-apply");
    elements.step = document.getElementById("euclid-step");
    elements.auto = document.getElementById("euclid-auto");
    elements.pause = document.getElementById("euclid-pause");
    elements.reset = document.getElementById("euclid-reset");
    elements.speed = document.getElementById("euclid-speed");
    elements.speedValue = document.getElementById("euclid-speed-value");
    elements.badCaseToggle = document.getElementById("euclid-bad-case-toggle");
    elements.badCasePanel = document.getElementById("euclid-bad-case");
    elements.fibonacciIndex = document.getElementById("euclid-fibonacci-index");
    elements.fibonacciLabel = document.getElementById("euclid-fibonacci-label");
    elements.error = document.getElementById("euclid-error");
    elements.divisions = document.getElementById("euclid-division-count");
    elements.subtractions = document.getElementById("euclid-subtraction-count");
    elements.bitLength = document.getElementById("euclid-bit-length");
    elements.result = document.getElementById("euclid-gcd-result");
    elements.geometry = document.getElementById("euclid-geometry");
    elements.geometryDescription = document.getElementById(
      "euclid-geometry-svg-description"
    );
    elements.geometryCaption = document.getElementById("euclid-geometry-caption");
    elements.transitionCaption = document.getElementById(
      "euclid-transition-caption"
    );
    elements.currentPair = document.getElementById("euclid-current-pair");
    elements.currentRule = document.getElementById("euclid-current-rule");
    elements.invariant = document.getElementById("euclid-invariant");
    elements.phaseComparison = document.getElementById("euclid-phase-comparison");
    elements.divisionTotal = document.getElementById("euclid-division-total");
    elements.subtractionTotal = document.getElementById("euclid-subtraction-total");
    elements.divisionBar = document.getElementById("euclid-division-bar");
    elements.subtractionBar = document.getElementById("euclid-subtraction-bar");
    elements.traceBody = document.getElementById("euclid-trace-body");
    elements.status = document.getElementById("euclid-status");
  }

  function applyInputs() {
    stopAutomaticRun();
    clearGeometryTransition();
    try {
      const left = core.parseInteger(elements.left.value, "Первое число");
      const right = core.parseInteger(elements.right.value, "Второе число");
      initialState = core.createState(left, right);
      fullRun = core.runToEnd(initialState);
      state = initialState;
      trace = [state];
      hideError();
      render();
    } catch (error) {
      initialState = null;
      state = null;
      trace = [];
      fullRun = null;
      showError(error.message);
      renderEmpty();
    }
  }

  function takeStep() {
    stopAutomaticRun();
    advanceOneStep();
  }

  function advanceOneStep() {
    if (!state || state.finished) {
      render();
      return;
    }
    transitionGeometry = core.geometryModel(state);
    state = core.step(state);
    trace.push(state);
    render();
    scheduleGeometryTransitionEnd();
  }

  function startAutomaticRun() {
    if (!state || state.finished) {
      return;
    }
    if (running) {
      return;
    }
    running = true;
    renderControls();
    elements.status.textContent =
      "Автоматическое выполнение запущено. Его можно приостановить.";
    scheduleAutomaticStep();
  }

  function scheduleAutomaticStep() {
    if (!running) {
      return;
    }
    autoTimer = window.setTimeout(function () {
      autoTimer = null;
      if (!running || !state || state.finished) {
        stopAutomaticRun();
        return;
      }
      advanceOneStep();
      if (state.finished) {
        stopAutomaticRun();
      } else {
        scheduleAutomaticStep();
      }
    }, speed().delayMs);
  }

  function stopAutomaticRun(message) {
    running = false;
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
    renderControls();
    if (message) {
      elements.status.textContent = message;
    }
  }

  function resetRun() {
    stopAutomaticRun();
    clearGeometryTransition();
    if (!initialState) {
      applyInputs();
      return;
    }
    state = initialState;
    trace = [state];
    hideError();
    render();
  }

  function toggleBadCaseMode() {
    badCaseMode = !badCaseMode;
    elements.badCaseToggle.setAttribute("aria-pressed", String(badCaseMode));
    elements.badCaseToggle.setAttribute("aria-expanded", String(badCaseMode));
    elements.badCasePanel.hidden = !badCaseMode;
    if (badCaseMode) {
      loadBadCase();
    }
  }

  function exitBadCaseMode() {
    if (!badCaseMode) {
      return;
    }
    badCaseMode = false;
    elements.badCaseToggle.setAttribute("aria-pressed", "false");
    elements.badCaseToggle.setAttribute("aria-expanded", "false");
    elements.badCasePanel.hidden = true;
  }

  function loadBadCase() {
    const index = Number(elements.fibonacciIndex.value);
    const badCase = core.fibonacciBadCase(index);
    elements.left.value = String(badCase.larger);
    elements.right.value = String(badCase.smaller);
    elements.fibonacciLabel.textContent =
      "F" + (index + 1) + " = " + formatBigInt(badCase.larger) +
      ", F" + index + " = " + formatBigInt(badCase.smaller) +
      ". Ожидается " + formatDivisionCount(badCase.expectedDivisionCount) + ".";
    applyInputs();
  }

  function updateSpeedLabel() {
    elements.speedValue.textContent = speed().label;
  }

  function speed() {
    return controls.speedModel(elements.speed.value);
  }

  function clearGeometryTransition() {
    transitionGeometry = null;
    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
  }

  function scheduleGeometryTransitionEnd() {
    if (reducedMotion.matches) {
      clearGeometryTransition();
      renderGeometry();
      return;
    }
    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
    }
    const duration = controls.motionDurationMs(elements.speed.value, false);
    transitionTimer = window.setTimeout(function () {
      transitionTimer = null;
      transitionGeometry = null;
      renderGeometry();
    }, duration);
  }

  function render() {
    if (!state || !fullRun) {
      renderEmpty();
      return;
    }

    elements.currentPair.textContent =
      "(a, b) = (" + formatBigInt(state.a) + ", " + formatBigInt(state.b) + ")";
    elements.currentRule.textContent = describeNextRule(state);
    elements.invariant.textContent =
      "НОД(" + formatBigInt(core.absolute(state.originalLeft)) + ", " +
      formatBigInt(core.absolute(state.originalRight)) + ") = НОД(" +
      formatBigInt(state.a) + ", " + formatBigInt(state.b) + ") = " +
      formatBigInt(state.originalGcd);
    elements.phaseComparison.textContent = describeCurrentPhase(state);

    elements.divisions.textContent = String(state.divisionCount);
    elements.subtractions.textContent = formatBigInt(state.subtractionCount);
    elements.bitLength.textContent = String(Math.max(
      core.bitLength(state.originalLeft),
      core.bitLength(state.originalRight)
    ));
    elements.result.textContent = state.finished
      ? formatBigInt(state.a)
      : "—";

    renderGeometry();
    renderComparison();
    renderTrace();
    renderControls();

    elements.status.textContent = state.finished
      ? "Готово: НОД найден за " + formatDivisionCount(state.divisionCount) + "."
      : "Инвариант проверен. Можно выполнить следующий переход.";
  }

  function renderEmpty() {
    elements.divisions.textContent = "0";
    elements.subtractions.textContent = "0";
    elements.bitLength.textContent = "—";
    elements.result.textContent = "—";
    elements.currentPair.textContent = "Введите два целых числа.";
    elements.currentRule.textContent = "Правило появится после применения входов.";
    elements.invariant.textContent = "НОД исходной пары = НОД текущей пары";
    elements.phaseComparison.textContent = "Сравнение появится после запуска.";
    elements.divisionTotal.textContent = "—";
    elements.subtractionTotal.textContent = "—";
    elements.divisionBar.style.width = "0";
    elements.subtractionBar.style.width = "0";
    elements.traceBody.replaceChildren();
    elements.geometry.replaceChildren();
    elements.geometryCaption.textContent = "";
    if (elements.transitionCaption) {
      elements.transitionCaption.textContent = "";
    }
    elements.status.textContent = "";
    renderControls();
  }

  function renderControls() {
    const finished = !state || state.finished;
    elements.step.disabled = finished || running;
    elements.auto.disabled = finished || running;
    elements.pause.disabled = !running;
    elements.reset.disabled = false;
  }

  function renderGeometry() {
    const transitioning = Boolean(transitionGeometry);
    const model = transitionGeometry || core.geometryModel(state);
    elements.geometry.replaceChildren();
    elements.geometry.setAttribute("viewBox", "0 0 720 360");
    elements.geometry.style.setProperty(
      "--euclid-motion-duration",
      controls.motionDurationMs(
        elements.speed.value,
        reducedMotion.matches
      ) + "ms"
    );
    const title = createSvg("title", {
      id: "euclid-geometry-svg-title",
    });
    title.textContent = "Геометрия текущего деления";
    const description = createSvg("desc", {
      id: "euclid-geometry-svg-description",
    });
    elements.geometry.append(title, description);
    elements.geometryDescription = description;
    elements.geometry.setAttribute(
      "aria-labelledby",
      "euclid-geometry-svg-title euclid-geometry-svg-description"
    );

    if (model.finished) {
      const size = 230;
      elements.geometry.appendChild(createSvg("rect", {
        x: "245",
        y: "55",
        width: String(size),
        height: String(size),
        class: "euclid-square",
      }));
      elements.geometry.appendChild(svgText(360, 180, "сторона = НОД", "middle"));
      elements.geometry.appendChild(svgText(
        360,
        210,
        formatBigInt(state.a),
        "middle",
        "is-muted"
      ));
      elements.geometryCaption.textContent =
        "Остался квадрат: его сторона равна общему делителю исходного прямоугольника.";
      setGeometryDescription(
        "Вычисление завершено. Показан квадрат со стороной " +
        formatBigInt(state.a) + ", равной наибольшему общему делителю."
      );
      if (elements.transitionCaption) {
        elements.transitionCaption.textContent = "";
      }
      return;
    }

    const useSchematic = model.schematic || model.squareFraction < 0.08;
    if (useSchematic) {
      renderSchematicGeometry(model);
    } else {
      renderExactGeometry(model);
    }
    elements.geometry.classList.toggle("is-transitioning", transitioning);
    if (transitioning) {
      const nextText =
        "Остаток r становится второй стороной следующего прямоугольника: (" +
        formatBigInt(model.nextPair.a) + ", " +
        formatBigInt(model.nextPair.b) + ").";
      if (elements.transitionCaption) {
        elements.transitionCaption.textContent = nextText;
      }
    } else if (elements.transitionCaption) {
      elements.transitionCaption.textContent = model.isSlowQuotient && badCaseMode
        ? "Здесь q = 1 — минимальный положительный частный. Поэтому остаток велик и пара уменьшается медленно."
        : "";
    }
    const scaleDescription = useSchematic
      ? "Линейный масштаб сжат. "
      : "Линейный масштаб точен. ";
    setGeometryDescription(
      scaleDescription + "Прямоугольник " + formatBigInt(model.a) +
      " на " + formatBigInt(model.b) + " содержит " +
      formatBigInt(model.quotient) +
      " одинаковых квадратов со стороной " + formatBigInt(model.b) +
      " и остаточный прямоугольник " +
      formatBigInt(model.remainder) + " на " + formatBigInt(model.b) + "."
    );
  }

  function renderExactGeometry(model) {
    const ratio = 1 / model.squareFraction;
    let width;
    let height;
    if (ratio <= 660 / 280) {
      height = 280;
      width = ratio * height;
    } else {
      width = 660;
      height = width / ratio;
    }
    const startX = (720 - width) / 2;
    const startY = (330 - height) / 2;
    const squareSize = height;

    elements.geometry.appendChild(createSvg("rect", {
      x: String(startX),
      y: String(startY),
      width: String(width),
      height: String(height),
      class: "euclid-rect",
    }));
    for (let index = 0; index < model.visibleSquareCount; index += 1) {
      elements.geometry.appendChild(createSvg("rect", {
        x: String(startX + index * squareSize),
        y: String(startY),
        width: String(squareSize),
        height: String(squareSize),
        class: "euclid-square euclid-q",
      }));
      elements.geometry.appendChild(svgText(
        startX + (index + 0.5) * squareSize,
        startY + squareSize / 2,
        "b",
        "middle"
      ));
    }
    if (model.remainder > 0n) {
      const remainderWidth = width * model.remainderFraction;
      elements.geometry.appendChild(createSvg("rect", {
        x: String(startX + model.visibleSquareCount * squareSize),
        y: String(startY),
        width: String(remainderWidth),
        height: String(height),
        class: "euclid-remainder euclid-r",
      }));
      elements.geometry.appendChild(svgText(
        startX + model.visibleSquareCount * squareSize + remainderWidth / 2,
        startY + height / 2,
        "r",
        "middle"
      ));
    }
    elements.geometry.appendChild(divisionFormula(model, 360, 335));
    elements.geometryCaption.textContent =
      geometryCaption(model, false);
  }

  function renderSchematicGeometry(model) {
    const startX = 45;
    const startY = 72;
    const squareSize = 150;
    const gap = 12;

    elements.geometry.appendChild(createSvg("rect", {
      x: "30",
      y: "55",
      width: "660",
      height: "185",
      class: "euclid-rect",
    }));
    for (let index = 0; index < 2; index += 1) {
      elements.geometry.appendChild(createSvg("rect", {
        x: String(startX + index * (squareSize + gap)),
        y: String(startY),
        width: String(squareSize),
        height: String(squareSize),
        class: "euclid-square euclid-q",
      }));
      elements.geometry.appendChild(svgText(
        startX + index * (squareSize + gap) + squareSize / 2,
        startY + 80,
        "b",
        "middle"
      ));
    }
    elements.geometry.appendChild(svgText(445, 155, "…", "middle", "euclid-q-text"));
    elements.geometry.appendChild(createSvg("path", {
      d: "M540 72 l12 18 -12 18 12 18 -12 18 12 18 -12 18",
      class: "euclid-break",
    }));
    elements.geometry.appendChild(createSvg("rect", {
      x: "570",
      y: "72",
      width: "95",
      height: "150",
      class: "euclid-remainder euclid-r",
    }));
    elements.geometry.appendChild(svgText(618, 155, "r", "middle"));
    elements.geometry.appendChild(divisionFormula(model, 360, 285));
    elements.geometry.appendChild(svgText(
      360,
      315,
      "схема не передаёт масштаб",
      "middle",
      "is-muted"
    ));
    elements.geometryCaption.textContent =
      geometryCaption(model, true);
  }

  function geometryCaption(model, schematic) {
    const base = schematic
      ? "Масштаб сжат: число квадратов q и остаток r подписаны точно."
      : "Каждый выделенный квадрат имеет сторону b; остаток r показан отдельным цветом.";
    if (badCaseMode && model.isSlowQuotient) {
      return base +
        " В паре Фибоначчи q = 1, поэтому остаток максимально велик для одного деления.";
    }
    return base;
  }

  function divisionFormula(model, x, y) {
    const text = createSvg("text", {
      x: String(x),
      y: String(y),
      "text-anchor": "middle",
      class: "is-muted euclid-division-formula",
    });
    appendTspan(text, formatBigInt(model.a) + " = ");
    appendTspan(text, formatBigInt(model.quotient), "euclid-q-text");
    appendTspan(text, " · " + formatBigInt(model.b) + " + ");
    appendTspan(text, formatBigInt(model.remainder), "euclid-r-text");
    return text;
  }

  function appendTspan(parent, value, className) {
    const span = createSvg("tspan", {
      class: className || "",
    });
    span.textContent = value;
    parent.appendChild(span);
    return span;
  }

  function renderComparison() {
    const divisions = BigInt(fullRun.divisionCount);
    const subtractions = fullRun.subtractionCount;
    elements.divisionTotal.textContent = formatBigInt(divisions) + " дел.";
    elements.subtractionTotal.textContent = formatBigInt(subtractions) + " выч.";

    const divisionLog = log10BigInt(divisions + 1n);
    const subtractionLog = log10BigInt(subtractions + 1n);
    const maximum = Math.max(divisionLog, subtractionLog, 1);
    elements.divisionBar.style.width =
      Math.max(4, divisionLog / maximum * 100).toFixed(2) + "%";
    elements.subtractionBar.style.width =
      Math.max(4, subtractionLog / maximum * 100).toFixed(2) + "%";
  }

  function renderTrace() {
    elements.traceBody.replaceChildren();
    let entries = trace;
    let omitted = 0;
    if (trace.length > TRACE_LIMIT) {
      omitted = trace.length - TRACE_LIMIT;
      entries = [trace[0]].concat(trace.slice(-(TRACE_LIMIT - 1)));
    }

    entries.forEach(function (entry, index) {
      if (index === 1 && omitted > 0) {
        const omittedRow = document.createElement("tr");
        omittedRow.className = "is-omitted";
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "… пропущено состояний: " + omitted + " …";
        omittedRow.appendChild(cell);
        elements.traceBody.appendChild(omittedRow);
      }
      elements.traceBody.appendChild(renderTraceRow(entry));
    });
  }

  function renderTraceRow(entry) {
    const row = document.createElement("tr");
    const quotient = entry.b === 0n ? null : entry.a / entry.b;
    const remainder = entry.b === 0n ? null : entry.a % entry.b;
    const values = [
      String(entry.stepNumber),
      formatBigInt(entry.a),
      formatBigInt(entry.b),
      quotient === null ? "—" : formatBigInt(quotient),
      remainder === null ? "—" : formatBigInt(remainder),
      formatBigInt(core.gcd(entry.a, entry.b)),
    ];
    values.forEach(function (value, index) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 3) {
        cell.className = "euclid-q-cell";
      } else if (index === 4) {
        cell.className = "euclid-r-cell";
      }
      row.appendChild(cell);
    });
    if (entry === state) {
      row.classList.add("is-current");
      row.setAttribute("aria-current", "step");
    }
    return row;
  }

  function describeNextRule(current) {
    if (current.finished) {
      return "b = 0: остановка. Текущее a и есть НОД.";
    }
    const quotient = current.a / current.b;
    const remainder = current.a % current.b;
    return formatBigInt(current.a) + " = " + formatBigInt(quotient) + " · " +
      formatBigInt(current.b) + " + " + formatBigInt(remainder) +
      ". Следующая пара: (" + formatBigInt(current.b) + ", " +
      formatBigInt(remainder) + ").";
  }

  function describeCurrentPhase(current) {
    if (current.finished) {
      return "Вычитания больше не нужны.";
    }
    const quotient = current.a / current.b;
    const remainder = current.a % current.b;
    const subtractions = remainder === 0n ? quotient - 1n : quotient;
    return "Одно деление с остатком сворачивает " + formatBigInt(subtractions) +
      " последовательных вычитаний.";
  }

  function formatBigInt(value) {
    const text = String(value);
    const sign = text.startsWith("-") ? "−" : "";
    const digits = sign ? text.slice(1) : text;
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function log10BigInt(value) {
    const text = value.toString();
    const leading = Number(text.slice(0, Math.min(15, text.length)));
    return text.length - 1 + Math.log10(leading) - (Math.min(15, text.length) - 1);
  }

  function formatDivisionCount(value) {
    const lastTwo = value % 100;
    const last = value % 10;
    let word = "делений";
    if (lastTwo < 11 || lastTwo > 14) {
      if (last === 1) {
        word = "деление";
      } else if (last >= 2 && last <= 4) {
        word = "деления";
      }
    }
    return value + " " + word;
  }

  function createSvg(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], entry[1]);
    });
    return element;
  }

  function svgText(x, y, text, anchor, className) {
    const element = createSvg("text", {
      x: String(x),
      y: String(y),
      "text-anchor": anchor || "start",
      class: className || "",
    });
    element.textContent = text;
    return element;
  }

  function setGeometryDescription(text) {
    if (elements.geometryDescription) {
      elements.geometryDescription.textContent = text;
    }
    elements.geometry.setAttribute("aria-label", text);
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function hideError() {
    elements.error.textContent = "";
    elements.error.hidden = true;
  }

  function disableControls() {
    [
      elements.apply,
      elements.step,
      elements.auto,
      elements.pause,
      elements.reset,
      elements.badCaseToggle,
      elements.speed,
      elements.fibonacciIndex,
    ].forEach(function (control) {
      control.disabled = true;
    });
  }

  init();
})();
