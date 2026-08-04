(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime, visual = window.AtlasNumericLabRuntime, core = window.MatricesLinearSystemsStabilityCore;
  runtime.boot("matrices-linear-systems-stability", function (root) {
    const shell = runtime.createShell(root, { title: "Матрица, pivot и ошибка решения", description: "Синхронизируйте преобразования строк, остаток, обусловленность и итерационное уточнение" });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Режим<select data-field="mode"><option value="gaussian">Метод Гаусса</option><option value="conditioning">Обусловленность и ошибки</option><option value="refinement">Итерационное уточнение</option><option value="strassen">Блоки и Strassen: A²</option></select></label><div class="atlas-lab__field is-wide"><span>Готовые входы</span><button type="button" data-preset="classic">Перестановка pivot</button><button type="button" data-preset="sensitive">Чувствительная система</button><button type="button" data-preset="hilbert">Гильберт 4×4</button></div><label class="atlas-lab__field is-wide">Матрица: строки через ;<textarea data-field="matrix" rows="3">2,1,-1; -3,-1,2; -2,1,2</textarea></label><label class="atlas-lab__field is-wide">Правая часть<input data-field="vector" value="8, -11, -3"></label>';
    const field = function (name) { return shell.controls.querySelector('[data-field="' + name + '"]'); };
    const figure = runtime.createFigure(shell.workspace, { id: "matrix-stability-visual", title: "Расширенная матрица и численная ошибка", viewBox: "0 0 920 560", className: "atlas-numeric-lab__figure" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel"; panel.innerHTML = '<h4>Численный диагноз</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Pivot / строка</dt><dd data-pivot>—</dd></div><div><dt>Решение</dt><dd data-solution>—</dd></div><div><dt>Норма residual</dt><dd data-residual>—</dd></div><div><dt>Forward error</dt><dd data-forward>—</dd></div><div><dt>Backward error</dt><dd data-backward>—</dd></div><div><dt>κ∞</dt><dd data-condition>—</dd></div></dl>'; shell.workspace.appendChild(panel);
    function createState() { return core.createState({ mode: field("mode").value, matrix: field("matrix").value, vector: field("vector").value, iterations: 8 }); }
    function drawResidualHistory(svg, frame) {
      if (!frame.history || !frame.history.length) return;
      const left = 530, top = 105, width = 330, height = 225;
      visual.text(svg, left, 75, "История ||b − Ax||∞", "is-strong");
      visual.append(svg, "line", { x1: left, y1: top + height, x2: left + width, y2: top + height, class: "numeric-guide" });
      visual.append(svg, "line", { x1: left, y1: top, x2: left, y2: top + height, class: "numeric-guide" });
      const logs = frame.history.map(function (value) { return Math.log10(Math.max(value, 1e-18)); });
      const min = Math.min(-16, ...logs), max = Math.max(-2, ...logs), span = Math.max(1, max - min);
      const points = logs.map(function (value, index) { return { x: left + (frame.history.length === 1 ? 0 : index * width / (frame.history.length - 1)), y: top + (max - value) * height / span }; });
      visual.drawPolyline(svg, points, { className: "numeric-plot-line" });
      points.forEach(function (point, index) { visual.append(svg, "circle", { cx: point.x, cy: point.y, r: 5, class: "numeric-matrix-cell is-active", "data-visual-part": "residual-point", "data-iteration": index }); });
      visual.text(svg, left, top + height + 28, "итерация", "is-muted");
      visual.text(svg, left + width, top + height + 28, String(frame.history.length - 1), "is-muted", "end");
    }
    function drawConditioning(svg, frame) {
      visual.drawMatrix(svg, frame.matrix, { x: 70, y: 120, cell: Math.min(68, 280 / frame.matrix.length), active: [] });
      visual.text(svg, 55, 75, "Одна система — четыре разных диагноза", "is-strong");
      const values = [
        ["входное возмущение", frame.inputRelative],
        ["forward error", frame.forwardError],
        ["backward error", frame.backwardError],
        ["граница κ·возмущение", frame.conditionBound]
      ];
      values.forEach(function (entry, index) {
        const y = 130 + index * 82;
        const defined = Number.isFinite(entry[1]);
        const log = defined ? Math.log10(Math.max(entry[1], 1e-18)) : -18;
        const width = defined ? Math.max(3, Math.min(330, (log + 18) / 20 * 330)) : 0;
        visual.text(svg, 500, y, entry[0], index === 1 ? "is-strong" : "is-muted");
        visual.append(svg, "rect", { x: 500, y: y + 14, width: 330, height: 22, class: "numeric-cell" });
        if (defined) visual.append(svg, "rect", { x: 500, y: y + 14, width: width, height: 22, class: index === 1 ? "numeric-cell is-active" : "numeric-matrix-cell", "data-visual-part": "error-bar", "data-error-kind": entry[0] });
        visual.text(svg, 842, y + 31, defined ? entry[1].toExponential(3) : "не определено", "numeric-cell-label", "end");
      });
      visual.text(svg, 500, 490, "Шкала логарифмическая: длина показывает порядок величины", "is-muted");
    }
    function drawStrassen(svg, frame) {
      const showResult = frame.phase === "combine" || frame.phase === "done";
      const left = frame.left || null;
      const right = frame.right || null;
      const matrix = showResult ? (frame.result || frame.matrix) : left;
      const y = 130;
      visual.text(svg, 55, 70, showResult ? "Собранный текущий блок" : "Фактическая пара текущих блоков", "is-strong");
      if (showResult) {
        const cell = Math.min(52, 300 / matrix.length);
        visual.text(svg, 55, 105, "результат", "is-muted");
        visual.drawMatrix(svg, matrix, { x: 70, y: y, cell: cell, active: [] });
      } else {
        const cell = Math.min(44, 150 / left.length);
        const leftX = 55;
        const rightX = 255;
        visual.text(svg, leftX, 105, "левый блок", "is-muted");
        visual.text(svg, rightX, 105, "правый блок", "is-muted");
        visual.drawMatrix(svg, left, { x: leftX, y: y, cell: cell, active: [] });
        visual.drawMatrix(svg, right, { x: rightX, y: y, cell: cell, active: [] });
        visual.text(svg, 228, y + left.length * cell / 2 + 5, "×", "is-strong", "middle");
        if (frame.phase === "split") {
          [leftX, rightX].forEach(function (x) {
            const splitX = x + left.length * cell / 2;
            const splitY = y + left.length * cell / 2;
            visual.append(svg, "line", { x1: splitX, y1: y, x2: splitX, y2: y + left.length * cell, class: "numeric-plot-line" });
            visual.append(svg, "line", { x1: x, y1: splitY, x2: x + left.length * cell, y2: splitY, class: "numeric-plot-line" });
          });
        }
      }
      const formulas = ["(A11+A22)(B11+B22)", "(A21+A22)B11", "A11(B12−B22)", "A22(B21−B11)", "(A11+A12)B22", "(A21−A11)(B11+B12)", "(A12−A22)(B21+B22)"];
      formulas.forEach(function (formula, index) {
        const product = "M" + (index + 1), rowY = 105 + index * 55, active = frame.product === product;
        visual.append(svg, "rect", { x: 470, y: rowY, width: 410, height: 42, rx: 3, class: active ? "numeric-cell is-active" : "numeric-cell", "data-visual-part": "strassen-product", "data-product": product });
        visual.text(svg, 485, rowY + 26, product + " = " + formula, "numeric-cell-label");
      });
      visual.text(svg, 70, 510, "глубина " + frame.depth + " · блок " + frame.size + "×" + frame.size + " · путь " + (frame.path || "A²"), "is-muted");
      visual.text(svg, 70, 540, frame.phase === "split" ? "Блок делится; далее вычисляются M1…M7" : frame.phase === "base" ? "Базовый блок умножается обычным способом" : "Произведения собираются обратно в C11…C22", "is-strong");
    }
    function render(state) {
      const frame = state.current; visual.clear(figure.svg, "Матричная трасса", frame.message);
      if (frame.mode === "strassen") drawStrassen(figure.svg, frame);
      else if (frame.mode === "conditioning") drawConditioning(figure.svg, frame);
      else {
        const matrix = frame.matrix || state.inputs.matrix; const active = frame.pivot === null || frame.pivot === undefined ? [] : [[frame.pivot, frame.pivot], frame.target === null || frame.target === undefined ? [frame.pivot, frame.pivot] : [frame.target, frame.pivot]];
        visual.drawMatrix(figure.svg, matrix, { x: 70, y: 100, cell: Math.min(72, 360 / matrix.length), active: active });
        visual.text(figure.svg, 50, 55, "PA = LU и проверка b − Ax", "is-strong");
        if (frame.mode === "refinement") drawResidualHistory(figure.svg, frame);
        else if (frame.residual) { const scale = Math.max(1e-16, Math.max.apply(null, frame.residual.map(Math.abs))); const gap = frame.residual.length > 1 ? 290 / (frame.residual.length - 1) : 0; const points = frame.residual.map(function (value, index) { return { x: 560 + index * gap, y: 330 - 170 * Math.abs(value) / scale }; }); visual.append(figure.svg, "line", { x1: 540, y1: 330, x2: 880, y2: 330, class: "numeric-guide" }); points.forEach(function (point, index) { visual.append(figure.svg, "line", { x1: point.x, y1: 330, x2: point.x, y2: point.y, class: "numeric-plot-line" }); visual.text(figure.svg, point.x, 355, "r" + index, "is-muted", "middle"); }); }
      }
      panel.querySelector("[data-message]").textContent = frame.message; panel.querySelector("[data-pivot]").textContent = frame.pivot === null || frame.pivot === undefined ? "—" : (frame.pivot + 1) + (frame.target === null || frame.target === undefined ? "" : " / " + (frame.target + 1)); panel.querySelector("[data-solution]").textContent = frame.solution ? frame.solution.map(visual.formatNumber).join(" · ") : "—"; panel.querySelector("[data-residual]").textContent = frame.residualNorm === undefined ? "—" : frame.residualNorm.toExponential(4); panel.querySelector("[data-forward]").textContent = Number.isFinite(frame.forwardError) ? frame.forwardError.toExponential(4) : frame.forwardError === null ? "не определено" : "—"; panel.querySelector("[data-backward]").textContent = frame.backwardError === undefined ? "—" : frame.backwardError.toExponential(4); panel.querySelector("[data-condition]").textContent = frame.condition === undefined ? "—" : frame.condition.toPrecision(6); figure.caption.textContent = frame.message;
    }
    function bind(api) {
      shell.controls.querySelectorAll("textarea,input,select").forEach(function (node) { node.addEventListener("change", api.reset); });
      const presets = {
        classic: ["2,1,-1; -3,-1,2; -2,1,2", "8, -11, -3"],
        sensitive: ["10,7,8; 7,5,6; 8,6,10", "1,2,3"],
        hilbert: ["1,0.5,0.3333333333333333,0.25; 0.5,0.3333333333333333,0.25,0.2; 0.3333333333333333,0.25,0.2,0.1666666666666667; 0.25,0.2,0.1666666666666667,0.1428571428571429", "2.083333333333333,1.283333333333333,0.95,0.75952380952381"]
      };
      shell.controls.querySelectorAll("[data-preset]").forEach(function (button) { button.addEventListener("click", function () { const preset = presets[button.dataset.preset]; field("matrix").value = preset[0]; field("vector").value = preset[1]; api.reset(); }); });
    }
    runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: 180, bind: bind });
  });
})();
