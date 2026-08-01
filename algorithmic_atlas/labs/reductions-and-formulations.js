(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ReductionsAndFormulationsCore;

  runtime.boot("reductions-and-formulations", function (root) {
    const shell = runtime.createShell(root, {
      title: "Одна задача, четыре синхронных языка",
      description: "Меняйте рёбра, бюджет и кандидат: граф, CNF, целочисленные ограничения и дерево состояний пересобираются из одной модели",
    });
    shell.controls.innerHTML =
      '<label>Граф<select data-field="preset"><option value="path">Путь P₄</option><option value="cycle">Цикл C₄</option><option value="triangleTail" selected>Треугольник с хвостом</option><option value="complete">Полный K₄</option></select></label>' +
      '<label>Бюджет k: <output data-output="budget">2</output><input data-field="budget" type="range" min="0" max="4" step="1" value="2"></label>' +
      '<div class="atlas-lab__field is-wide formulation-editor" data-edge-editor></div>' +
      '<div class="atlas-lab__field is-wide formulation-editor" data-selection-editor></div>';
    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      budget: shell.controls.querySelector('[data-field="budget"]'),
      budgetOutput: shell.controls.querySelector('[data-output="budget"]'),
      edges: shell.controls.querySelector("[data-edge-editor]"),
      selection: shell.controls.querySelector("[data-selection-editor]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics formulations-metrics";
    metrics.innerHTML =
      '<div><dt>Графовое покрытие</dt><dd data-metric="graph">—</dd></div>' +
      '<div><dt>SAT</dt><dd data-metric="sat">—</dd></div>' +
      '<div><dt>MIP</dt><dd data-metric="mip">—</dd></div>' +
      '<div><dt>Точный минимум</dt><dd data-metric="optimum">—</dd></div>' +
      '<div><dt>Посещено состояний</dt><dd data-metric="states">0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "reductions-formulations-visual",
      title: "Граф, SAT, MIP и дерево поиска",
      viewBox: "0 0 1200 920",
      className: "formulations-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel formulations-step";
    panel.innerHTML =
      '<h4>Общий смысл</h4><p data-equivalence></p>' +
      '<h4>Текущий шаг дерева</h4><p data-state></p>';
    shell.workspace.appendChild(panel);

    function checkboxEditor(container, title, items, checkedIds, dataName) {
      container.replaceChildren();
      const heading = document.createElement("span");
      heading.className = "formulation-editor__title";
      heading.textContent = title;
      const grid = document.createElement("div");
      grid.className = "formulation-editor__grid";
      items.forEach(function (item) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = item.id;
        input.dataset[dataName] = "";
        input.checked = checkedIds.includes(item.id);
        label.append(input, document.createTextNode(" " + item.label));
        grid.appendChild(label);
      });
      container.append(heading, grid);
    }

    function rebuildEditors(usePresetDefaults) {
      const preset = core.PRESETS[fields.preset.value];
      if (usePresetDefaults) {
        fields.budget.value = String(preset.budget);
        fields.budgetOutput.textContent = fields.budget.value;
      }
      checkboxEditor(
        fields.edges,
        "Рёбра графа",
        core.ALL_EDGES.map(function (edge) { return { id: edge.id, label: edge.u + "—" + edge.v }; }),
        preset.edgeIds,
        "edge"
      );
      checkboxEditor(
        fields.selection,
        "Кандидат S",
        core.VERTICES.map(function (vertex) { return { id: vertex, label: "x" + vertex + " = 1" }; }),
        [],
        "selected"
      );
    }

    function checked(container, selector) {
      return Array.from(container.querySelectorAll(selector + ":checked")).map(function (input) { return input.value; });
    }

    function createState() {
      fields.budgetOutput.textContent = fields.budget.value;
      return core.createState({
        preset: fields.preset.value,
        edgeIds: checked(fields.edges, "[data-edge]"),
        selected: checked(fields.selection, "[data-selected]"),
        budget: Number(fields.budget.value),
      });
    }

    const positions = {
      a: { x: 120, y: 190 }, b: { x: 390, y: 100 },
      c: { x: 390, y: 300 }, d: { x: 120, y: 380 },
    };

    function drawGraph(svg, model) {
      drawing.text(svg, 28, 40, "1 · Графовая формулировка", "formulation-heading");
      model.options.edges.forEach(function (edge) {
        const from = positions[edge.u]; const to = positions[edge.v];
        const covered = model.options.selected.includes(edge.u) || model.options.selected.includes(edge.v);
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "formulation-edge " + (covered ? "is-covered" : "is-uncovered") });
        drawing.text(svg, (from.x + to.x) / 2, (from.y + to.y) / 2 - 10, edge.id, "is-muted", "middle");
      });
      model.vertices.forEach(function (vertex) {
        const point = positions[vertex];
        const selected = model.options.selected.includes(vertex);
        drawing.append(svg, "circle", { cx: point.x, cy: point.y, r: 34, class: "formulation-vertex" + (selected ? " is-selected" : "") });
        drawing.text(svg, point.x, point.y + 6, vertex, "formulation-vertex-label", "middle");
      });
      drawing.text(svg, 28, 430, "S = {" + model.options.selected.join(", ") + "} · |S| = " + model.options.selected.length + " · k = " + model.options.budget, "is-muted");
    }

    function literalText(literal) {
      return literal.startsWith("!") ? "¬x" + literal.slice(1) : "x" + literal;
    }

    function drawSAT(svg, model) {
      drawing.append(svg, "rect", { x: 565, y: 18, width: 610, height: 422, rx: 8, class: "formulation-panel" });
      drawing.text(svg, 590, 52, "2 · SAT / CNF", "formulation-heading");
      model.clauses.slice(0, 11).forEach(function (clause, index) {
        const text = "(" + clause.literals.map(literalText).join(" ∨ ") + ")";
        drawing.text(svg, 600, 88 + index * 28, text, "formulation-constraint " + (clause.satisfied ? "is-good" : "is-bad"));
      });
      if (model.clauses.length > 11) drawing.text(svg, 600, 405, "… ещё " + (model.clauses.length - 11) + " ограничений мощности", "is-muted");
    }

    function drawMIP(svg, model) {
      drawing.append(svg, "rect", { x: 18, y: 470, width: 532, height: 420, rx: 8, class: "formulation-panel" });
      drawing.text(svg, 42, 507, "3 · 0–1 MIP", "formulation-heading");
      drawing.text(svg, 52, 544, "min  xa + xb + xc + xd", "formulation-objective");
      model.mip.edgeConstraints.forEach(function (constraint, index) {
        const edge = model.options.edges.find(function (item) { return item.id === constraint.id; });
        drawing.text(svg, 52, 582 + index * 34,
          "x" + edge.u + " + x" + edge.v + " ≥ 1    [" + constraint.left + "]",
          "formulation-constraint " + (constraint.satisfied ? "is-good" : "is-bad"));
      });
      const budgetY = 582 + model.mip.edgeConstraints.length * 34;
      drawing.text(svg, 52, budgetY, "Σ xv ≤ " + model.options.budget + "    [" + model.mip.budgetLeft + "]", "formulation-constraint " + (model.mip.budgetSatisfied ? "is-good" : "is-bad"));
      drawing.text(svg, 52, Math.min(865, budgetY + 40), "xv ∈ {0,1}", "is-muted");
    }

    function nodePosition(node) {
      if (node.index === 0) return { x: 870, y: 520 };
      const slot = parseInt(node.path || "0", 2);
      return { x: 590 + (slot + 0.5) * 580 / Math.pow(2, node.index), y: 520 + node.index * 82 };
    }

    function drawStateTree(svg, model) {
      drawing.append(svg, "rect", { x: 565, y: 470, width: 610, height: 420, rx: 8, class: "formulation-panel" });
      drawing.text(svg, 590, 507, "4 · Состояния (i, S)", "formulation-heading");
      const points = new Map();
      model.nodes.forEach(function (node) { points.set(node.id, nodePosition(node)); });
      model.nodes.forEach(function (node) {
        if (node.parentId === null) return;
        const from = points.get(node.parentId); const to = points.get(node.id);
        drawing.append(svg, "line", { x1: from.x, y1: from.y + 12, x2: to.x, y2: to.y - 12, class: "formulation-tree-edge " + (node.decision === "one" ? "is-one" : "is-zero") });
      });
      model.nodes.forEach(function (node) {
        const point = points.get(node.id);
        let className = "formulation-tree-node";
        if (!node.visited) className += " is-future";
        else if (node.current) className += " is-current";
        else if (node.status === "solution") className += " is-solution";
        else if (node.status !== "open") className += " is-pruned";
        drawing.append(svg, "circle", { cx: point.x, cy: point.y, r: 12, class: className });
        if (node.index === model.vertices.length || node.current) drawing.text(svg, point.x, point.y + 27, node.path || "∅", "formulation-node-label", "middle");
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Четыре эквивалентные формулировки vertex cover", "Граф, булевы клаузы, целочисленные ограничения и дерево назначений обновляются из одних рёбер, бюджета и кандидата");
      drawGraph(svg, model);
      drawSAT(svg, model);
      drawMIP(svg, model);
      drawStateTree(svg, model);

      metrics.querySelector('[data-metric="graph"]').textContent = model.graphFeasible ? "да" : "нет";
      metrics.querySelector('[data-metric="sat"]').textContent = model.clauses.every(function (clause) { return clause.satisfied; }) ? "истина" : "ложь";
      metrics.querySelector('[data-metric="mip"]').textContent = model.mip.feasible ? "допустимо" : "нарушено";
      metrics.querySelector('[data-metric="optimum"]').textContent = String(model.optimum.length);
      metrics.querySelector('[data-metric="states"]').textContent = model.frame.visitedIds.length + " / " + model.nodes.length;
      panel.querySelector("[data-equivalence]").textContent = model.graphFeasible
        ? "Кандидат покрывает каждое ребро и укладывается в бюджет; поэтому все клаузы истинны, а все 0–1 ограничения допустимы."
        : "Один и тот же дефект виден в четырёх языках: найдите красное ребро, ложную клаузу или нарушенное линейное ограничение.";
      panel.querySelector("[data-state]").textContent = model.frame.message;
      figure.caption.textContent = "Изменение ребра добавляет или удаляет одновременно графовый конфликт, SAT-клаузу и MIP-строку; дерево заново исследует ту же задачу решения";
    }

    rebuildEditors(true);
    const mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 50,
      bind: function (api) {
        fields.preset.addEventListener("change", function () { rebuildEditors(true); api.reset(); });
        fields.budget.addEventListener("input", function () { fields.budgetOutput.textContent = fields.budget.value; api.reset(); });
        fields.edges.addEventListener("change", api.reset);
        fields.selection.addEventListener("change", api.reset);
      },
    });
    mounted.reset();
  });
})();
