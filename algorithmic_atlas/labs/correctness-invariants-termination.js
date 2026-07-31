(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.CorrectnessInvariantsTerminationCore;
  runtime.boot("correctness-invariants-termination", function (root) {
    const shell = runtime.createShell(root, {
      title: "Инвариант бинарного поиска",
      description: "Следите за полуинтервалом [lo,hi), средней точкой и строго убывающей функцией-вариантом",
    });
    shell.controls.innerHTML =
      '<label class="atlas-lab__field is-wide">Отсортированный массив<input data-lab-field="array" type="text" value="1, 3, 3, 7, 9, 14, 18, 23, 31"></label>' +
      '<label>Искомое число<input data-lab-field="target" type="number" value="14"></label>';
    const array = shell.controls.querySelector('[data-lab-field="array"]');
    const target = shell.controls.querySelector('[data-lab-field="target"]');
    const figure = runtime.createFigure(shell.workspace, { id: "binary-invariant-visual", title: "Состояние массива", viewBox: "0 0 820 330" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Инвариант</h4><ul><li data-bounds></li><li data-left></li><li data-right></li></ul><h4>Функция-вариант</h4><p data-variant></p><h4>Результат</h4><p data-result></p>';
    shell.workspace.appendChild(panel);
    const bounds = panel.querySelector("[data-bounds]");
    const leftEvidence = panel.querySelector("[data-left]");
    const rightEvidence = panel.querySelector("[data-right]");
    const variant = panel.querySelector("[data-variant]");
    const result = panel.querySelector("[data-result]");

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Бинарный поиск", "Ячейки массива, текущий кандидатный интервал и средняя точка");
      const count = Math.max(1, model.cells.length);
      const width = Math.min(68, 720 / count);
      const start = (820 - width * count) / 2;
      model.cells.forEach(function (cell) {
        const x = start + cell.index * width;
        drawing.append(svg, "rect", { x: x, y: 115, width: width, height: 58, class: "binary-cell is-" + cell.status });
        drawing.text(svg, x + width / 2, 148, cell.value, "is-strong", "middle");
        drawing.text(svg, x + width / 2, 194, cell.index, "is-muted", "middle");
      });
      const loX = start + model.lo * width;
      const hiX = start + model.hi * width;
      drawing.append(svg, "path", { d: "M" + loX + " 92V78H" + hiX + "V92", class: "binary-bracket" });
      drawing.text(svg, loX, 65, "lo=" + model.lo, "is-a", "start");
      drawing.text(svg, hiX, 65, "hi=" + model.hi, "is-b", "end");
      if (state.last) drawing.text(svg, start + (state.last.mid + 0.5) * width, 230, "mid", "is-c", "middle");
      bounds.textContent = "0 ≤ lo ≤ hi ≤ n: " + (model.invariant.bounds ? "выполнено" : "нарушено");
      leftEvidence.textContent = "Слева от lo все значения < target: " + (model.invariant.leftStrictlyLess ? "выполнено" : "нарушено");
      rightEvidence.textContent = "Начиная с hi все значения ≥ target: " + (model.invariant.rightAtLeastTarget ? "выполнено" : "нарушено");
      variant.textContent = state.last ? state.last.previousVariant + " → " + state.variant : String(state.variant);
      result.textContent = state.finished ? (state.foundIndex >= 0 ? "Первое вхождение имеет индекс " + state.foundIndex : "Числа в массиве нет") : "Поиск продолжается";
      figure.caption.textContent = "Светлая область — ещё допустимые позиции; после каждого шага её длина строго уменьшается";
    }
    runtime.mount(root, {
      createState: function () { return core.createState(array.value, target.value); },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 70,
      bind: function (api) {
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
        shell.controls.addEventListener("change", function () { api.reset(); });
      },
    });
  });
})();
