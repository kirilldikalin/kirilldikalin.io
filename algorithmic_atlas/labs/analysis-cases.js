(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.AnalysisCasesCore;
  runtime.boot("analysis-cases", function (root) {
    const shell = runtime.createShell(root, {
      title: "Три разных вопроса о стоимости",
      description: "Противник строит худший вход, распределение задаёт средний случай, а динамический массив показывает амортизацию",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-lab-field="mode"><option value="adversary">Худший случай</option><option value="average">Средний случай</option><option value="amortized">Амортизированный</option></select></label>' +
      '<label>Размер / число операций<input data-lab-field="size" type="range" min="1" max="64" value="16"><output data-output="size"></output></label>' +
      '<label>Вероятность отсутствия, ‰<input data-lab-field="absent" type="range" min="0" max="1000" value="150"><output data-output="absent"></output></label>' +
      '<label>Смещение к началу, ‰<input data-lab-field="bias" type="range" min="0" max="1000" value="300"><output data-output="bias"></output></label>';
    const mode = shell.controls.querySelector('[data-lab-field="mode"]'); const size = shell.controls.querySelector('[data-lab-field="size"]'); const absent = shell.controls.querySelector('[data-lab-field="absent"]'); const bias = shell.controls.querySelector('[data-lab-field="bias"]');
    const outputs = { size: shell.controls.querySelector('[data-output="size"]'), absent: shell.controls.querySelector('[data-output="absent"]'), bias: shell.controls.querySelector('[data-output="bias"]') };
    const figure = runtime.createFigure(shell.workspace, { id: "analysis-cases-visual", title: "Стоимость выбранного режима", viewBox: "0 0 820 450" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Текущий смысл шага</h4><p data-summary></p><h4>Проверяемое равенство</h4><p data-identity></p>';
    shell.workspace.appendChild(panel);
    const summary = panel.querySelector("[data-summary]"); const identity = panel.querySelector("[data-identity]");
    function createState() {
      outputs.size.textContent = size.value; outputs.absent.textContent = (Number(absent.value) / 10).toFixed(1) + "%"; outputs.bias.textContent = (Number(bias.value) / 10).toFixed(1) + "%";
      return core.createState(mode.value, { size: Number(size.value), operations: Number(size.value), absentPermille: Number(absent.value), biasPermille: Number(bias.value) });
    }
    function render(state) {
      const model = core.visualModel(state); const svg = figure.svg;
      drawing.clear(svg, "Случаи анализа", "Визуализация выбранного определения стоимости");
      if (model.mode === "adversary") renderAdversary(svg, model);
      else if (model.mode === "average") renderAverage(svg, model);
      else renderAmortized(svg, model);
    }
    function renderAdversary(svg, model) {
      const width = Math.min(42, 680 / model.cells.length); const start = (820 - width * model.cells.length) / 2;
      model.cells.forEach(function (cell) {
        drawing.append(svg, "rect", { x: start + cell.index * width, y: 170, width: width - 2, height: 65, class: "binary-cell analysis-adversary-cell" + (cell.targetRevealed ? " is-target" : cell.tested ? " is-tested" : "") });
        drawing.text(svg, start + (cell.index + 0.5) * width, 210, cell.targetRevealed ? "✓" : cell.tested ? "×" : "?", "is-strong", "middle");
      });
      summary.textContent = "Противник оставляет цель в последней ещё не проверенной позиции. Проверок: " + model.cost + " из " + model.worstCost;
      identity.textContent = "T_worst(n) = max по входам = n";
      figure.caption.textContent = "Нераскрытые клетки остаются совместимыми с ответами противника";
    }
    function renderAverage(svg, model) {
      const width = 680 / model.cases.length;
      model.cases.forEach(function (item, index) {
        const height = 300 * item.share;
        drawing.append(svg, "rect", { x: 65 + index * width, y: 370 - height, width: Math.max(2, width - 3), height: height, class: "analysis-distribution-bar" + (item.selected ? " is-current" : "") });
        if (model.cases.length <= 20) drawing.text(svg, 65 + (index + 0.5) * width, 395, item.position === null ? "∅" : item.position + 1, "is-muted", "middle");
      });
      summary.textContent = "Ожидаемое число проверок: " + model.expectedCost.toFixed(3);
      identity.textContent = "Σ pᵢ = " + model.totalProbability.toFixed(12) + "; E[T] = Σ pᵢTᵢ";
      figure.caption.textContent = "Высота столбца — вероятность конкретной позиции или отсутствия цели";
    }
    function renderAmortized(svg, model) {
      const width = Math.min(46, 680 / model.visibleCapacity); const start = (820 - width * model.visibleCapacity) / 2;
      for (let index = 0; index < model.visibleCapacity; index += 1) {
        drawing.append(svg, "rect", { x: start + index * width, y: 130, width: width - 2, height: 55, class: "dynamic-array-cell" + (index < model.size ? (index === model.size - 1 ? " is-new" : "") : " is-empty") });
      }
      const maximum = Math.max(1, model.actualTotal, model.amortizedTotal, model.potential);
      [["факт",model.actualTotal,"is-a"],["аморт.",model.amortizedTotal,"is-b"],["Φ",model.potential,"is-c"]].forEach(function (entry, index) {
        const y = 250 + index * 55; drawing.text(svg, 155, y + 18, entry[0], "is-strong", "end");
        drawing.append(svg, "rect", { x: 175, y: y, width: 520 * entry[1] / maximum, height: 28, class: "analysis-cost-bar " + entry[2] }); drawing.text(svg, 710, y + 19, entry[1], "is-muted", "end");
      });
      summary.textContent = model.last ? (model.last.resize ? "Расширение: скопировано " + model.last.copied + " элементов" : "Обычная вставка без копирования") : "Массив пуст, вместимость равна 1";
      identity.textContent = model.last ? "ĉ = c + ΔΦ: " + model.last.amortized + " = " + model.last.actual + " + " + model.last.deltaPotential : "ĉ = c + ΔΦ";
      figure.caption.textContent = "Редкие дорогие расширения оплачиваются накопленной потенциальной функцией";
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 130,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); shell.controls.addEventListener("input", function (event) { if (event.target.type === "range") api.reset(); }); },
    });
  });
})();
