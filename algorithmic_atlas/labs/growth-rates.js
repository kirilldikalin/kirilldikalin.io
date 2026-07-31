(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.GrowthRatesCore;

  runtime.boot("growth-rates", function (root) {
    const shell = runtime.createShell(root, {
      title: "Гонка функций",
      description: "Сравните геометрию роста на конечном диапазоне и найдите практические точки пересечения",
    });
    const functionOptions = core.FUNCTIONS.map(function (item) {
      return '<option value="' + item.id + '">' + item.label + "</option>";
    }).join("");
    shell.controls.innerHTML =
      '<label>Первая функция<select data-lab-field="left">' + functionOptions + "</select></label>" +
      '<label>Вторая функция<select data-lab-field="right">' + functionOptions + "</select></label>" +
      '<label>Максимальное n<input data-lab-field="maximum" type="range" min="10" max="1000000" step="10" value="10000"><output data-lab-output="maximum"></output></label>' +
      '<label>Ось n<select data-lab-field="x-scale"><option value="linear">линейная</option><option value="log" selected>логарифмическая</option></select></label>' +
      '<label>Ось значения<select data-lab-field="y-scale"><option value="linear">линейная</option><option value="log" selected>логарифмическая</option></select></label>';
    const left = shell.controls.querySelector('[data-lab-field="left"]');
    const right = shell.controls.querySelector('[data-lab-field="right"]');
    left.value = "square";
    right.value = "n-log-n";
    const maximum = shell.controls.querySelector('[data-lab-field="maximum"]');
    const maximumOutput = shell.controls.querySelector('[data-lab-output="maximum"]');
    const xScale = shell.controls.querySelector('[data-lab-field="x-scale"]');
    const yScale = shell.controls.querySelector('[data-lab-field="y-scale"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "growth-rates-plot",
      title: "Графики выбранных функций",
      viewBox: "0 0 800 440",
    });
    const details = document.createElement("section");
    details.className = "atlas-lab__panel";
    details.innerHTML = '<h4>Выбранная точка</h4><p data-lab-detail></p><h4>Пересечения</h4><ul data-lab-crossings></ul><p class="atlas-lab__note is-warning" data-lab-warning></p>';
    shell.workspace.appendChild(details);
    const detail = details.querySelector("[data-lab-detail]");
    const crossingList = details.querySelector("[data-lab-crossings]");
    const warning = details.querySelector("[data-lab-warning]");
    let app;

    function createState() {
      maximumOutput.textContent = Number(maximum.value).toLocaleString("ru-RU");
      return core.createState([left.value, right.value], {
        minimumN: 1,
        maximumN: Number(maximum.value),
        sampleCount: 72,
        xScale: xScale.value,
        yScale: yScale.value,
      });
    }

    function render(state) {
      const model = state.race;
      const svg = figure.svg;
      const box = { left: 62, right: 770, top: 28, bottom: 386 };
      drawing.clear(svg, "Гонка функций", "Две кривые роста, точки их пересечения и выбранное значение n");
      for (let index = 0; index <= 5; index += 1) {
        const y = box.top + (box.bottom - box.top) * index / 5;
        drawing.append(svg, "line", { x1: box.left, x2: box.right, y1: y, y2: y, class: "atlas-lab__grid-line" });
      }
      drawing.append(svg, "line", { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, class: "atlas-lab__axis" });
      drawing.append(svg, "line", { x1: box.left, x2: box.left, y1: box.top, y2: box.bottom, class: "atlas-lab__axis" });
      model.crossings.forEach(function (crossing) {
        const x = box.left + crossing.xShare * (box.right - box.left);
        drawing.append(svg, "line", { x1: x, x2: x, y1: box.top, y2: box.bottom, class: "growth-race-crossing" });
      });
      model.series.forEach(function (series, seriesIndex) {
        const usable = series.points.filter(function (point) { return Number.isFinite(point.yShare); });
        drawing.append(svg, "path", {
          d: drawing.pathFromPoints(usable, function (point) { return box.left + point.xShare * (box.right - box.left); }, function (point) { return box.bottom - point.yShare * (box.bottom - box.top); }),
          class: "growth-race-line is-series-" + seriesIndex,
        });
        const selected = series.points[state.pointIndex];
        drawing.append(svg, "circle", {
          cx: box.left + selected.xShare * (box.right - box.left),
          cy: box.bottom - selected.yShare * (box.bottom - box.top),
          r: 5,
          class: ["is-a", "is-b", "is-c"][seriesIndex],
        });
      });
      const current = model.series.map(function (series) { return series.points[state.pointIndex]; });
      const selectedX = box.left + current[0].xShare * (box.right - box.left);
      drawing.append(svg, "line", { x1: selectedX, x2: selectedX, y1: box.top, y2: box.bottom, class: "growth-race-selected" });
      drawing.text(svg, box.left, 420, "n=" + model.minimumN.toLocaleString("ru-RU"), "is-muted", "start");
      drawing.text(svg, box.right, 420, "n=" + model.maximumN.toLocaleString("ru-RU"), "is-muted", "end");
      detail.textContent = model.series.map(function (series, index) {
        const point = current[index];
        const value = point.log10Value === -Infinity ? "0" : "≈10^" + point.log10Value.toFixed(2);
        return series.label + " при n=" + point.n.toLocaleString("ru-RU") + ": " + value;
      }).join("; ");
      crossingList.replaceChildren();
      if (!model.crossings.length) {
        const item = document.createElement("li");
        item.textContent = "В показанном диапазоне пересечение не обнаружено";
        crossingList.appendChild(item);
      } else {
        model.crossings.forEach(function (crossing) {
          const item = document.createElement("li");
          item.textContent = (crossing.exact ? "Точно" : "Приблизительно") + " при n=" + crossing.n.toLocaleString("ru-RU");
          crossingList.appendChild(item);
        });
      }
      warning.textContent = model.warning;
      figure.caption.textContent = "Оси: n — " + model.xScale + ", значение — " + model.yScale + ". Цвет точки совпадает с цветом кривой";
    }

    app = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 96,
      bind: function (api) {
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
        shell.controls.addEventListener("change", function () { api.reset(); });
        maximum.addEventListener("input", function () { api.reset(); });
      },
    });
  });
})();
