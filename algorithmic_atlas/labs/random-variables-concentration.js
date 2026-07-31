(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.RandomVariablesConcentrationCore;
  runtime.boot("random-variables-concentration", function (root) {
    const shell = runtime.createShell(root, {
      title: "Сумма случайных величин",
      description: "Воспроизводимая симуляция строит гистограмму, а теоретические границы остаются отдельными утверждениями",
    });
    shell.controls.innerHTML =
      '<label>Число Bernoulli-переменных<input data-lab-field="variables" type="range" min="1" max="200" value="40"><output data-output="variables"></output></label>' +
      '<label>Вероятность успеха, ‰<input data-lab-field="probability" type="range" min="0" max="1000" value="350"><output data-output="probability"></output></label>' +
      '<label>Отклонение t<input data-lab-field="threshold" type="range" min="0" max="40" value="6"><output data-output="threshold"></output></label>' +
      '<label>Seed<input data-lab-field="seed" type="number" value="20260731"></label>' +
      '<label>Число испытаний<input data-lab-field="trials" type="number" min="100" max="100000" step="100" value="5000"></label>';
    const fields = {};
    ["variables","probability","threshold","seed","trials"].forEach(function (name) { fields[name] = shell.controls.querySelector('[data-lab-field="' + name + '"]'); });
    const outputs = {};
    ["variables","probability","threshold"].forEach(function (name) { outputs[name] = shell.controls.querySelector('[data-output="' + name + '"]'); });
    const figure = runtime.createFigure(shell.workspace, { id: "concentration-histogram", title: "Гистограмма суммы", viewBox: "0 0 820 460" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Параметры распределения</h4><p data-moments></p><h4>Наблюдаемый хвост</h4><p data-tail></p><h4>Теоретические верхние границы</h4><ul data-bounds></ul><p class="atlas-lab__note is-warning" data-warning></p>';
    shell.workspace.appendChild(panel);
    const moments = panel.querySelector("[data-moments]"); const tail = panel.querySelector("[data-tail]"); const boundsList = panel.querySelector("[data-bounds]"); const warning = panel.querySelector("[data-warning]");
    function createState() {
      const n = Number(fields.variables.value);
      fields.threshold.max = String(n);
      if (Number(fields.threshold.value) > n) fields.threshold.value = String(n);
      outputs.variables.textContent = String(n);
      outputs.probability.textContent = (Number(fields.probability.value) / 10).toFixed(1) + "%";
      outputs.threshold.textContent = fields.threshold.value;
      return core.createState({ variables: n, probabilityPermille: Number(fields.probability.value), threshold: Number(fields.threshold.value), seed: Number(fields.seed.value), maxTrials: Number(fields.trials.value), batchSize: 100 });
    }
    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg; const box = { left: 55, right: 795, top: 30, bottom: 390 };
      drawing.clear(svg, "Гистограмма суммы Бернулли", "Столбцы симуляции, теоретическая масса, среднее и область хвоста");
      const count = model.bars.length; const width = (box.right - box.left) / count;
      model.bars.forEach(function (bar) {
        const x = box.left + bar.value * width;
        drawing.append(svg, "rect", { x: x, y: box.bottom - bar.heightShare * (box.bottom - box.top), width: Math.max(1, width - 1), height: bar.heightShare * (box.bottom - box.top), class: "concentration-bar" + (bar.tail ? " is-tail" : "") });
      });
      const theoryPoints = model.bars.map(function (bar) { return { x: box.left + (bar.value + 0.5) * width, y: box.bottom - bar.theoryShare * (box.bottom - box.top) }; });
      drawing.append(svg, "path", { d: drawing.pathFromPoints(theoryPoints, function (point) { return point.x; }, function (point) { return point.y; }), class: "concentration-theory-line" });
      const meanX = box.left + (model.mean + 0.5) * width;
      drawing.append(svg, "line", { x1: meanX, x2: meanX, y1: box.top, y2: box.bottom, class: "concentration-mean" });
      [model.lowerThreshold, model.upperThreshold].forEach(function (value) {
        const x = box.left + (value + 0.5) * width;
        drawing.append(svg, "line", { x1: x, x2: x, y1: box.top, y2: box.bottom, class: "concentration-threshold" });
      });
      drawing.append(svg, "line", { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, class: "atlas-lab__axis" });
      moments.textContent = "E[S]=" + model.mean.toFixed(2) + ", Var(S)=" + model.variance.toFixed(2) + ", σ=" + model.standardDeviation.toFixed(2);
      tail.textContent = model.empiricalTail === null ? "Сделайте хотя бы один шаг" : "По " + model.samples.toLocaleString("ru-RU") + " испытаниям: " + (100 * model.empiricalTail).toFixed(2) + "%";
      boundsList.replaceChildren();
      [["Марков (правый хвост)",model.bounds.markov],["Чебышёв",model.bounds.chebyshev],["Хёффдинг",model.bounds.hoeffding],["Чернов",model.bounds.chernoff]].forEach(function (entry) { const item = document.createElement("li"); item.textContent = entry[0] + ": " + (entry[1] === null ? "условие t≤E[S] не выполнено" : "≤ " + (100 * entry[1]).toFixed(2) + "%"); boundsList.appendChild(item); });
      warning.textContent = model.warning;
      figure.caption.textContent = "Столбцы — симуляция с seed; пунктир — точное биномиальное распределение";
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 1000,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); shell.controls.addEventListener("input", function (event) { if (event.target.type === "range") api.reset(); }); },
    });
  });
})();
