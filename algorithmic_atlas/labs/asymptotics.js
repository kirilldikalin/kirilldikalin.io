(function () {
  "use strict";

  const core = window.AsymptoticsCore;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PLOT = Object.freeze({
    left: 66,
    right: 798,
    top: 28,
    bottom: 390,
  });
  const RATIO = Object.freeze({
    left: 66,
    right: 798,
    top: 20,
    bottom: 132,
  });
  const elements = {};
  let sample = null;
  let currentPoint = null;

  function init() {
    cacheElements();
    if (!core) {
      showError("Не загрузилось вычислительное ядро лаборатории.");
      disableControls();
      return;
    }

    populateScenarios();
    elements.modeInputs.forEach(function (input) {
      input.addEventListener("change", applyModeDefaults);
    });
    elements.form.addEventListener("submit", function (event) {
      event.preventDefault();
      render();
    });
    [
      elements.scenario,
      elements.relation,
      elements.constant,
      elements.n0,
      elements.scale,
    ].forEach(function (control) {
      control.addEventListener("change", render);
    });
    elements.range.addEventListener("input", render);
    elements.point.addEventListener("input", function () {
      renderPoint();
      renderPlot();
      renderRatio();
    });

    elements.scenario.value = "quadratic-polynomial-vs-square";
    elements.relation.value = "Theta";
    elements.constant.value = "15";
    elements.n0.value = "1";
    render();
  }

  function cacheElements() {
    elements.root = document.getElementById("asymptotics-lab");
    elements.modeInputs = Array.from(document.querySelectorAll(
      'input[name="asymptotics-mode"]'
    ));
    elements.form = document.getElementById("asymptotics-form");
    elements.scenario = document.getElementById("asymptotics-scenario");
    elements.relation = document.getElementById("asymptotics-relation");
    elements.constant = document.getElementById("asymptotics-c");
    elements.n0 = document.getElementById("asymptotics-n0");
    elements.scale = document.getElementById("asymptotics-scale");
    elements.range = document.getElementById("asymptotics-range");
    elements.rangeOutput = document.getElementById("asymptotics-range-output");
    elements.check = document.getElementById("asymptotics-check");
    elements.error = document.getElementById("asymptotics-error");
    elements.plot = document.getElementById("asymptotics-plot");
    elements.plotDescription = document.getElementById(
      "asymptotics-plot-description"
    );
    elements.point = document.getElementById("asymptotics-point");
    elements.pointOutput = document.getElementById("asymptotics-point-output");
    elements.pointValues = document.getElementById("asymptotics-point-values");
    elements.pointInequality = document.getElementById(
      "asymptotics-point-inequality"
    );
    elements.ratio = document.getElementById("asymptotics-ratio");
    elements.ratioDescription = document.getElementById(
      "asymptotics-ratio-description"
    );
    elements.verdict = document.querySelector(".asymptotics-verdict");
    elements.status = document.getElementById("asymptotics-status");
    elements.finiteNote = document.getElementById("asymptotics-finite-note");
    elements.proofSteps = document.getElementById("asymptotics-proof-steps");
  }

  function selectedMode() {
    const input = elements.modeInputs.find(function (candidate) {
      return candidate.checked;
    });
    return input ? input.value : "witness";
  }

  function populateScenarios() {
    elements.scenario.replaceChildren();
    core.SCENARIOS.forEach(function (scenario) {
      const option = document.createElement("option");
      option.value = scenario.id;
      option.textContent = scenario.prompt;
      elements.scenario.appendChild(option);
    });
  }

  function applyModeDefaults() {
    if (selectedMode() === "counterexample") {
      elements.scenario.value = "square-vs-linear";
      elements.relation.value = "O";
      elements.constant.value = "1";
      elements.n0.value = "1";
      elements.check.textContent = "Найти нарушение";
    } else {
      elements.scenario.value = "quadratic-polynomial-vs-square";
      elements.relation.value = "Theta";
      elements.constant.value = "15";
      elements.n0.value = "1";
      elements.check.textContent = "Проверить параметры";
    }
    render();
  }

  function readModel() {
    const maximumN = Number(elements.range.value);
    const scenario = core.getScenario(elements.scenario.value);
    const minimumN = Number(scenario.minimumN);
    const constantText = elements.constant.value.trim();
    const n0Text = elements.n0.value.trim();
    if (!constantText) {
      throw new Error("Введите положительную константу c.");
    }
    if (!n0Text) {
      throw new Error("Введите целый порог n₀.");
    }
    const constant = Number(constantText);
    const n0 = Number(n0Text);
    if (!Number.isFinite(constant) || constant <= 0 || constant > 1000000) {
      throw new Error("Константа c должна быть больше нуля и не больше 1 000 000.");
    }
    if (!Number.isSafeInteger(n0) || n0 < minimumN || n0 > 1000000) {
      throw new Error(
        "Порог n₀ должен быть целым числом от " +
        grouped(minimumN) + " до 1 000 000."
      );
    }
    const safeMaximum = Math.max(minimumN, maximumN);
    const point = Math.max(
      minimumN,
      Math.min(Number(elements.point.value), safeMaximum)
    );
    return {
      scenario: scenario,
      relationId: elements.relation.value,
      constant: constant,
      n0: n0,
      maximumN: safeMaximum,
      scale: elements.scale.value,
      point: point,
    };
  }

  function render() {
    try {
      const model = readModel();
      sample = core.sampleWindow(model.scenario.id, {
        maximumN: model.maximumN,
        count: 53,
        constant: model.constant,
        n0: model.n0,
        relationId: model.relationId,
        scale: model.scale,
      });
      elements.rangeOutput.textContent = grouped(model.maximumN);
      elements.point.min = String(sample.minimumN);
      elements.point.max = String(sample.maximumN);
      const nextPoint = Math.max(
        sample.minimumN,
        Math.min(Number(elements.point.value), sample.maximumN)
      );
      elements.point.value = String(nextPoint);
      hideError();
      renderPoint();
      renderPlot();
      renderRatio();
      renderVerdict(model);
    } catch (error) {
      sample = null;
      currentPoint = null;
      clearVisuals();
      showError(error.message);
    }
  }

  function clearVisuals() {
    [
      [elements.plot, elements.plotDescription, "График не построен из-за ошибки ввода"],
      [elements.ratio, elements.ratioDescription, "Отношение не построено из-за ошибки ввода"],
    ].forEach(function (entry) {
      const svg = entry[0];
      const description = entry[1];
      const title = svg.querySelector("title");
      svg.replaceChildren();
      if (title) {
        svg.appendChild(title);
      }
      svg.appendChild(description);
      description.textContent = entry[2];
    });
    elements.pointValues.textContent = "";
    elements.pointInequality.textContent = "";
    elements.proofSteps.replaceChildren();
    elements.status.textContent = "";
    elements.verdict.classList.remove("is-proved", "is-counterexample");
  }

  function renderPoint() {
    if (!sample) {
      return;
    }
    const model = readModel();
    currentPoint = core.evaluatePoint(
      model.scenario.id,
      model.point,
      model.constant,
      model.relationId
    );
    elements.pointOutput.textContent = grouped(currentPoint.n);
    elements.pointValues.textContent =
      "n=" + currentPoint.nLabel +
      "; f(n)=" + currentPoint.fLabel +
      "; g(n)=" + currentPoint.gLabel +
      "; f(n)/g(n)=" + currentPoint.ratioLabel;
    elements.pointInequality.className = currentPoint.satisfies
      ? "is-valid"
      : "is-invalid";
    elements.pointInequality.textContent =
      inequalityText(currentPoint, model.relationId, model.constant) +
      (currentPoint.satisfies ? " — выполняется" : " — нарушено");
  }

  function inequalityText(point, relationId, constant) {
    const c = compactNumber(constant);
    if (relationId === "O" || relationId === "o") {
      return point.fLabel + (relationId === "o" ? " < " : " ≤ ") +
        c + "·g(n) = " + point.boundLabel;
    }
    if (relationId === "Omega" || relationId === "omega") {
      return point.fLabel + (relationId === "omega" ? " > " : " ≥ ") +
        c + "·g(n) = " + point.boundLabel;
    }
    return point.lowerBoundLabel + " = g(n)/" + c +
      " ≤ " + point.fLabel + " ≤ " + c + "·g(n) = " + point.boundLabel;
  }

  function renderPlot() {
    if (!sample || !currentPoint) {
      return;
    }
    const svg = elements.plot;
    const title = svg.querySelector("title");
    const description = elements.plotDescription;
    svg.replaceChildren(title, description);

    appendGrid(svg, PLOT, 5, 6);
    appendTail(svg);
    appendViolationBands(svg);
    appendPath(svg, sample.points, "fShare", "asymptotics-line is-f", PLOT);
    appendPath(svg, sample.points, "gShare", "asymptotics-line is-g", PLOT);
    appendPath(
      svg,
      sample.points,
      "boundShare",
      "asymptotics-line is-bound",
      PLOT
    );
    if (sample.relationId === "Theta") {
      appendPath(
        svg,
        sample.points,
        "lowerBoundShare",
        "asymptotics-line is-bound is-lower-bound",
        PLOT
      );
    }
    appendViolationPoints(svg);
    appendSelectedPoint(svg);
    appendAxisLabels(svg);

    const violations = sample.points.filter(function (point) {
      return point.violation;
    }).length;
    description.textContent =
      "Сравнение функций на конечном диапазоне от " +
      grouped(sample.minimumN) + " до " + grouped(sample.maximumN) +
      ". В видимых точках хвоста нарушений: " + violations +
      ". Масштаб: " + (sample.scale === "log" ? "логарифмический" : "линейный") +
      ". Этот график не является доказательством.";
  }

  function appendGrid(svg, box, rows, columns) {
    for (let row = 0; row <= rows; row += 1) {
      const y = box.top + (box.bottom - box.top) * row / rows;
      svg.appendChild(createSvg("line", {
        x1: box.left,
        x2: box.right,
        y1: y,
        y2: y,
        class: "asymptotics-grid",
      }));
    }
    for (let column = 0; column <= columns; column += 1) {
      const x = box.left + (box.right - box.left) * column / columns;
      svg.appendChild(createSvg("line", {
        x1: x,
        x2: x,
        y1: box.top,
        y2: box.bottom,
        class: "asymptotics-grid",
      }));
    }
    svg.appendChild(createSvg("line", {
      x1: box.left,
      x2: box.right,
      y1: box.bottom,
      y2: box.bottom,
      class: "asymptotics-axis",
    }));
    svg.appendChild(createSvg("line", {
      x1: box.left,
      x2: box.left,
      y1: box.top,
      y2: box.bottom,
      class: "asymptotics-axis",
    }));
  }

  function xShareForN(n) {
    if (!sample || sample.maximumN === sample.minimumN) {
      return 0.5;
    }
    if (sample.scale === "log") {
      return clamp(
        (Math.log10(n) - Math.log10(sample.minimumN)) /
        (Math.log10(sample.maximumN) - Math.log10(sample.minimumN))
      );
    }
    return clamp(
      (n - sample.minimumN) / (sample.maximumN - sample.minimumN)
    );
  }

  function yShareForLog(logValue) {
    if (!sample || sample.maximumLog === sample.minimumLog) {
      return 0.5;
    }
    if (sample.scale === "log") {
      return clamp(
        (logValue - sample.minimumLog) /
        (sample.maximumLog - sample.minimumLog)
      );
    }
    return clamp(Math.pow(10, logValue - sample.maximumLog));
  }

  function appendTail(svg) {
    const start = sample.n0 > sample.maximumN
      ? PLOT.right
      : plotX(xShareForN(Math.max(sample.n0, sample.minimumN)), PLOT);
    svg.insertBefore(createSvg("rect", {
      x: start,
      y: PLOT.top,
      width: Math.max(0, PLOT.right - start),
      height: PLOT.bottom - PLOT.top,
      class: "asymptotics-tail",
    }), svg.firstChild);
    svg.appendChild(createSvg("line", {
      x1: start,
      x2: start,
      y1: PLOT.top,
      y2: PLOT.bottom,
      class: "asymptotics-threshold",
    }));
    appendText(
      svg,
      Math.min(PLOT.right - 4, start + 6),
      PLOT.top + 16,
      "n₀=" + grouped(sample.n0),
      "start",
      "asymptotics-label is-strong"
    );
  }

  function appendViolationBands(svg) {
    const points = sample.points;
    points.forEach(function (point, index) {
      if (!point.violation) {
        return;
      }
      const leftShare = index === 0
        ? point.xShare
        : (points[index - 1].xShare + point.xShare) / 2;
      const rightShare = index === points.length - 1
        ? point.xShare
        : (point.xShare + points[index + 1].xShare) / 2;
      svg.appendChild(createSvg("rect", {
        x: plotX(leftShare, PLOT),
        y: PLOT.top,
        width: Math.max(3, plotX(rightShare, PLOT) - plotX(leftShare, PLOT)),
        height: PLOT.bottom - PLOT.top,
        class: "asymptotics-violation-band",
      }));
    });
  }

  function appendViolationPoints(svg) {
    sample.points.filter(function (point) {
      return point.violation;
    }).forEach(function (point) {
      svg.appendChild(createSvg("circle", {
        cx: plotX(point.xShare, PLOT),
        cy: plotY(point.fShare, PLOT),
        r: 4.5,
        class: "asymptotics-violation-point",
      }));
    });
  }

  function appendSelectedPoint(svg) {
    const xShare = xShareForN(currentPoint.n);
    const x = plotX(xShare, PLOT);
    const y = plotY(yShareForLog(currentPoint.log10F), PLOT);
    svg.appendChild(createSvg("line", {
      x1: x,
      x2: x,
      y1: PLOT.top,
      y2: PLOT.bottom,
      class: "asymptotics-selected-line",
    }));
    svg.appendChild(createSvg("circle", {
      cx: x,
      cy: y,
      r: 6,
      class: "asymptotics-selected-point",
    }));
  }

  function appendAxisLabels(svg) {
    appendText(
      svg,
      PLOT.left,
      PLOT.bottom + 25,
      "n=" + grouped(sample.minimumN),
      "start",
      "asymptotics-label"
    );
    appendText(
      svg,
      PLOT.right,
      PLOT.bottom + 25,
      "n=" + grouped(sample.maximumN),
      "end",
      "asymptotics-label"
    );
    appendText(
      svg,
      PLOT.left,
      PLOT.top - 9,
      sample.scale === "log"
        ? "вертикаль: log₁₀ значения"
        : "вертикаль: доля от видимого максимума",
      "start",
      "asymptotics-label"
    );
  }

  function renderRatio() {
    if (!sample || !currentPoint) {
      return;
    }
    const svg = elements.ratio;
    const description = elements.ratioDescription;
    svg.replaceChildren(description);
    appendGrid(svg, RATIO, 3, 6);

    const logC = Math.log10(sample.constant);
    const ratioValues = sample.points.map(function (point) {
      return point.log10Ratio;
    }).concat([logC]);
    if (sample.relationId === "Theta") {
      ratioValues.push(-logC);
    }
    const minimum = Math.min.apply(null, ratioValues);
    const maximum = Math.max.apply(null, ratioValues);
    const span = maximum - minimum || 1;

    function ratioShare(value) {
      return clamp((value - minimum) / span);
    }

    const ratioPoints = sample.points.map(function (point) {
      return {
        xShare: point.xShare,
        ratioShare: ratioShare(point.log10Ratio),
      };
    });
    appendPath(
      svg,
      ratioPoints,
      "ratioShare",
      "asymptotics-line is-f",
      RATIO
    );
    appendHorizontalBound(svg, ratioShare(logC), "c", RATIO);
    if (sample.relationId === "Theta") {
      appendHorizontalBound(svg, ratioShare(-logC), "1/c", RATIO);
    }

    const x = plotX(xShareForN(currentPoint.n), RATIO);
    const y = plotY(ratioShare(currentPoint.log10Ratio), RATIO);
    svg.appendChild(createSvg("circle", {
      cx: x,
      cy: y,
      r: 5,
      class: "asymptotics-selected-point",
    }));
    description.textContent =
      "Отношение f к g на конечном диапазоне. Выбранное значение n=" +
      grouped(currentPoint.n) + ", отношение " + currentPoint.ratioLabel + ".";
  }

  function appendHorizontalBound(svg, share, label, box) {
    const y = plotY(share, box);
    svg.appendChild(createSvg("line", {
      x1: box.left,
      x2: box.right,
      y1: y,
      y2: y,
      class: "asymptotics-line is-bound",
    }));
    appendText(
      svg,
      box.right - 4,
      Math.max(box.top + 13, y - 5),
      label,
      "end",
      "asymptotics-label is-strong"
    );
  }

  function renderVerdict(model) {
    elements.verdict.classList.remove("is-proved", "is-counterexample");
    elements.proofSteps.replaceChildren();
    elements.finiteNote.textContent = sample.warning;

    if (selectedMode() === "counterexample") {
      const result = core.findCounterexample(
        model.scenario.id,
        model.relationId,
        model.constant,
        model.n0
      );
      if (result.found) {
        elements.verdict.classList.add("is-counterexample");
        elements.status.textContent = result.relationHolds
          ? "Найдена точка n=" + grouped(result.n) +
            ", которая отвергает выбранные c и n₀. Само асимптотическое " +
            "отношение остаётся истинным с другим свидетелем."
          : "Точка n=" + grouped(result.n) +
            " отвергает выбранные c и n₀. Само отношение опровергает отдельный " +
            "аналитический аргумент, а не одна точка.";
        if (result.n <= sample.maximumN) {
          elements.point.value = String(result.n);
          renderPoint();
          renderPlot();
          renderRatio();
        }
        appendSteps([
          "Выбранная пара требует неравенство в каждой точке хвоста n≥n₀.",
          "Проверена точка n=" + grouped(result.n) + ", не меньшая n₀.",
          result.reason,
        ].concat(
          evidenceStrings(result.analyticRefutation || result.evidence),
          result.relationHolds
            ? ["Вывод: эта точка отвергает только выбранную пару, а не отношение."]
            : ["Вывод: численная точка отвергает пару; семейство нарушений отвергает отношение."]
        ));
      } else {
        if (!result.relationHolds) {
          elements.verdict.classList.add("is-counterexample");
        }
        elements.status.textContent = result.reason;
        appendSteps(
          evidenceStrings(result.analyticRefutation || result.evidence).concat(
            result.selectedConstantBenign
              ? ["Отсутствие нарушения для одного c не выполняет требование «для любого c>0»."]
              : []
          )
        );
      }
      return;
    }

    const result = core.checkWitness(
      model.scenario.id,
      model.relationId,
      model.constant,
      model.n0
    );
    if (result.relationHolds && result.witnessValid) {
      elements.verdict.classList.add("is-proved");
      elements.status.textContent =
        "Параметры согласованы с аналитическим доказательством для всего хвоста. " +
        result.interpretation;
    } else if (result.relationHolds) {
      elements.status.textContent =
        "Само отношение истинно, но выбранные c и n₀ ещё не являются достаточным свидетелем. " +
        result.interpretation;
    } else {
      elements.verdict.classList.add("is-counterexample");
      elements.status.textContent =
        "Утверждение ложно. Совпадение на конечном графике не может дать ему статус «доказано».";
    }
    appendSteps(result.steps);
  }

  function evidenceStrings(evidence) {
    if (!evidence || typeof evidence !== "object") {
      return [];
    }
    const labels = {
      choose: "Для произвольных кандидатов выбираем ",
      inequality: "Получаем ",
      ratio: "Рассматриваем отношение ",
      sequence: "Используем подпоследовательность ",
      limit: "Её предельное поведение: ",
      failedConstant: "Нарушающий масштаб: ",
      monotonicity: "",
      quantifier: "",
      explanation: "",
      c: "Подходящая константа: c=",
      n0: "Подходящий порог: n₀=",
      lowerC: "Нижняя константа: c₁=",
      upperC: "Верхняя константа: c₂=",
    };
    return Object.entries(evidence).flatMap(function (entry) {
      const key = entry[0];
      const value = entry[1];
      if (typeof value !== "string" || !(key in labels)) {
        return [];
      }
      const text = labels[key] + value;
      return [/[.!?…]$/.test(text) ? text : text + "."];
    });
  }

  function appendSteps(steps) {
    elements.proofSteps.replaceChildren();
    steps.filter(Boolean).forEach(function (step) {
      const item = document.createElement("li");
      item.textContent = step;
      elements.proofSteps.appendChild(item);
    });
  }

  function appendPath(svg, points, shareKey, className, box) {
    const usable = points.filter(function (point) {
      return Number.isFinite(point.xShare) && Number.isFinite(point[shareKey]);
    });
    if (usable.length === 0) {
      return;
    }
    const path = usable.map(function (point, index) {
      const command = index === 0 ? "M" : "L";
      return command + plotX(point.xShare, box).toFixed(2) + " " +
        plotY(point[shareKey], box).toFixed(2);
    }).join(" ");
    svg.appendChild(createSvg("path", {
      d: path,
      class: className,
    }));
  }

  function appendText(svg, x, y, text, anchor, className) {
    const node = createSvg("text", {
      x: x,
      y: y,
      "text-anchor": anchor,
      class: className,
    });
    node.textContent = text;
    svg.appendChild(node);
  }

  function createSvg(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    return element;
  }

  function plotX(share, box) {
    return box.left + clamp(share) * (box.right - box.left);
  }

  function plotY(share, box) {
    return box.bottom - clamp(share) * (box.bottom - box.top);
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function grouped(value) {
    return new Intl.NumberFormat("ru-RU").format(value);
  }

  function compactNumber(value) {
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 4,
    }).format(value);
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
    Array.from(elements.root.querySelectorAll("button, input, select")).forEach(
      function (control) {
        control.disabled = true;
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
