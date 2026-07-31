(function () {
  "use strict";

  const core = window.EgyptianMultiplicationCore;
  const controls = window.AtlasLabControlsCore;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const elements = {};
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  let state = null;
  let trace = [];
  let running = false;
  let autoTimer = null;
  let lastRenderedStep = null;

  function init() {
    cacheElements();
    if (!core || !controls) {
      showError("Не загрузилось вычислительное ядро лаборатории.");
      disableControls();
      return;
    }
    elements.form.addEventListener("submit", function (event) {
      event.preventDefault();
      startAutomatic();
    });
    elements.form.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || !event.target.matches("input")) {
        return;
      }
      event.preventDefault();
      resetToInputs();
    });
    elements.step.addEventListener("click", takeStep);
    elements.pause.addEventListener("click", function () {
      stopAutomatic("Выполнение приостановлено. Текущее состояние сохранено.");
    });
    elements.reset.addEventListener("click", resetToInputs);
    elements.speed.addEventListener("input", updateSpeedLabel);
    elements.left.addEventListener("input", clearRun);
    elements.right.addEventListener("input", clearRun);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) {
        stopAutomatic("Выполнение приостановлено, потому что вкладка стала неактивной.");
      }
    });
    updateSpeedLabel();
    resetToInputs();
  }

  function cacheElements() {
    elements.form = document.getElementById("egyptian-form");
    elements.left = document.getElementById("egyptian-left");
    elements.right = document.getElementById("egyptian-right");
    elements.step = document.getElementById("egyptian-step");
    elements.run = document.getElementById("egyptian-run");
    elements.pause = document.getElementById("egyptian-pause");
    elements.reset = document.getElementById("egyptian-reset");
    elements.speed = document.getElementById("egyptian-speed");
    elements.speedValue = document.getElementById("egyptian-speed-value");
    elements.error = document.getElementById("egyptian-error");
    elements.current = document.getElementById("egyptian-current-state");
    elements.rule = document.getElementById("egyptian-current-rule");
    elements.invariant = document.getElementById("egyptian-invariant");
    elements.result = document.getElementById("egyptian-result");
    elements.geometry = document.getElementById("egyptian-geometry");
    elements.geometryDescription = document.getElementById(
      "egyptian-geometry-description"
    );
    elements.geometryCaption = document.getElementById(
      "egyptian-geometry-caption"
    );
    elements.body = document.getElementById("egyptian-trace-body");
    elements.status = document.getElementById("egyptian-status");
  }

  function readInitialState() {
    const left = core.parseInteger(elements.left.value, "Первый множитель");
    const right = core.parseInteger(elements.right.value, "Второй множитель");
    return core.createState(left, right);
  }

  function resetToInputs() {
    stopAutomatic();
    try {
      state = readInitialState();
      trace = [state];
      lastRenderedStep = null;
      hideError();
      render();
    } catch (error) {
      state = null;
      trace = [];
      showError(error.message);
      renderEmpty();
    }
  }

  function ensureState() {
    if (!state) {
      state = readInitialState();
      trace = [state];
    }
  }

  function advanceOneStep() {
    if (!state || state.finished) {
      return false;
    }
    state = core.step(state);
    trace.push(state);
    render();
    return true;
  }

  function takeStep() {
    stopAutomatic();
    try {
      ensureState();
      hideError();
      if (!advanceOneStep()) {
        render();
      }
    } catch (error) {
      showError(error.message);
    }
  }

  function startAutomatic() {
    try {
      ensureState();
      hideError();
      if (state.finished || running) {
        render();
        return;
      }
      running = true;
      renderControls();
      elements.status.textContent =
        "Автоматическое выполнение запущено. Его можно приостановить.";
      scheduleAutomaticStep();
    } catch (error) {
      showError(error.message);
    }
  }

  function scheduleAutomaticStep() {
    if (!running) {
      return;
    }
    autoTimer = window.setTimeout(function () {
      autoTimer = null;
      if (!running) {
        return;
      }
      if (!advanceOneStep()) {
        stopAutomatic();
        return;
      }
      if (state.finished) {
        stopAutomatic();
        return;
      }
      scheduleAutomaticStep();
    }, speed().delayMs);
  }

  function stopAutomatic(message) {
    running = false;
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
    renderControls();
    if (message && elements.status) {
      elements.status.textContent = message;
    }
  }

  function clearRun() {
    stopAutomatic();
    state = null;
    trace = [];
    lastRenderedStep = null;
    hideError();
    renderEmpty();
  }

  function speed() {
    return controls.speedModel(elements.speed.value);
  }

  function updateSpeedLabel() {
    if (!controls || !elements.speed || !elements.speedValue) {
      return;
    }
    elements.speedValue.textContent = speed().label;
  }

  function render() {
    if (!state) {
      renderEmpty();
      return;
    }
    elements.body.replaceChildren();
    trace.forEach(function (entry) {
      elements.body.appendChild(renderRow(entry));
    });

    elements.current.textContent =
      "(a, b, c) = (" + formatBigInt(state.multiplier) + ", " +
      formatBigInt(state.multiplicand) + ", " +
      formatBigInt(state.accumulator) + ")";
    elements.rule.textContent = ruleDescription(core.nextRule(state));
    elements.invariant.textContent =
      formatBigInt(state.accumulator) + " + " +
      formatBigInt(state.multiplier) + " · " +
      formatBigInt(state.multiplicand) + " = " +
      formatBigInt(core.invariantValue(state)) + " = |" +
      formatBigInt(state.originalLeft) + " · " +
      formatBigInt(state.originalRight) + "|";

    const result = core.signedResult(state);
    if (result === null) {
      elements.result.textContent = "Результат появится при a = 0.";
      if (!running) {
        elements.status.textContent =
          "Выполнено шагов: " + state.stepNumber + ". Инвариант сохраняется.";
      }
    } else {
      elements.result.textContent =
        formatBigInt(state.originalLeft) + " · " +
        formatBigInt(state.originalRight) + " = " + formatBigInt(result);
      elements.status.textContent =
        "Процедура завершилась за " + state.stepNumber + " шагов.";
    }
    renderGeometry();
    renderControls();
  }

  function renderControls() {
    if (!elements.step) {
      return;
    }
    const finished = !state || state.finished;
    elements.step.disabled = finished || running;
    elements.run.disabled = finished || running;
    elements.pause.disabled = !running;
    elements.reset.disabled = false;
  }

  function renderEmpty() {
    elements.body.replaceChildren();
    elements.current.textContent = "Введите два целых числа.";
    elements.rule.textContent = "После запуска здесь появится применяемое правило.";
    elements.invariant.textContent = "c + a · b = |x · y|";
    elements.result.textContent = "Результат пока не вычислен.";
    elements.status.textContent = "";
    if (elements.geometry) {
      elements.geometry.replaceChildren();
    }
    if (elements.geometryCaption) {
      elements.geometryCaption.textContent = "";
    }
    renderControls();
  }

  function renderGeometry() {
    if (!elements.geometry) {
      return;
    }
    const model = core.geometryModel(state);
    elements.geometry.replaceChildren();
    elements.geometry.setAttribute("viewBox", "0 0 760 430");
    const title = appendSvg("title", {
      id: "egyptian-geometry-title",
    });
    title.textContent = "Сохранение площади при умножении";
    const description = appendSvg("desc", {
      id: "egyptian-geometry-description",
    });
    elements.geometryDescription = description;
    elements.geometry.setAttribute(
      "aria-labelledby",
      "egyptian-geometry-title egyptian-geometry-description"
    );
    elements.geometry.style.setProperty(
      "--egyptian-motion-duration",
      controls.motionDurationMs(elements.speed.value, reducedMotion.matches) + "ms"
    );

    renderInvariantBar(model);
    if (model.finished) {
      renderFinishedGeometry(model);
    } else if (model.exact) {
      renderExactGeometry(model);
    } else {
      renderSchematicGeometry(model);
    }

    const stepped = lastRenderedStep !== null &&
      lastRenderedStep !== state.stepNumber;
    elements.geometry.classList.toggle(
      "is-stepping",
      stepped && !reducedMotion.matches
    );
    if (stepped && !reducedMotion.matches) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          elements.geometry.classList.remove("is-stepping");
        });
      });
    }
    lastRenderedStep = state.stepNumber;
  }

  function renderInvariantBar(model) {
    const x = 55;
    const y = 30;
    const width = 650;
    const height = 34;
    appendSvg("rect", {
      x: x,
      y: y,
      width: width,
      height: height,
      class: "egyptian-area__outline",
    });
    const accumulatedWidth = width * model.accumulatorFraction;
    if (accumulatedWidth > 0) {
      appendSvg("rect", {
        x: x,
        y: y,
        width: accumulatedWidth,
        height: height,
        class: "egyptian-area__accumulated",
      });
    }
    const remainingWidth = width * model.remainingFraction;
    if (remainingWidth > 0) {
      appendSvg("rect", {
        x: x + accumulatedWidth,
        y: y,
        width: Math.min(remainingWidth, width - accumulatedWidth),
        height: height,
        class: "egyptian-area__remaining",
      });
    }
    appendText(
      380,
      21,
      "накоплено + осталось = |x · y| = " +
        formatCompact(model.targetArea),
      "middle",
      "egyptian-area__label"
    );
  }

  function renderFinishedGeometry(model) {
    appendSvg("rect", {
      x: 205,
      y: 125,
      width: 350,
      height: 190,
      class: "egyptian-area__accumulated",
    });
    appendText(380, 205, "вся площадь накоплена", "middle");
    appendText(
      380,
      240,
      "c = " + formatCompact(model.accumulatorAfter),
      "middle",
      "is-muted"
    );
    setGeometryDescription(
      "Вычисление завершено: оставшаяся площадь равна нулю, " +
      "а накопленная площадь равна модулю исходного произведения."
    );
    setGeometryCaption(
      "Оставшийся прямоугольник исчез: накопленная площадь равна |x · y|."
    );
  }

  function renderExactGeometry(model) {
    const beforeBox = fitRectangle(
      Number(model.before.width),
      Number(model.before.height),
      270,
      190
    );
    const afterBox = fitRectangle(
      Number(model.after.width),
      Number(model.after.height),
      270,
      190
    );
    const beforeX = 45 + (280 - beforeBox.width) / 2;
    const beforeY = 130 + (200 - beforeBox.height) / 2;
    const afterX = 440 + (280 - afterBox.width) / 2;
    const afterY = 130 + (200 - afterBox.height) / 2;

    renderCellRectangle(
      beforeX,
      beforeY,
      beforeBox.width,
      beforeBox.height,
      Number(model.before.width),
      Number(model.before.height),
      model.rule === "odd"
    );
    renderCellRectangle(
      afterX,
      afterY,
      afterBox.width,
      afterBox.height,
      Number(model.after.width),
      Number(model.after.height),
      false
    );
    renderTransformationLabels(model, beforeX, afterX);
    setGeometryDescription(
      model.rule === "odd"
        ? "Точная клеточная схема. Из прямоугольника " +
          formatBigInt(model.before.width) + " на " +
          formatBigInt(model.before.height) +
          " отделяется полоса площадью " +
          formatBigInt(model.extractedStrip) +
          ", после чего оставшаяся часть превращается в прямоугольник " +
          formatBigInt(model.after.width) + " на " +
          formatBigInt(model.after.height) + "."
        : "Точная клеточная схема. Прямоугольник " +
          formatBigInt(model.before.width) + " на " +
          formatBigInt(model.before.height) +
          " без изменения площади превращается в прямоугольник " +
          formatBigInt(model.after.width) + " на " +
          formatBigInt(model.after.height) + "."
    );
    setGeometryCaption(
      model.rule === "odd"
        ? "Клетки показаны точно: отделённая полоса b переходит в накопитель, оставшаяся площадь сохраняется."
        : "Клетки показаны точно: одну сторону делим пополам, другую удваиваем, площадь не меняется."
    );
  }

  function renderSchematicGeometry(model) {
    const beforeX = 60;
    const beforeY = 145;
    const beforeWidth = 250;
    const beforeHeight = 150;
    const afterX = 455;
    const afterY = 145;
    const afterWidth = 235;
    const afterHeight = 150;

    appendSvg("rect", {
      x: beforeX,
      y: beforeY,
      width: beforeWidth,
      height: beforeHeight,
      class: "egyptian-area__remaining",
    });
    if (model.rule === "odd") {
      appendSvg("rect", {
        x: beforeX + beforeWidth - 34,
        y: beforeY,
        width: 34,
        height: beforeHeight,
        class: "egyptian-area__strip",
      });
      appendText(
        beforeX + beforeWidth - 17,
        beforeY + beforeHeight / 2,
        "b",
        "middle"
      );
    }
    appendSvg("rect", {
      x: afterX,
      y: afterY,
      width: afterWidth,
      height: afterHeight,
      class: "egyptian-area__remaining",
    });
    renderTransformationLabels(model, beforeX, afterX);
    appendText(380, 365, "схема не передаёт линейный масштаб", "middle", "is-muted");
    setGeometryDescription(
      "Схематическое преобразование больших прямоугольников. Все подписи " +
      "площадей точны, но линейный масштаб сжат."
    );
    setGeometryCaption(
      "Размеры слишком велики для клеток: геометрия сжата, а площади и инвариант остаются точными."
    );
  }

  function renderTransformationLabels(model, beforeX, afterX) {
    appendText(
      beforeX + 125,
      115,
      "a × b = " + formatCompact(model.remainingBefore),
      "middle",
      "egyptian-area__label"
    );
    appendText(380, 205, "→", "middle", "egyptian-area__arrow");
    appendText(
      380,
      232,
      model.rule === "odd" ? "отделить b; затем a/2, 2b" : "a/2, 2b",
      "middle",
      "is-muted"
    );
    appendText(
      afterX + 117,
      115,
      "⌊a/2⌋ × 2b = " + formatCompact(model.remainingAfter),
      "middle",
      "egyptian-area__label"
    );
    if (model.rule === "odd") {
      appendText(
        380,
        330,
        "c' = c + b = " + formatCompact(model.accumulatorAfter),
        "middle",
        "egyptian-area__strip-label"
      );
    } else {
      appendText(
        380,
        330,
        "c не меняется: " + formatCompact(model.accumulatorAfter),
        "middle",
        "is-muted"
      );
    }
  }

  function renderCellRectangle(
    x,
    y,
    width,
    height,
    columns,
    rows,
    highlightLastColumn
  ) {
    const cellWidth = columns === 0 ? width : width / columns;
    const cellHeight = rows === 0 ? height : height / rows;
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        appendSvg("rect", {
          x: x + column * cellWidth,
          y: y + row * cellHeight,
          width: cellWidth,
          height: cellHeight,
          class: highlightLastColumn && column === columns - 1
            ? "egyptian-area__cell is-strip"
            : "egyptian-area__cell",
        });
      }
    }
  }

  function fitRectangle(width, height, maximumWidth, maximumHeight) {
    if (width === 0 || height === 0) {
      return { width: 0, height: 0 };
    }
    const scale = Math.min(maximumWidth / width, maximumHeight / height);
    return {
      width: Math.max(width * scale, 1),
      height: Math.max(height * scale, 1),
    };
  }

  function setGeometryDescription(text) {
    if (elements.geometryDescription) {
      elements.geometryDescription.textContent = text;
    }
    elements.geometry.setAttribute("aria-label", text);
  }

  function setGeometryCaption(text) {
    if (elements.geometryCaption) {
      elements.geometryCaption.textContent = text;
    }
  }

  function renderRow(entry) {
    const row = document.createElement("tr");
    [
      String(entry.stepNumber),
      formatBigInt(entry.multiplier),
      formatBigInt(entry.multiplicand),
      formatBigInt(entry.accumulator),
      traceRuleLabel(entry.lastRule),
    ].forEach(function (value) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    if (entry === state) {
      row.classList.add("is-current");
      row.setAttribute("aria-current", "step");
    }
    return row;
  }

  function traceRuleLabel(rule) {
    if (rule === "initial") {
      return "начало";
    }
    if (rule === "odd") {
      return "a нечётно: прибавили b";
    }
    return "a чётно: только сдвиг";
  }

  function ruleDescription(rule) {
    if (rule === "halt") {
      return "a = 0: остановка, накопитель c уже равен модулю произведения.";
    }
    if (rule === "odd") {
      return "a нечётно: добавить b к c, затем заменить a на ⌊a/2⌋, а b на 2b.";
    }
    return "a чётно: заменить a на a/2, а b на 2b; накопитель c не менять.";
  }

  function formatBigInt(value) {
    const text = String(value);
    const negative = text.startsWith("-");
    const digits = negative ? text.slice(1) : text;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (negative ? "−" : "") + grouped;
  }

  function formatCompact(value) {
    const text = String(value);
    const negative = text.startsWith("-");
    const digits = negative ? text.slice(1) : text;
    if (digits.length <= 15) {
      return formatBigInt(value);
    }
    return (negative ? "−" : "") + digits[0] + "," +
      digits.slice(1, 4) + " × 10^" + (digits.length - 1);
  }

  function appendSvg(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    elements.geometry.appendChild(element);
    return element;
  }

  function appendText(x, y, text, anchor, className) {
    const element = appendSvg("text", {
      x: x,
      y: y,
      "text-anchor": anchor || "start",
      class: className || "",
    });
    element.textContent = text;
    return element;
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function hideError() {
    elements.error.hidden = true;
    elements.error.textContent = "";
  }

  function disableControls() {
    [
      elements.step,
      elements.run,
      elements.pause,
      elements.reset,
      elements.speed,
    ].forEach(function (control) {
      if (control) {
        control.disabled = true;
      }
    });
  }

  init();
})();
