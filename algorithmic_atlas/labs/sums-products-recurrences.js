(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SumsProductsRecurrencesCore;
  runtime.boot("sums-products-recurrences", function (root) {
    const shell = runtime.createShell(root, {
      title: "Дерево рекурсии",
      description: "Раскрывайте уровни и сопоставляйте число подзадач, их размеры и стоимость уровня",
    });
    const scenarioOptions = core.SCENARIOS.map(function (item) { return '<option value="' + item.id + '">' + item.label + "</option>"; }).join("");
    shell.controls.innerHTML =
      '<label class="atlas-lab__field is-wide">Рекуррентность<select data-lab-field="scenario">' + scenarioOptions + "</select></label>" +
      '<label>Начальный размер n<input data-lab-field="n" type="number" min="1" max="1048576" value="1024"></label>' +
      '<label>Глубина<input data-lab-field="depth" type="range" min="1" max="10" value="7"><output data-lab-output="depth">7 уровней</output></label>';
    const scenario = shell.controls.querySelector('[data-lab-field="scenario"]');
    const n = shell.controls.querySelector('[data-lab-field="n"]');
    const depth = shell.controls.querySelector('[data-lab-field="depth"]');
    const depthOutput = shell.controls.querySelector('[data-lab-output="depth"]');
    const figure = runtime.createFigure(shell.workspace, { id: "recurrence-tree-visual", title: "Подзадачи и стоимость уровней", viewBox: "0 0 820 500" });
    const tablePanel = document.createElement("div");
    tablePanel.className = "atlas-lab__table-wrap";
    tablePanel.tabIndex = 0;
    tablePanel.innerHTML = '<table><thead><tr><th>Уровень</th><th>Подзадач</th><th>Размер</th><th>Стоимость</th><th>Сумма</th></tr></thead><tbody></tbody></table>';
    shell.workspace.appendChild(tablePanel);
    const body = tablePanel.querySelector("tbody");

    function createState() {
      depthOutput.textContent = depth.value + " уровней";
      return core.createState(scenario.value, Number(n.value), Number(depth.value));
    }
    function render(state) {
      const model = state.model;
      const visible = model.levels.slice(0, state.visibleLevel + 1);
      const svg = figure.svg;
      drawing.clear(svg, "Дерево рекурсии", "Уровни дерева рекурсии и полосы их полной стоимости");
      visible.forEach(function (level, levelIndex) {
        const y = 55 + levelIndex * 55;
        const nodeLimit = Math.min(12, level.visibleSizes.length);
        for (let index = 0; index < nodeLimit; index += 1) {
          const x = 45 + (index + 0.5) * 410 / nodeLimit;
          if (levelIndex > 0) drawing.append(svg, "line", { x1: 250, y1: y - 43, x2: x, y2: y - 12, class: "recurrence-edge" });
          drawing.append(svg, "circle", { cx: x, cy: y, r: 12, class: "recurrence-node" + (levelIndex === state.visibleLevel ? " is-current" : "") });
        }
        if (level.visibleSizes.length > nodeLimit || level.omittedNodes) drawing.text(svg, 470, y + 5, "… × " + level.nodeCount.toString(), "is-muted", "start");
        const barWidth = Math.max(2, 260 * level.costShare);
        drawing.append(svg, "rect", { x: 530, y: y - 13, width: barWidth, height: 26, class: "recurrence-level-bar" });
        drawing.text(svg, 525, y + 5, "L" + level.level, "is-muted", "end");
      });
      body.replaceChildren();
      visible.forEach(function (level) {
        const row = document.createElement("tr");
        if (level.level === state.visibleLevel) row.className = "is-current";
        [level.level, level.nodeCount.toString(), level.minimumSize.toFixed(2) + (level.minimumSize === level.maximumSize ? "" : "…" + level.maximumSize.toFixed(2)), level.levelCost.toFixed(2), level.cumulativeCost.toFixed(2)].forEach(function (value) {
          const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
        });
        body.appendChild(row);
      });
      figure.caption.textContent = model.master.applicable
        ? "Master theorem: " + model.master.relation + ", случай " + model.master.case
        : model.master.reason;
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 14,
      bind: function (api) {
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
        shell.controls.addEventListener("change", function () { api.reset(); });
        depth.addEventListener("input", function () { api.reset(); });
      },
    });
  });
})();
