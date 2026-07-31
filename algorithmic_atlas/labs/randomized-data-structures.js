(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.RandomizedDataStructuresCore;

  runtime.boot("randomized-data-structures", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один набор ключей, разные случайные формы",
      description: "Seed полностью определяет уровни skip list и приоритеты treap; пошаговая вставка показывает форму после каждого ключа",
    });
    shell.controls.innerHTML =
      '<label>Структура<select data-field="mode"><option value="skip">Skip list</option><option value="treap">Treap</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Порядок ключей<input data-field="keys" type="text" value="40,10,70,20,60,30,50"></label>' +
      '<label>Seed<input data-field="seed" type="number" value="42" step="1"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]');
    const keys = shell.controls.querySelector('[data-field="keys"]');
    const seed = shell.controls.querySelector('[data-field="seed"]');
    const figure = runtime.createFigure(shell.workspace, { id: "random-structures-visual", title: "Рандомизированная структура", viewBox: "0 0 920 520" });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<dl class="atlas-lab__metrics"><div><dt>Вставлено</dt><dd data-inserted></dd></div><div><dt>Высота</dt><dd data-height></dd></div><div><dt>Seed</dt><dd data-seed></dd></div></dl><p data-note></p>';
    shell.workspace.appendChild(panel);

    function drawSkip(svg, structure) {
      const sorted = structure.nodes.map(function (node) { return node.key; });
      const xFor = function (key) { return 90 + sorted.indexOf(key) * (720 / Math.max(1, sorted.length - 1)); };
      structure.levels.forEach(function (keysAtLevel, row) {
        const y = 70 + row * 55;
        drawing.text(svg, 38, y + 5, "L" + (structure.height - row), "is-muted", "middle");
        let previousX = 58;
        keysAtLevel.forEach(function (key) {
          const x = xFor(key);
          drawing.append(svg, "line", { x1: previousX, y1: y, x2: x, y2: y, class: "tree-edge" });
          drawing.append(svg, "circle", { cx: x, cy: y, r: 16, class: "structure-node is-active" });
          drawing.text(svg, x, y + 5, key, "is-strong", "middle");
          previousX = x;
        });
      });
    }

    function drawTreap(svg, structure) {
      const sorted = structure.nodes.slice().sort(function (a, b) { return a.key - b.key; });
      const position = new Map();
      sorted.forEach(function (node, index) {
        position.set(node.key, { x: 90 + index * (740 / Math.max(1, sorted.length - 1)), y: 65 + node.depth * 78 });
      });
      structure.edges.forEach(function (edge) {
        const from = position.get(edge.from);
        const to = position.get(edge.to);
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "tree-edge" });
      });
      structure.nodes.forEach(function (node) {
        const point = position.get(node.key);
        drawing.append(svg, "circle", { cx: point.x, cy: point.y, r: 27, class: "structure-node is-active" });
        drawing.text(svg, point.x, point.y - 2, node.key, "is-strong", "middle");
        drawing.text(svg, point.x, point.y + 15, "p=" + node.priority, "is-muted", "middle");
      });
    }

    function drawSamples(svg, samples) {
      const maxHeight = Math.max.apply(null, samples.flatMap(function (item) { return [item.skip, item.treap]; }));
      const baseY = 485;
      samples.forEach(function (sample, index) {
        const x = 62 + index * 50;
        const skipHeight = sample.skip / maxHeight * 70;
        const treapHeight = sample.treap / maxHeight * 70;
        drawing.append(svg, "rect", { x: x, y: baseY - skipHeight, width: 14, height: skipHeight, class: "structure-cost-bar is-actual" });
        drawing.append(svg, "rect", { x: x + 16, y: baseY - treapHeight, width: 14, height: treapHeight, class: "structure-cost-bar is-budget" });
      });
      drawing.text(svg, 62, 397, "Высота для 16 соседних seed: skip list / treap", "is-muted", "start");
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Рандомизированная структура", "Форма skip list или treap и распределение высоты по воспроизводимым seed");
      if (model.mode === "skip") drawSkip(svg, model.structure); else drawTreap(svg, model.structure);
      drawSamples(svg, model.samples);
      shell.workspace.querySelector("[data-inserted]").textContent = model.inserted + " / " + model.total;
      shell.workspace.querySelector("[data-height]").textContent = String(model.structure.height);
      shell.workspace.querySelector("[data-seed]").textContent = String(model.structure.seed);
      shell.workspace.querySelector("[data-note]").textContent = model.mode === "skip"
        ? "Узел присутствует на каждом уровне от 1 до случайно выбранной высоты"
        : "По ключам это BST, по случайным приоритетам — min-heap";
      figure.caption.textContent = "Нижние столбцы не доказывают ожидание, а показывают изменчивость формы на конечной серии воспроизводимых опытов";
    }

    runtime.mount(root, {
      createState: function () { return core.createState(mode.value, keys.value, seed.value); },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 30,
      bind: function (api) {
        shell.controls.addEventListener("change", function () { api.reset(); });
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
      },
    });
  });
})();
