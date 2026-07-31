(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.CombinatoricsCountingCore;
  runtime.boot("combinatorics-counting", function (root) {
    const shell = runtime.createShell(root, {
      title: "Три геометрии подсчёта",
      description: "Решётчатые пути, включения–исключения и принцип Дирихле используют разные картинки одной идеи: считать без пропусков и повторов",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-lab-field="mode"><option value="grid">Пути в решётке</option><option value="inclusion">Включения–исключения</option><option value="pigeonhole">Принцип Дирихле</option></select></label>' +
      '<label>Первый параметр<input data-lab-field="first" type="number" min="0" max="100" value="6"></label>' +
      '<label>Второй параметр<input data-lab-field="second" type="number" min="0" max="100" value="8"></label>' +
      '<label>Пересечение<input data-lab-field="intersection" type="number" min="0" max="100" value="15"></label>';
    const mode = shell.controls.querySelector('[data-lab-field="mode"]');
    const first = shell.controls.querySelector('[data-lab-field="first"]');
    const second = shell.controls.querySelector('[data-lab-field="second"]');
    const intersection = shell.controls.querySelector('[data-lab-field="intersection"]');
    const figure = runtime.createFigure(shell.workspace, { id: "combinatorics-visual", title: "Геометрическая модель подсчёта", viewBox: "0 0 760 440" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Точное равенство</h4><p data-equation></p><h4>Что гарантировано</h4><p data-explanation></p>';
    shell.workspace.appendChild(panel);
    const equation = panel.querySelector("[data-equation]");
    const explanation = panel.querySelector("[data-explanation]");

    function updateFields() {
      if (mode.value === "grid") {
        first.min = "0"; first.max = "20"; second.min = "0"; second.max = "20";
        if (Number(first.value) > 20) first.value = "6";
        if (Number(second.value) > 20) second.value = "8";
        intersection.disabled = true;
      } else if (mode.value === "inclusion") {
        first.min = "0"; first.max = "100"; second.min = "0"; second.max = "100";
        if (Number(first.value) < 20) first.value = "45";
        if (Number(second.value) < 20) second.value = "38";
        intersection.disabled = false;
      } else {
        first.min = "0"; first.max = "200"; second.min = "1"; second.max = "30";
        first.value = Math.max(0, Math.min(200, Number(first.value) || 13));
        second.value = Math.max(1, Math.min(30, Number(second.value) || 5));
        intersection.disabled = true;
      }
    }

    function createState() {
      updateFields();
      if (mode.value === "grid") return core.createState("grid", { rows: Number(first.value), columns: Number(second.value) });
      if (mode.value === "inclusion") return core.createState("inclusion", { universe: 100, a: Number(first.value), b: Number(second.value), intersection: Number(intersection.value) });
      return core.createState("pigeonhole", { items: Number(first.value), boxes: Number(second.value) });
    }

    function render(state) {
      const svg = figure.svg;
      drawing.clear(svg, "Комбинаторный подсчёт", "Геометрическая модель выбранного правила подсчёта");
      if (state.mode === "grid") renderGrid(svg, state);
      else if (state.mode === "inclusion") renderInclusion(svg, state);
      else renderPigeonhole(svg, state);
    }

    function renderGrid(svg, state) {
      const model = state.model;
      const cell = Math.min(42, 600 / Math.max(1, model.columns + 1), 330 / Math.max(1, model.rows + 1));
      const startX = (760 - model.columns * cell) / 2;
      const startY = 45;
      for (let row = 0; row <= model.rows; row += 1) {
        for (let column = 0; column <= model.columns; column += 1) {
          if (row + column > state.stage) continue;
          const x = startX + column * cell;
          const y = startY + row * cell;
          drawing.append(svg, "circle", { cx: x, cy: y, r: 7, class: "combinatorics-cell" });
          const value = model.counts[row][column];
          if (model.rows <= 9 && model.columns <= 9) drawing.text(svg, x, y - 11, value.toString(), "is-muted", "middle");
          if (column > 0 && row + column - 1 <= state.stage) drawing.append(svg, "line", { x1: x - cell + 8, y1: y, x2: x - 8, y2: y, class: "recurrence-edge" });
          if (row > 0 && row + column - 1 <= state.stage) drawing.append(svg, "line", { x1: x, y1: y - cell + 8, x2: x, y2: y - 8, class: "recurrence-edge" });
        }
      }
      equation.textContent = "C(" + (model.rows + model.columns) + ", " + model.rows + ") = " + model.total.toString();
      explanation.textContent = "В каждой вершине число путей равно сумме значений слева и сверху";
      figure.caption.textContent = model.rows <= 9 && model.columns <= 9 ? "Числа в вершинах показаны точно" : "Большая решётка показана схематически; итог вычислен точно как BigInt";
    }

    function renderInclusion(svg, state) {
      const model = state.model;
      drawing.append(svg, "rect", { x: 70, y: 45, width: 620, height: 330, class: "binary-cell" });
      if (state.stage >= 1) drawing.append(svg, "circle", { cx: 315, cy: 210, r: 130, class: "combinatorics-venn-a" });
      if (state.stage >= 2) drawing.append(svg, "circle", { cx: 445, cy: 210, r: 130, class: "combinatorics-venn-b" });
      if (state.stage >= 1) drawing.text(svg, 245, 215, model.onlyA, "is-strong", "middle");
      if (state.stage >= 2) drawing.text(svg, 515, 215, model.onlyB, "is-strong", "middle");
      if (state.stage >= 3) drawing.text(svg, 380, 215, model.intersection, "is-strong", "middle");
      drawing.text(svg, 650, 355, "вне: " + model.neither, "is-muted", "end");
      equation.textContent = model.a + " + " + model.b + " − " + model.intersection + " = " + model.union;
      explanation.textContent = "Пересечение вычитается один раз, потому что в первых двух слагаемых оно посчитано дважды";
      figure.caption.textContent = "Площади схематичны, числа в четырёх областях точны";
    }

    function renderPigeonhole(svg, state) {
      const model = state.model;
      const shownItems = Math.min(state.stage, model.items);
      const boxWidth = Math.min(110, 620 / model.boxes);
      const startX = (760 - boxWidth * model.boxes) / 2;
      model.occupancy.forEach(function (_, box) {
        drawing.append(svg, "rect", { x: startX + box * boxWidth, y: 90, width: boxWidth - 8, height: 260, class: "binary-cell" });
      });
      for (let item = 0; item < shownItems; item += 1) {
        const box = item % model.boxes;
        const level = Math.floor(item / model.boxes);
        drawing.append(svg, "circle", { cx: startX + box * boxWidth + (boxWidth - 8) / 2, cy: 325 - level * 26, r: 9, class: "combinatorics-item" });
      }
      equation.textContent = "⌈" + model.items + "/" + model.boxes + "⌉ = " + model.guaranteedMaximum;
      explanation.textContent = model.collisionForced ? "Хотя бы в одном ящике неизбежно окажутся два или более предмета" : "При таком числе предметов столкновение ещё не гарантировано";
      figure.caption.textContent = "Круги раскладываются равномерно — это конфигурация с минимально возможным максимумом";
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 50,
      bind: function (api) {
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
        shell.controls.addEventListener("change", function () { api.reset(); });
      },
    });
  });
})();
