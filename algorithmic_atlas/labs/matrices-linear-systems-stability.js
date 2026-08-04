(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime, visual = window.AtlasNumericLabRuntime, core = window.MatricesLinearSystemsStabilityCore;
  runtime.boot("matrices-linear-systems-stability", function (root) {
    const shell = runtime.createShell(root, { title: "Матрица, pivot и ошибка решения", description: "Синхронизируйте преобразования строк, остаток, обусловленность и итерационное уточнение" });
    root.classList.add("atlas-numeric-lab");
    shell.controls.innerHTML = '<label>Режим<select data-field="mode"><option value="gaussian">Метод Гаусса</option><option value="conditioning">Обусловленность</option><option value="refinement">Итерационное уточнение</option><option value="strassen">Strassen: A²</option></select></label><label class="atlas-lab__field is-wide">Матрица: строки через ;<textarea data-field="matrix" rows="3">2,1,-1; -3,-1,2; -2,1,2</textarea></label><label class="atlas-lab__field is-wide">Правая часть<input data-field="vector" value="8, -11, -3"></label>';
    const field = function (name) { return shell.controls.querySelector('[data-field="' + name + '"]'); };
    const figure = runtime.createFigure(shell.workspace, { id: "matrix-stability-visual", title: "Расширенная матрица и численная ошибка", viewBox: "0 0 920 560", className: "atlas-numeric-lab__figure" });
    const panel = document.createElement("section"); panel.className = "atlas-lab__panel"; panel.innerHTML = '<h4>Численный диагноз</h4><p data-message></p><dl class="atlas-lab__metrics"><div><dt>Pivot / строка</dt><dd data-pivot>—</dd></div><div><dt>Решение</dt><dd data-solution>—</dd></div><div><dt>Норма residual</dt><dd data-residual>—</dd></div><div><dt>κ∞</dt><dd data-condition>—</dd></div></dl>'; shell.workspace.appendChild(panel);
    function createState() { return core.createState({ mode: field("mode").value, matrix: field("matrix").value, vector: field("vector").value, iterations: 8 }); }
    function render(state) {
      const frame = state.current; visual.clear(figure.svg, "Матричная трасса", frame.message);
      const matrix = frame.matrix || state.inputs.matrix; const active = frame.pivot === null || frame.pivot === undefined ? [] : [[frame.pivot, frame.pivot], frame.target === null || frame.target === undefined ? [frame.pivot, frame.pivot] : [frame.target, frame.pivot]];
      visual.drawMatrix(figure.svg, matrix, { x: 90, y: 90, cell: Math.min(78, 360 / matrix.length), active: active });
      visual.text(figure.svg, 50, 45, frame.mode === "strassen" ? "Семь блоковых произведений" : "PA = LU и проверка b − Ax", "is-strong");
      if (frame.residual) { const scale = Math.max(1e-16, Math.max.apply(null, frame.residual.map(Math.abs))); const gap = frame.residual.length > 1 ? 290 / (frame.residual.length - 1) : 0; const points = frame.residual.map(function (value, index) { return { x: 560 + index * gap, y: 330 - 170 * Math.abs(value) / scale }; }); visual.append(figure.svg, "line", { x1: 540, y1: 330, x2: 880, y2: 330, class: "numeric-guide" }); points.forEach(function (point, index) { visual.append(figure.svg, "line", { x1: point.x, y1: 330, x2: point.x, y2: point.y, class: "numeric-plot-line" }); visual.text(figure.svg, point.x, 355, "r" + index, "is-muted", "middle"); }); }
      panel.querySelector("[data-message]").textContent = frame.message; panel.querySelector("[data-pivot]").textContent = frame.pivot === null || frame.pivot === undefined ? "—" : (frame.pivot + 1) + (frame.target === null || frame.target === undefined ? "" : " / " + (frame.target + 1)); panel.querySelector("[data-solution]").textContent = frame.solution ? frame.solution.map(visual.formatNumber).join(" · ") : "—"; panel.querySelector("[data-residual]").textContent = frame.residualNorm === undefined ? "—" : frame.residualNorm.toExponential(4); panel.querySelector("[data-condition]").textContent = frame.condition === undefined ? "—" : frame.condition.toPrecision(6); figure.caption.textContent = frame.message;
    }
    function bind(api) { shell.controls.querySelectorAll("textarea,input,select").forEach(function (node) { node.addEventListener("change", api.reset); }); }
    runtime.mount(root, { createState: createState, step: core.step, isFinished: core.isFinished, render: render, maxAutomaticSteps: 180, bind: bind });
  });
})();
