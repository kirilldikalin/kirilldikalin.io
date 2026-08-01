(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ExhaustiveSearchCore;

  runtime.boot("exhaustive-search", function (root) {
    const shell = runtime.createShell(root, {
      title: "Дерево subset sum: что именно отсекается",
      description: "Ищем наибольшую сумму, не превосходящую цель; каждый переключатель меняет реальное дерево обхода",
    });
    shell.controls.innerHTML =
      '<label>Набор<select data-field="preset"><option value="classic">7, 5, 4, 3, 2, 1</option><option value="tight">9, 8, 6, 5, 4, 3, 2</option><option value="bound">12, 11, 8, 7, 5, 4, 3</option></select></label>' +
      '<label>Цель: <output data-output="target"></output><input data-field="target" type="range" min="1" value="12"></label>' +
      '<label>Порядок ветвей<select data-field="order"><option value="include-first">Сначала взять</option><option value="exclude-first">Сначала пропустить</option></select></label>' +
      '<label>Стартовый incumbent<select data-field="incumbent"><option value="empty">Пустое решение</option><option value="greedy">Жадное допустимое</option></select></label>' +
      '<label class="atlas-lab__check"><input data-field="pruning" type="checkbox" checked> Отсекать недопустимые суммы</label>' +
      '<label class="atlas-lab__check"><input data-field="bound" type="checkbox" checked> Использовать optimistic bound</label>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      target: shell.controls.querySelector('[data-field="target"]'),
      order: shell.controls.querySelector('[data-field="order"]'),
      incumbent: shell.controls.querySelector('[data-field="incumbent"]'),
      pruning: shell.controls.querySelector('[data-field="pruning"]'),
      bound: shell.controls.querySelector('[data-field="bound"]'),
      targetOutput: shell.controls.querySelector('[data-output="target"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Посещено</dt><dd data-metric="visited">0</dd></div>' +
      '<div><dt>Отсечено</dt><dd data-metric="pruned">0</dd></div>' +
      '<div><dt>Frontier</dt><dd data-metric="frontier">0</dd></div>' +
      '<div><dt>Incumbent</dt><dd data-metric="incumbent">0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "exhaustive-search-visual",
      title: "Полноширинное дерево включения и исключения",
      viewBox: "0 0 1200 720",
      className: "exhaustive-search-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel exhaustive-search-step";
    panel.innerHTML =
      '<h4>Текущий узел</h4><p data-current></p>' +
      '<h4>Инвариант incumbent</h4><p data-invariant></p>';
    shell.workspace.appendChild(panel);

    function currentOptions() {
      const selected = core.PRESETS[fields.preset.value];
      return {
        items: selected.items,
        target: Number(fields.target.value),
        branchOrder: fields.order.value,
        incumbentMode: fields.incumbent.value,
        useFeasibilityPruning: fields.pruning.checked,
        useBound: fields.bound.checked,
      };
    }

    function syncPreset(resetTarget) {
      const selected = core.PRESETS[fields.preset.value];
      const total = selected.items.reduce(function (sum, value) { return sum + value; }, 0);
      fields.target.max = String(total);
      if (resetTarget) fields.target.value = String(selected.target);
      fields.targetOutput.textContent = fields.target.value;
    }

    function createState() {
      syncPreset(false);
      return core.createState(currentOptions());
    }

    function nodePosition(node, depthCount, width) {
      if (node.depth === 0) return { x: width / 2, y: 62 };
      const slot = parseInt(node.path || "0", 2);
      return {
        x: (slot + 0.5) * width / Math.pow(2, node.depth),
        y: 62 + node.depth * (590 / Math.max(1, depthCount)),
      };
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const depthCount = model.options.items.length;
      const visualWidth = Math.max(1200, Math.pow(2, depthCount) * 22);
      const svg = figure.svg;
      svg.setAttribute("viewBox", "0 0 " + visualWidth + " 720");
      svg.style.minWidth = visualWidth + "px";
      drawing.clear(
        svg,
        "Дерево поиска subset sum",
        "Посещённые узлы, отсечённые ветви, текущий узел и значение incumbent"
      );

      const positions = new Map();
      model.nodes.forEach(function (node) {
        positions.set(node.id, nodePosition(node, depthCount, visualWidth));
      });
      model.nodes.forEach(function (node) {
        if (node.parentId === null || !positions.has(node.parentId)) return;
        const from = positions.get(node.parentId);
        const to = positions.get(node.id);
        drawing.append(svg, "line", {
          x1: from.x, y1: from.y + 14, x2: to.x, y2: to.y - 14,
          class: "search-tree-edge " + (node.decision === "include" ? "is-include" : "is-exclude"),
        });
      });
      model.nodes.forEach(function (node) {
        const position = positions.get(node.id);
        let className = "search-tree-node";
        if (node.current) className += " is-current";
        else if (node.prunedReason) className += " is-pruned";
        else className += " is-visited";
        drawing.append(svg, "circle", { cx: position.x, cy: position.y, r: 14, class: className });
        drawing.text(svg, position.x, position.y + 4, node.sum, "search-tree-value", "middle");
        if (node.prunedReason) {
          drawing.text(svg, position.x + 18, position.y - 12, node.prunedReason === "bound" ? "bound" : "×", "is-muted", "start");
        }
      });

      const current = model.nodes.find(function (node) { return node.current; });
      drawing.text(svg, 24, 696, "1 — взять очередное число · 0 — пропустить · пунктир — ветвь 0", "is-muted", "start");
      metrics.querySelector('[data-metric="visited"]').textContent = String(frame.visited);
      metrics.querySelector('[data-metric="pruned"]').textContent = String(frame.pruned);
      metrics.querySelector('[data-metric="frontier"]').textContent = String(frame.frontierIds.length);
      metrics.querySelector('[data-metric="incumbent"]').textContent = frame.incumbentValue + " / " + model.options.target;
      panel.querySelector("[data-current]").textContent = current
        ? "Путь " + (current.path || "корень") + ": сумма " + current.sum +
          ", верхняя оценка " + (Number.isFinite(current.optimisticBound) ? current.optimisticBound : "нет допустимого продолжения") +
          ". " + frame.message
        : frame.message;
      panel.querySelector("[data-invariant]").textContent =
        "Incumbent всегда является суммой реально выбранного допустимого подмножества. Сейчас это " +
        frame.incumbentValue + " из индексов {" + frame.incumbentSelection.join(", ") + "}. " +
        (state.finished ? "Полный эталон подтверждает оптимум " + model.optimum.value + "." : "Неисследованные ветви остаются во frontier.");
      figure.caption.textContent = "Узлов в полном текущем обходе: " + model.totalVisited +
        ". Порядок ветвления влияет на момент появления сильного incumbent и тем самым на число отсечений";
    }

    const api = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 1100,
      bind: function (mounted) {
        fields.preset.addEventListener("change", function () {
          syncPreset(true);
          mounted.reset();
        });
        fields.target.addEventListener("input", function () {
          fields.targetOutput.textContent = fields.target.value;
          mounted.reset();
        });
        [fields.order, fields.incumbent, fields.pruning, fields.bound].forEach(function (field) {
          field.addEventListener("change", mounted.reset);
        });
      },
    });
    syncPreset(true);
    api.reset();
  });
})();
