(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.EditDistanceLcsCore;

  runtime.boot("edit-distance-lcs", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Одна динамическая таблица — две задачи выравнивания",
      description: "Заполняйте клетки редакционного расстояния или LCS и затем проследите обратный путь, который восстанавливает конкретное оптимальное решение",
    });
    shell.controls.innerHTML =
      '<label>Задача<select data-field="mode"><option value="edit">Расстояние Левенштейна</option><option value="lcs">Наибольшая общая подпоследовательность</option></select></label>' +
      '<label>Первая строка<input data-field="left" value="алгоритм" maxlength="32" spellcheck="false"></label>' +
      '<label>Вторая строка<input data-field="right" value="логарифм" maxlength="32" spellcheck="false"></label>';
    const fields = {};
    ["mode", "left", "right"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
    });
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Клетка</dt><dd data-metric="cell">0, 0</dd></div>' +
      '<div><dt>Заполнено</dt><dd data-metric="filled">0</dd></div>' +
      '<div><dt>Оптимальное значение</dt><dd data-metric="value">0</dd></div>' +
      '<div><dt>Восстановление</dt><dd data-metric="answer">—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "edit-distance-lcs-visual", title: "Матрица динамического программирования",
      viewBox: "0 0 920 640",
    });
    const detail = document.createElement("section");
    detail.className = "atlas-lab__panel";
    detail.innerHTML = '<h4>Рекуррентность клетки</h4><p data-recurrence></p>';
    shell.workspace.appendChild(detail);

    function createState() {
      return core.createState({ mode: fields.mode.value, left: fields.left.value,
        right: fields.right.value });
    }

    function render(state) {
      const frame = state.frame;
      const columns = frame.matrix[0].length;
      const visible = frame.matrix.map(function (row, rowIndex) {
        return row.map(function (value, columnIndex) {
          const index = rowIndex * columns + columnIndex;
          return index < frame.visibleCells ? value : null;
        });
      });
      drawing.clear(figure.svg, "Динамическая таблица выравнивания",
        "Числа в заполненных клетках и путь восстановления оптимального ответа");
      const cell = Math.min(46, 680 / Math.max(1, columns));
      sequence.drawMatrix(figure.svg, visible, { x: 150, y: 86, cell: cell,
        active: [frame.row, frame.column], path: frame.finished ? frame.path : [] });
      Array.from(state.right).forEach(function (symbol, index) {
        drawing.text(figure.svg, 150 + (index + 1.5) * cell, 69, symbol, "is-strong", "middle");
      });
      Array.from(state.left).forEach(function (symbol, index) {
        drawing.text(figure.svg, 130, 86 + (index + 1.65) * cell, symbol, "is-strong", "end");
      });
      const result = state.mode === "edit"
        ? core.editScript(state.left, state.right, frame.matrix)
        : core.lcs(state.left, state.right, frame.matrix);
      metrics.querySelector('[data-metric="cell"]').textContent = frame.row + ", " + frame.column;
      metrics.querySelector('[data-metric="filled"]').textContent = frame.visibleCells + " / " +
        (frame.matrix.length * columns);
      metrics.querySelector('[data-metric="value"]').textContent = String(frame.matrix.at(-1).at(-1));
      metrics.querySelector('[data-metric="answer"]').textContent = frame.finished
        ? (state.mode === "edit" ? result.operations.map(function (item) { return item.kind; }).join(" → ") : result.value || "ε")
        : "после заполнения";
      detail.querySelector("[data-recurrence]").textContent = state.mode === "edit"
        ? "Берём минимум удаления, вставки и замены; при равных символах диагональный переход имеет цену 0"
        : "При равных символах удлиняем общую подпоследовательность, иначе берём максимум сверху и слева";
      figure.caption.textContent = frame.finished
        ? "Выделенный путь является свидетелем оптимума, а не просто числом в правом нижнем углу"
        : "Значение клетки зависит только от уже заполненных соседей";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 1800 });
    shell.controls.addEventListener("change", mounted.reset);
    fields.left.addEventListener("input", mounted.reset);
    fields.right.addEventListener("input", mounted.reset);
  });
})();
