(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const sequence = window.AtlasSequenceLabRuntime;
  const core = window.BwtFmIndexCore;

  runtime.boot("bwt-fm-index", function (root) {
    root.classList.add("atlas-specialized-lab");
    const shell = runtime.createShell(root, {
      title: "От перестановки BWT к обратному поиску FM-index",
      description: "Постройте матрицу циклических сдвигов, сравните столбцы F и L и шаг за шагом сужайте интервал строк, начинающихся с образца",
    });
    shell.controls.innerHTML =
      '<label>Текст<input data-field="text" value="банан" maxlength="48" spellcheck="false"></label>' +
      '<label>Образец<input data-field="pattern" value="ана" maxlength="24" spellcheck="false"></label>' +
      '<label>Показать<select data-field="view"><option value="fm">FM-поиск</option><option value="bwt">Матрица BWT</option><option value="rle">Серии в L</option></select></label>';
    const fields = {};
    ["text", "pattern", "view"].forEach(function (name) {
      fields[name] = shell.controls.querySelector('[data-field="' + name + '"]');
    });
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML = '<div><dt>Кадр</dt><dd data-metric="frame">0</dd></div>' +
      '<div><dt>Интервал [l, r)</dt><dd data-metric="interval">—</dd></div>' +
      '<div><dt>Число вхождений</dt><dd data-metric="count">0</dd></div>' +
      '<div><dt>Серий в L</dt><dd data-metric="runs">0</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "bwt-fm-index-visual", title: "BWT и LF-отображение", viewBox: "0 0 920 600",
    });
    const matrixViewport = document.createElement("div");
    matrixViewport.className = "atlas-bwt-matrix-viewport";
    matrixViewport.tabIndex = 0;
    matrixViewport.setAttribute("role", "region");
    matrixViewport.setAttribute("aria-label", "Прокручиваемая матрица BWT");
    figure.svg.before(matrixViewport);
    matrixViewport.appendChild(figure.svg);
    const detail = document.createElement("section");
    detail.className = "atlas-lab__panel";
    detail.innerHTML = '<h4>Шаг backward search</h4><p data-step></p>' +
      '<div class="atlas-lab__formula-strip"><code data-formula></code></div>';
    shell.workspace.appendChild(detail);

    function createState() {
      return core.createState({ text: fields.text.value, pattern: fields.pattern.value });
    }

    function drawBwt(state) {
      const rotations = state.indexData.rotations;
      const canvasHeight = core.matrixViewportHeight(rotations.length);
      figure.svg.setAttribute("viewBox", "0 0 920 " + canvasHeight);
      const lfPath = state.indexData.lfPath;
      const lfSource = lfPath[state.index % lfPath.length];
      const lfTarget = state.indexData.lf[lfSource];
      const visibleRows = fields.view.value === "bwt" ? rotations.length : state.frame.right;
      const cell = Math.min(34, 720 / Math.max(1, rotations[0].length));
      rotations.forEach(function (row, rowIndex) {
        const active = rowIndex >= state.frame.left && rowIndex < state.frame.right;
        Array.from(row).forEach(function (symbol, column) {
          const isFirst = column === 0;
          const isLast = column === row.length - 1;
          let cellClass = active ? "is-a" : "atlas-lab__grid-line";
          if (isFirst) cellClass = rowIndex === lfTarget ? "is-good" : "is-b";
          if (isLast) cellClass = rowIndex === lfSource ? "is-c" : "is-a";
          drawing.append(figure.svg, "rect", { x: 100 + column * cell, y: 55 + rowIndex * 38,
            width: cell, height: 32, class: cellClass,
            opacity: rowIndex < visibleRows || fields.view.value === "bwt" ? 1 : 0.22 });
          drawing.text(figure.svg, 100 + column * cell + cell / 2, 77 + rowIndex * 38,
            symbol, column === row.length - 1 ? "is-strong" : "", "middle");
        });
      });
      drawing.text(figure.svg, 56, 78, "F", "is-strong", "middle");
      drawing.text(figure.svg, 100 + (rotations[0].length - 1) * cell + cell / 2,
        35, "L", "is-strong", "middle");
      const sourceX = 100 + (rotations[0].length - 1) * cell + cell;
      const sourceY = 71 + lfSource * 38;
      const targetX = 100;
      const targetY = 71 + lfTarget * 38;
      drawing.append(figure.svg, "path", { d: "M " + sourceX + " " + sourceY +
        " C " + (sourceX + 90) + " " + sourceY + ", " + (targetX + 90) + " " + targetY +
        ", " + targetX + " " + targetY, class: "is-c", fill: "none" });
      drawing.append(figure.svg, "path", { d: "M " + targetX + " " + targetY +
        " l 12 -7 l 0 14 z", class: "is-c" });
      drawing.text(figure.svg, 455, canvasHeight - 30,
        "LF(" + lfSource + ") = " + lfTarget + ": одинаковый символ и одинаковый ранг",
        "is-strong", "middle");
    }

    function drawRuns(state) {
      figure.svg.setAttribute("viewBox", "0 0 920 600");
      const runs = core.runLength(state.indexData.last);
      let x = 70;
      runs.forEach(function (run, index) {
        const width = 720 * run.length / state.indexData.last.length;
        drawing.append(figure.svg, "rect", { x: x, y: 170, width: width, height: 150,
          class: index % 2 ? "is-b" : "is-a" });
        drawing.text(figure.svg, x + width / 2, 238, run.symbol, "is-strong", "middle");
        drawing.text(figure.svg, x + width / 2, 270, "×" + run.length, "", "middle");
        x += width;
      });
      drawing.text(figure.svg, 70, 110, "L = " + state.indexData.last, "is-strong");
      drawing.text(figure.svg, 70, 380,
        "Сжатие серий эффективно, когда похожие контексты собирают одинаковые символы рядом",
        "is-muted");
    }

    function render(state) {
      drawing.clear(figure.svg, "Преобразование Барроуза — Уилера",
        "Матрица сдвигов, последний столбец и текущий FM-интервал");
      if (fields.view.value === "rle") drawRuns(state); else drawBwt(state);
      const frame = state.frame;
      const runs = core.runLength(state.indexData.last);
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.index + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="interval"]').textContent = "[" + frame.left + ", " + frame.right + ")";
      metrics.querySelector('[data-metric="count"]').textContent = String(frame.count);
      metrics.querySelector('[data-metric="runs"]').textContent = String(runs.length);
      detail.querySelector("[data-step]").textContent = frame.finished
        ? "Обратный поиск завершён: ширина интервала равна числу вхождений"
        : "Добавляем символ «" + frame.symbol + "» слева и оставляем только строки с таким первым символом";
      detail.querySelector("[data-formula]").textContent = frame.finished ?
        "|[l,r)| = " + frame.count :
        "l′ = C[c] + Occ(c,l),  r′ = C[c] + Occ(c,r)";
      figure.caption.textContent = "BWT обратима, хотя похожие контексты группируются; FM-index ищет, не восстанавливая исходную строку";
    }

    const mounted = runtime.mount(root, { createState: createState, step: core.step,
      render: render, isFinished: function (state) { return state.frame.finished; },
      maxAutomaticSteps: 100 });
    shell.controls.addEventListener("change", function (event) {
      if (event.target === fields.view) mounted.render(); else mounted.reset();
    });
    fields.text.addEventListener("input", mounted.reset);
    fields.pattern.addEventListener("input", mounted.reset);
  });
})();
