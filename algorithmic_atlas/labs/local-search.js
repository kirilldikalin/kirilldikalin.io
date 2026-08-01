(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.LocalSearchCore;

  runtime.boot("local-search", function (root) {
    const shell = runtime.createShell(root, {
      title: "Ландшафт, окрестность и несколько траекторий",
      description: "Сравните первое и лучшее улучшение с отжигом, добавьте рестарты и проследите, когда локальный максимум не совпадает с глобальным",
    });
    shell.controls.innerHTML =
      '<label>Стратегия<select data-field="strategy"><option value="first">Первое улучшение</option><option value="best">Лучшее улучшение</option><option value="anneal">Имитация отжига</option></select></label>' +
      '<label>Рестарты<select data-field="restarts"><option value="0">0</option><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select></label>' +
      '<label>Seed<input data-field="seed" type="number" min="1" max="4294967295" value="41"></label>' +
      '<label>Старт x<input data-field="start-x" type="number" min="0" max="11" value="1"></label>' +
      '<label>Старт y<input data-field="start-y" type="number" min="0" max="7" value="1"></label>' +
      '<label data-temperature-control>Начальная температура<input data-field="temperature" type="range" min="1" max="120" value="35"><output data-temperature-output>3,5</output></label>';

    const fields = {
      strategy: shell.controls.querySelector('[data-field="strategy"]'),
      restarts: shell.controls.querySelector('[data-field="restarts"]'),
      seed: shell.controls.querySelector('[data-field="seed"]'),
      startX: shell.controls.querySelector('[data-field="start-x"]'),
      startY: shell.controls.querySelector('[data-field="start-y"]'),
      temperature: shell.controls.querySelector('[data-field="temperature"]'),
      temperatureOutput: shell.controls.querySelector("[data-temperature-output]"),
      temperatureControl: shell.controls.querySelector("[data-temperature-control]"),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics local-search-metrics";
    metrics.innerHTML =
      '<div><dt>Текущее значение</dt><dd data-current>—</dd></div>' +
      '<div><dt>Лучшее найденное</dt><dd data-best>—</dd></div>' +
      '<div><dt>Глобальный максимум</dt><dd data-global>—</dd></div>' +
      '<div><dt>Температура</dt><dd data-temperature>—</dd></div>' +
      '<div><dt>Рестарт</dt><dd data-restart>—</dd></div>' +
      '<div><dt>Длина траектории</dt><dd data-path>—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "local-search-visual",
      title: "Ландшафт целевой функции",
      viewBox: "0 0 1120 650",
      className: "local-search-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel local-search-panel";
    panel.innerHTML =
      '<h4>Что произошло</h4><p data-message></p>' +
      '<h4>Что можно заключить</h4><p data-conclusion></p>';
    shell.workspace.appendChild(panel);

    function levelClass(value, maximum) {
      return "is-level-" + Math.min(6, Math.floor(value / Math.max(1, maximum) * 7));
    }

    function point(cell, cellWidth, cellHeight) {
      return {
        x: 72 + (cell.x + 0.5) * cellWidth,
        y: 78 + (cell.y + 0.5) * cellHeight,
      };
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const svg = figure.svg;
      const cellWidth = 72;
      const cellHeight = 62;
      drawing.clear(
        svg,
        "Ландшафт локального поиска",
        "Сетка значений с текущей точкой, локальными максимумами и полной траекторией"
      );
      drawing.text(svg, 72, 42, "Ниже — хуже", "is-muted");
      drawing.text(svg, 936, 42, "Выше — лучше", "is-strong", "end");
      model.cells.forEach(function (cell) {
        let className = "local-search-cell " +
          levelClass(cell.value, model.globalMaximum.value);
        if (cell.visited) className += " is-visited";
        if (cell.candidate) className += " is-candidate";
        if (cell.current) className += " is-current";
        const x = 72 + cell.x * cellWidth;
        const y = 78 + cell.y * cellHeight;
        drawing.append(svg, "rect", {
          x: x,
          y: y,
          width: cellWidth - 4,
          height: cellHeight - 4,
          rx: 5,
          class: className,
        });
        drawing.text(svg, x + (cellWidth - 4) / 2, y + 34, cell.value,
          cell.current ? "local-search-value is-current" : "local-search-value", "middle");
        if (cell.localOptimum) {
          drawing.text(svg, x + 8, y + 16, cell.globalOptimum ? "★" : "◆",
            cell.globalOptimum ? "local-search-global" : "local-search-local");
        }
      });
      if (frame.path.length > 1) {
        drawing.append(svg, "path", {
          d: drawing.pathFromPoints(
            frame.path,
            function (cell) { return point(cell, cellWidth, cellHeight).x; },
            function (cell) { return point(cell, cellWidth, cellHeight).y; }
          ),
          class: "local-search-path",
        });
      }
      const currentPoint = point(frame.current, cellWidth, cellHeight);
      drawing.append(svg, "circle", {
        cx: currentPoint.x,
        cy: currentPoint.y,
        r: 14,
        class: "local-search-marker",
      });
      drawing.text(svg, 970, 105, "Текущая точка", "is-muted");
      drawing.text(svg, 970, 132,
        "(" + frame.current.x + ", " + frame.current.y + ") · " + frame.current.value,
        "is-strong");
      drawing.text(svg, 970, 190, "Лучшее найденное", "is-muted");
      drawing.text(svg, 970, 217,
        "(" + frame.best.x + ", " + frame.best.y + ") · " + frame.best.value,
        "is-strong");
      drawing.text(svg, 970, 275, "Глобальный максимум", "is-muted");
      drawing.text(svg, 970, 302,
        "(" + model.globalMaximum.x + ", " + model.globalMaximum.y + ") · " +
          model.globalMaximum.value,
        "is-strong");
      drawing.text(svg, 970, 370, "◆ локальный", "local-search-local");
      drawing.text(svg, 970, 400, "★ глобальный", "local-search-global");
      drawing.text(svg, 970, 455, "Путь может спускаться", "is-muted");
      drawing.text(svg, 970, 478,
        model.options.strategy === "anneal" ? "при T > 0" : "только растёт",
        "is-strong");
      drawing.text(svg, 72, 608, frame.message, "local-search-message");

      metrics.querySelector("[data-current]").textContent = frame.current.value;
      metrics.querySelector("[data-best]").textContent = frame.best.value;
      metrics.querySelector("[data-global]").textContent = model.globalMaximum.value;
      metrics.querySelector("[data-temperature]").textContent =
        model.options.strategy === "anneal" ? frame.temperature.toFixed(2) : "не используется";
      metrics.querySelector("[data-restart]").textContent =
        frame.restartIndex + " / " + model.options.restarts;
      metrics.querySelector("[data-path]").textContent = frame.path.length;
      panel.querySelector("[data-message]").textContent = frame.message;
      panel.querySelector("[data-conclusion]").textContent =
        frame.action === "finish"
          ? (frame.best.value === model.globalMaximum.value
            ? "В этой трассе глобальный максимум найден, но случайный успех сам по себе не является общей гарантией стратегии"
            : "Лучшее найденное решение ниже известного глобального максимума: контрпример виден прямо на карте")
          : model.options.strategy === "anneal"
            ? "Принятие ухудшений зависит от температуры и seed; охлаждение меняет вероятность, а не корректность задачи"
            : "Потенциал строго растёт на каждом ходе, поэтому цикл невозможен, но завершение гарантирует лишь локальный оптимум";
      figure.caption.textContent =
        "Высота и числа показывают одну и ту же целевую функцию; траектория строится математическим ядром, а не рисуется отдельно";
    }

    function syncTemperature() {
      fields.temperatureOutput.textContent =
        (Number(fields.temperature.value) / 10).toLocaleString("ru-RU", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
      fields.temperature.disabled = fields.strategy.value !== "anneal";
    }

    const mounted = runtime.mount(root, {
      createState: function () {
        syncTemperature();
        return core.createState({
          strategy: fields.strategy.value,
          restarts: fields.restarts.value,
          seed: fields.seed.value,
          startX: fields.startX.value,
          startY: fields.startY.value,
          temperatureTenths: fields.temperature.value,
        });
      },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 180,
      bind: function (api) {
        shell.controls.addEventListener("change", function () {
          syncTemperature();
          api.reset();
        });
        fields.temperature.addEventListener("input", function () {
          syncTemperature();
          api.reset();
        });
      },
    });
    syncTemperature();
    mounted.reset();
  });
})();
