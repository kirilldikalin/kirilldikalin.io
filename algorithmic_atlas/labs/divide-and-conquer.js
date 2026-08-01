(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.DivideAndConquerCore;

  runtime.boot("divide-and-conquer", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один вызов вниз, сборка результата вверх",
      description: "Сценарии используют одно ядро: дерево показывает размеры подзадач, работу уровней и postorder-combine",
    });
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="scenario"><option value="binary">Двоичный поиск</option><option value="merge" selected>Сортировка слиянием</option><option value="karatsuba">Карацуба</option><option value="power">Быстрая степень</option><option value="unbalanced">Несбалансированное разбиение</option></select></label>' +
      '<label>Размер входа<select data-field="size"><option value="8">8</option><option value="16" selected>16</option><option value="32">32</option><option value="64">64</option></select></label>' +
      '<div class="atlas-lab__panel"><strong data-recurrence></strong><span data-complexity></span></div>';

    const scenario = shell.controls.querySelector('[data-field="scenario"]');
    const size = shell.controls.querySelector('[data-field="size"]');
    const recurrence = shell.controls.querySelector("[data-recurrence]");
    const complexity = shell.controls.querySelector("[data-complexity]");

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Вызовы открыты</dt><dd data-metric="entered">0</dd></div>' +
      '<div><dt>Результаты собраны</dt><dd data-metric="combined">0</dd></div>' +
      '<div><dt>Последовательная работа</dt><dd data-metric="work">0</dd></div>' +
      '<div><dt>Критический путь</dt><dd data-metric="span">0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "divide-and-conquer-visual",
      title: "Дерево рекурсивных вызовов и стоимость уровней",
      viewBox: "0 0 1200 820",
      className: "divide-conquer-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel divide-conquer-step";
    panel.innerHTML =
      '<h4>Текущий переход</h4><p data-current></p>' +
      '<h4>Баланс и сборка</h4><p data-balance></p>';
    shell.workspace.appendChild(panel);

    function enforceSafeSize() {
      const limit = scenario.value === "karatsuba" ? 32 : scenario.value === "unbalanced" ? 32 : 64;
      Array.from(size.options).forEach(function (option) {
        option.disabled = Number(option.value) > limit;
      });
      if (Number(size.value) > limit) size.value = String(limit);
    }

    function createState() {
      enforceSafeSize();
      const description = core.SCENARIOS[scenario.value];
      recurrence.textContent = description.recurrence;
      complexity.textContent = description.complexity;
      return core.createState({ scenario: scenario.value, size: Number(size.value) });
    }

    function layout(tree) {
      const byId = new Map(tree.nodes.map(function (node) { return [node.id, node]; }));
      const positions = new Map();
      let leafIndex = 0;
      function place(id) {
        const node = byId.get(id);
        if (node.childIds.length === 0) {
          const x = leafIndex++;
          positions.set(id, { leaf: x });
          return x;
        }
        const children = node.childIds.map(place);
        const x = children.reduce(function (sum, value) { return sum + value; }, 0) / children.length;
        positions.set(id, { leaf: x });
        return x;
      }
      place(0);
      const leaves = Math.max(1, leafIndex);
      const width = Math.max(1200, Math.min(4200, leaves * 42 + 120));
      tree.nodes.forEach(function (node) {
        const point = positions.get(node.id);
        point.x = 60 + point.leaf * (width - 120) / Math.max(1, leaves - 1);
        point.y = 62 + node.depth * (525 / Math.max(1, tree.maximumDepth));
      });
      return { positions: positions, width: width };
    }

    function render(state) {
      const model = core.visualModel(state);
      const tree = model.tree;
      const geometry = layout(tree);
      const svg = figure.svg;
      svg.setAttribute("viewBox", "0 0 " + geometry.width + " 820");
      svg.style.minWidth = geometry.width + "px";
      drawing.clear(
        svg,
        "Дерево рекурсии " + tree.description.title,
        "Размеры подзадач, движение стека вниз, postorder-сборка и стоимость каждого уровня"
      );

      model.nodes.forEach(function (node) {
        if (node.parentId === null) return;
        const from = geometry.positions.get(node.parentId);
        const to = geometry.positions.get(node.id);
        drawing.append(svg, "line", {
          x1: from.x, y1: from.y + 15, x2: to.x, y2: to.y - 15,
          class: "recursion-edge is-" + node.status,
        });
      });
      model.nodes.forEach(function (node) {
        const point = geometry.positions.get(node.id);
        drawing.append(svg, "circle", {
          cx: point.x, cy: point.y, r: 16,
          class: "recursion-node is-" + node.status,
        });
        drawing.text(svg, point.x, point.y + 4, node.size, "recursion-size", "middle");
        if (node.status === "current") {
          drawing.text(svg, point.x, point.y - 24, model.event.type === "enter" ? "divide" : model.event.type, "is-muted", "middle");
        }
      });

      const maximumLevelWork = Math.max.apply(null, tree.levels.map(function (level) { return level.work; }));
      const barWidth = Math.max(18, (geometry.width - 150) / tree.levels.length - 10);
      tree.levels.forEach(function (level, index) {
        const height = 92 * level.work / Math.max(1, maximumLevelWork);
        const x = 75 + index * (barWidth + 10);
        drawing.append(svg, "rect", {
          x: x, y: 770 - height, width: barWidth, height: height,
          class: "recursion-level-bar" + (model.event && tree.nodes[model.event.nodeId].depth === level.depth ? " is-current" : ""),
        });
        drawing.text(svg, x + barWidth / 2, 791, "ℓ=" + level.depth, "is-muted", "middle");
        drawing.text(svg, x + barWidth / 2, 665, "W=" + level.work, "is-muted", "middle");
      });

      metrics.querySelector('[data-metric="entered"]').textContent = model.enteredCount + " / " + tree.nodes.length;
      metrics.querySelector('[data-metric="combined"]').textContent = model.completedCount + " / " + tree.nodes.length;
      metrics.querySelector('[data-metric="work"]').textContent = String(tree.totalWork);
      metrics.querySelector('[data-metric="span"]').textContent = String(tree.span);
      const currentNode = tree.nodes[model.event.nodeId];
      panel.querySelector("[data-current]").textContent =
        model.event.message + ". Активный размер: " + currentNode.size +
        ", локальная стоимость: " + currentNode.localCost +
        ", стек: " + model.event.stack.map(function (id) { return tree.nodes[id].size; }).join(" → ") + ".";
      const balanced = tree.options.scenario === "merge" || tree.options.scenario === "karatsuba";
      panel.querySelector("[data-balance]").textContent = balanced
        ? "Подзадачи имеют близкие размеры. После их возврата combine активируется снизу вверх; столбцы показывают суммарную работу уровней."
        : tree.options.scenario === "unbalanced"
          ? "Одна ветвь уменьшается лишь на единицу. Глубина становится линейной, а суммы уровней образуют квадратичную работу."
          : "Это decrease-and-conquer: продолжает вычисление только одна подзадача, поэтому дерево вырождается в путь.";
      figure.caption.textContent = tree.description.recurrence + " · " + tree.description.complexity +
        ". Зелёные узлы уже вернули результат, акцентный узел выполняет divide или combine";
    }

    const api = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 2300,
      bind: function (mounted) {
        scenario.addEventListener("change", function () {
          enforceSafeSize();
          mounted.reset();
        });
        size.addEventListener("change", mounted.reset);
      },
    });
    enforceSafeSize();
    api.reset();
  });
})();
