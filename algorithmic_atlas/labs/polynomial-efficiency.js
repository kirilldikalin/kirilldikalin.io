(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.PolynomialEfficiencyCore;
  runtime.boot("polynomial-efficiency", function (root) {
    const shell = runtime.createShell(root, {
      title: "Теория и экспериментальная модель",
      description: "Сравните асимптотические функции, константы и штраф за выход рабочего набора из кэша",
    });
    const options = core.ALGORITHMS.map(function (item) { return '<option value="' + item.id + '">' + item.label + "</option>"; }).join("");
    shell.controls.innerHTML =
      '<label>Алгоритм A<select data-lab-field="left">' + options + "</select></label>" +
      '<label>Алгоритм B<select data-lab-field="right">' + options + "</select></label>" +
      '<label>Максимальное n<input data-lab-field="maximum" type="range" min="100" max="1000000" step="100" value="100000"><output data-output="maximum"></output></label>' +
      '<label>Константа A<input data-lab-field="left-c" type="number" min="0.01" max="1000000" step="0.1" value="1"></label>' +
      '<label>Константа B<input data-lab-field="right-c" type="number" min="0.01" max="1000000" step="0.1" value="40"></label>' +
      '<label>Объектов в кэше<input data-lab-field="cache" type="number" min="1" max="1000000000" value="4096"></label>' +
      '<label>Шкала<select data-lab-field="scale"><option value="log">логарифмическая</option><option value="linear">линейная</option></select></label>';
    const fields = {};
    ["left","right","maximum","left-c","right-c","cache","scale"].forEach(function (name) { fields[name] = shell.controls.querySelector('[data-lab-field="' + name + '"]'); });
    fields.left.value = "quadratic"; fields.right.value = "n-log-n";
    const maximumOutput = shell.controls.querySelector('[data-output="maximum"]');
    const figure = runtime.createFigure(shell.workspace, { id: "polynomial-efficiency-visual", title: "Кривые стоимости", viewBox: "0 0 820 460" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Точка пересечения теории</h4><p data-theory></p><h4>Точка пересечения модели</h4><p data-experiment></p><h4>Выбранное n</h4><p data-point></p><p class="atlas-lab__note is-warning" data-warning></p>';
    shell.workspace.appendChild(panel);
    const theory = panel.querySelector("[data-theory]"); const experiment = panel.querySelector("[data-experiment]"); const pointText = panel.querySelector("[data-point]"); const warning = panel.querySelector("[data-warning]");
    function createState() {
      maximumOutput.textContent = Number(fields.maximum.value).toLocaleString("ru-RU");
      return core.createState({ leftId: fields.left.value, rightId: fields.right.value, maximumN: Number(fields.maximum.value), leftConstant: Number(fields["left-c"].value), rightConstant: Number(fields["right-c"].value), cacheItems: Number(fields.cache.value), memoryPenalty: 1.8, vectorFactor: 1, scale: fields.scale.value });
    }
    function crossingText(value) { return value ? (value.exact ? "n=" : "примерно n=") + value.n.toLocaleString("ru-RU") : "В показанном диапазоне пересечения нет"; }
    function render(state) {
      const model = state.model; const svg = figure.svg; const box = { left: 62, right: 790, top: 28, bottom: 395 };
      drawing.clear(svg, "Теоретическая и экспериментальная стоимость", "Четыре кривые и граница кэша");
      const cacheShare = model.scale === "log" ? (Math.log10(model.cacheItems) - Math.log10(model.minimumN)) / (Math.log10(model.maximumN) - Math.log10(model.minimumN)) : (model.cacheItems - model.minimumN) / (model.maximumN - model.minimumN);
      if (cacheShare > 0 && cacheShare < 1) {
        const x = box.left + cacheShare * (box.right - box.left); drawing.append(svg, "rect", { x: x, y: box.top, width: box.right - x, height: box.bottom - box.top, class: "polynomial-cache-zone" }); drawing.append(svg, "line", { x1: x, x2: x, y1: box.top, y2: box.bottom, class: "polynomial-cache-line" });
      }
      const series = [["leftTheoryShare","is-series-0 is-theoretical"],["leftExperimentShare","is-series-0 is-experimental"],["rightTheoryShare","is-series-1 is-theoretical"],["rightExperimentShare","is-series-1 is-experimental"]];
      series.forEach(function (entry) { drawing.append(svg, "path", { d: drawing.pathFromPoints(model.points, function (p) { return box.left + p.xShare * (box.right - box.left); }, function (p) { return box.bottom - p[entry[0]] * (box.bottom - box.top); }), class: "polynomial-line " + entry[1] }); });
      [model.theoryCrossing, model.experimentCrossing].forEach(function (crossing) { if (!crossing) return; const share = model.scale === "log" ? (Math.log10(crossing.n) - Math.log10(model.minimumN)) / (Math.log10(model.maximumN) - Math.log10(model.minimumN)) : (crossing.n - model.minimumN) / (model.maximumN - model.minimumN); const x = box.left + share * (box.right - box.left); drawing.append(svg, "line", { x1: x, x2: x, y1: box.top, y2: box.bottom, class: "polynomial-crossover" }); });
      const current = model.points[state.pointIndex]; const selectedX = box.left + current.xShare * (box.right - box.left); drawing.append(svg, "line", { x1: selectedX, x2: selectedX, y1: box.top, y2: box.bottom, class: "polynomial-selected" });
      drawing.append(svg, "line", { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, class: "atlas-lab__axis" });
      theory.textContent = crossingText(model.theoryCrossing); experiment.textContent = crossingText(model.experimentCrossing);
      pointText.textContent = "n=" + current.n.toLocaleString("ru-RU") + "; теория A≈10^" + current.leftTheory.toFixed(2) + ", B≈10^" + current.rightTheory.toFixed(2) + "; модель A≈10^" + current.leftExperiment.toFixed(2) + ", B≈10^" + current.rightExperiment.toFixed(2);
      warning.textContent = model.warning;
      figure.caption.textContent = "Пунктир — математическая функция; сплошная линия — детерминированная модель констант и памяти";
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 96,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); fields.maximum.addEventListener("input", function () { api.reset(); }); },
    });
  });
})();
