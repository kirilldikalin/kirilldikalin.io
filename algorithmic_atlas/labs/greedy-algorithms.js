(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.GreedyAlgorithmsCore;

  runtime.boot("greedy-algorithms", function (root) {
    const shell = runtime.createShell(root, {
      title: "Выбор, обмен и контрпример на одной временной оси",
      description: "Перестройте правило выбора, проследите его решения и буквально обменяйте элементы оптимального расписания на жадные",
    });
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="scenario"><option value="exchange">Обменное доказательство</option><option value="weighted">Контрпример с весами</option></select></label>' +
      '<label>Локальное правило<select data-field="policy"><option value="earliest-finish">Самое раннее окончание</option><option value="shortest-first">Самый короткий интервал</option><option value="highest-weight">Наибольший вес</option></select></label>' +
      '<div class="atlas-lab__field"><span>Цель</span><output data-output="objective">Максимум числа интервалов</output></div>';

    const fields = {
      scenario: shell.controls.querySelector('[data-field="scenario"]'),
      policy: shell.controls.querySelector('[data-field="policy"]'),
      objective: shell.controls.querySelector('[data-output="objective"]'),
    };
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics greedy-algorithms-metrics";
    metrics.innerHTML =
      '<div><dt>Выбрано</dt><dd data-metric="count">0</dd></div>' +
      '<div><dt>Вес</dt><dd data-metric="weight">0</dd></div>' +
      '<div><dt>Эталон</dt><dd data-metric="optimum">0</dd></div>' +
      '<div><dt>Обмен</dt><dd data-metric="exchange">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "greedy-algorithms-visual",
      title: "Интервалы, жадное расписание и обменное свидетельство",
      viewBox: "0 0 1100 570",
      className: "greedy-algorithms-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel greedy-algorithms-step";
    panel.innerHTML =
      '<h4>Применяемое правило</h4><p data-rule></p>' +
      '<h4>Что сейчас доказано</h4><p data-invariant></p>';
    shell.workspace.appendChild(panel);

    function createState() {
      fields.objective.textContent = fields.scenario.value === "weighted"
        ? "Максимум суммарного веса"
        : "Максимум числа интервалов";
      return core.createState({ scenario: fields.scenario.value, policy: fields.policy.value });
    }

    function drawAxis(svg, maxEnd) {
      const left = 150; const right = 1030; const width = right - left;
      drawing.append(svg, "line", { x1: left, y1: 438, x2: right, y2: 438, class: "atlas-lab__axis" });
      for (let value = 0; value <= maxEnd; value += 1) {
        const x = left + value / maxEnd * width;
        drawing.append(svg, "line", { x1: x, y1: 75, x2: x, y2: 448, class: "atlas-lab__grid-line" });
        drawing.text(svg, x, 465, value, "is-muted", "middle");
      }
      return function (value) { return left + value / maxEnd * width; };
    }

    function intervalClass(interval, layer) {
      let value = "greedy-interval";
      if (interval.current) value += " is-current";
      if (interval.removed) value += " is-removed";
      if (layer === "greedy" && interval.selected) value += " is-selected";
      if (layer === "witness" && interval.witness) value += " is-witness";
      return value;
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const svg = figure.svg;
      drawing.clear(svg, "Жадный выбор и обмен", "Временная ось с исходными интервалами, текущим жадным решением и оптимальным свидетельством");
      const maxEnd = Math.max.apply(null, model.intervals.map(function (interval) { return interval.end; }));
      const x = drawAxis(svg, maxEnd);
      drawing.text(svg, 22, 52, "Кандидаты", "is-strong");
      drawing.text(svg, 22, 285, "Жадное G", "is-strong");
      drawing.text(svg, 22, 382, frame.phase === "exchange" ? "Обмениваем O" : "Эталон O", "is-strong");

      model.intervals.forEach(function (interval) {
        const y = 86 + interval.lane * 74;
        const width = Math.max(18, x(interval.end) - x(interval.start));
        drawing.append(svg, "rect", { x: x(interval.start), y: y, width: width, height: 44, rx: 5, class: intervalClass(interval, "input") });
        drawing.text(svg, x(interval.start) + width / 2, y + 27, interval.id + " · w=" + interval.weight, "greedy-interval-label", "middle");
      });
      model.intervals.filter(function (interval) { return interval.selected; }).forEach(function (interval) {
        const width = Math.max(18, x(interval.end) - x(interval.start));
        drawing.append(svg, "rect", { x: x(interval.start), y: 250, width: width, height: 50, rx: 5, class: intervalClass(interval, "greedy") });
        drawing.text(svg, x(interval.start) + width / 2, 281, interval.id, "greedy-solution-label", "middle");
      });
      model.intervals.filter(function (interval) { return interval.witness; }).forEach(function (interval) {
        const width = Math.max(18, x(interval.end) - x(interval.start));
        drawing.append(svg, "rect", { x: x(interval.start), y: 346, width: width, height: 50, rx: 5, class: intervalClass(interval, "witness") });
        drawing.text(svg, x(interval.start) + width / 2, 377, interval.id, "greedy-solution-label", "middle");
      });

      drawing.text(svg, 22, 510, frame.message, "greedy-frame-message");
      drawing.text(svg, 22, 540, "Сплошная заливка — G · штриховка — текущее оптимальное свидетельство O", "is-muted");
      const selectedWeight = frame.selected.reduce(function (sum, id) {
        return sum + model.scenario.intervals.find(function (interval) { return interval.id === id; }).weight;
      }, 0);
      metrics.querySelector('[data-metric="count"]').textContent = String(frame.selected.length);
      metrics.querySelector('[data-metric="weight"]').textContent = String(selectedWeight);
      metrics.querySelector('[data-metric="optimum"]').textContent = String(model.optimumScore);
      metrics.querySelector('[data-metric="exchange"]').textContent = frame.phase === "exchange"
        ? (frame.removedId + " → " + frame.currentId)
        : "—";
      panel.querySelector("[data-rule]").textContent = frame.message;
      panel.querySelector("[data-invariant]").textContent = frame.phase === "exchange"
        ? "После замены множество O остаётся совместимым и содержит столько же интервалов. Повторение обмена превращает его в G без потери качества."
        : model.options.scenario === "weighted"
          ? "Совместимость сохраняется, но она не связывает локальный вес с глобальным: эталон имеет вес " + model.optimumScore + ", жадный результат — " + model.greedyScore + "."
          : "Выбранные интервалы попарно совместимы. Оптимальность появится только после завершения обменной части, а не из самого факта допустимости.";
      figure.caption.textContent = model.options.scenario === "weighted"
        ? "Тот же способ выбора остаётся допустимым, но перестаёт быть оптимальным после изменения целевой функции"
        : "Каждый показанный обмен сохраняет допустимость и мощность — это визуальная версия индукционного доказательства";
    }

    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 40,
      bind: function (api) {
        fields.scenario.addEventListener("change", function () {
          if (fields.scenario.value === "weighted") fields.policy.value = "earliest-finish";
          api.reset();
        });
        fields.policy.addEventListener("change", api.reset);
      },
    });
    mounted.reset();
  });
})();
