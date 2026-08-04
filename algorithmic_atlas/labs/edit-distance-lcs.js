(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.EditDistanceLcsCore;

  runtime.boot("edit-distance-lcs", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "Редактирование, LCS, глобальное и локальное выравнивание",
      description: "Меняйте цены операций и сравнивайте четыре рекуррентности в одной синхронной динамической таблице",
    });
    shell.controls.innerHTML =
      '<label>Задача<select data-field="mode"><option value="edit">Расстояние Левенштейна</option><option value="lcs">Наибольшая общая подпоследовательность</option><option value="global">Глобальное выравнивание</option><option value="local">Локальное выравнивание</option></select></label>' +
      '<label>Первая строка<input data-field="left" value="алгоритм" maxlength="32" spellcheck="false"></label>' +
      '<label>Вторая строка<input data-field="right" value="логарифм" maxlength="32" spellcheck="false"></label>' +
      '<label data-edit>Цена вставки<input data-field="insert" type="number" min="0" max="20" value="1"></label>' +
      '<label data-edit>Цена удаления<input data-field="delete" type="number" min="0" max="20" value="1"></label>' +
      '<label data-edit>Цена замены<input data-field="substitute" type="number" min="0" max="20" value="1"></label>' +
      '<label data-align>Совпадение<input data-field="match" type="number" min="-20" max="20" value="2"></label>' +
      '<label data-align>Несовпадение<input data-field="mismatch" type="number" min="-20" max="20" value="-1"></label>' +
      '<label data-align>Пропуск<input data-field="gap" type="number" min="-20" max="20" value="-2"></label>';
    const fields = {};
    ["mode", "left", "right", "insert", "delete", "substitute", "match", "mismatch", "gap"].forEach(function (name) {
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

    function syncControls() {
      shell.controls.querySelectorAll("[data-edit]").forEach(function (element) {
        element.hidden = fields.mode.value !== "edit";
      });
      shell.controls.querySelectorAll("[data-align]").forEach(function (element) {
        element.hidden = !["global", "local"].includes(fields.mode.value);
      });
    }

    function createState() {
      syncControls();
      return core.createState({ mode: fields.mode.value, left: fields.left.value,
        right: fields.right.value, costs: { insert: fields.insert.value,
          delete: fields.delete.value, substitute: fields.substitute.value },
        scores: { match: fields.match.value, mismatch: fields.mismatch.value,
          gap: fields.gap.value } });
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
      const cell = Math.min(46, 680 / Math.max(1, columns),
        490 / Math.max(1, frame.matrix.length));
      sequence.drawMatrix(figure.svg, visible, { x: 150, y: 86, cell: cell,
        active: [frame.row, frame.column], path: frame.finished ? frame.path : [] });
      Array.from(state.right).forEach(function (symbol, index) {
        drawing.text(figure.svg, 150 + (index + 1.5) * cell, 69, symbol, "is-strong", "middle");
      });
      Array.from(state.left).forEach(function (symbol, index) {
        drawing.text(figure.svg, 130, 86 + (index + 1.65) * cell, symbol, "is-strong", "end");
      });
      let result;
      if (state.mode === "edit") result = core.editScript(state.left, state.right, frame.matrix, state.costs);
      else if (state.mode === "lcs") result = core.lcs(state.left, state.right, frame.matrix);
      else {
        const alignment = { matrix: frame.matrix,
          best: { row: frame.answerCell[0], column: frame.answerCell[1],
            value: frame.matrix[frame.answerCell[0]][frame.answerCell[1]] },
          scores: state.scores, local: state.mode === "local" };
        result = core.alignmentTrace(state.left, state.right, alignment);
      }
      metrics.querySelector('[data-metric="cell"]').textContent = frame.row + ", " + frame.column;
      metrics.querySelector('[data-metric="filled"]').textContent = frame.visibleCells + " / " +
        (frame.matrix.length * columns);
      metrics.querySelector('[data-metric="value"]').textContent =
        core.cellIsVisible(frame, frame.answerCell[0], frame.answerCell[1])
          ? String(frame.matrix[frame.answerCell[0]][frame.answerCell[1]])
          : "ещё не вычислено";
      metrics.querySelector('[data-metric="answer"]').textContent = frame.finished
        ? (state.mode === "edit" ? result.operations.map(function (item) { return item.kind; }).join(" → ") :
          state.mode === "lcs" ? result.value || "ε" : result.left + " / " + result.right)
        : "после заполнения";
      detail.querySelector("[data-recurrence]").textContent = state.mode === "edit"
        ? "Минимум удаления (" + state.costs.delete + "), вставки (" + state.costs.insert +
          ") и замены (" + state.costs.substitute + "); совпадение стоит 0"
        : state.mode === "lcs"
          ? "При равных символах удлиняем подпоследовательность, иначе берём максимум сверху и слева"
          : state.mode === "global"
            ? "Максимум диагонали, пропуска сверху и пропуска слева; вся строка обязана войти в выравнивание"
            : "Тот же максимум с дополнительным нулём: отрицательный префикс отбрасывается, и выравнивается лучший фрагмент";
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
