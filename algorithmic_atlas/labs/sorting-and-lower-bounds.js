(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SortingAndLowerBoundsCore;

  runtime.boot("sorting-and-lower-bounds", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один массив, четыре сортировки и дерево решений",
      description: "Сравнивайте не абстрактные названия, а перестановки, записи, глубину и память на одном входе; затем переключитесь к информационной нижней границе",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="sorting">Ход сортировки</option><option value="decision">Decision tree</option></select></label>' +
      '<label data-sort-control>Алгоритм<select data-field="algorithm"><option value="insertion">Insertion sort</option><option value="merge">Merge sort</option><option value="heap">Heapsort</option><option value="quick">Quicksort</option></select></label>' +
      '<label data-sort-control>Pivot quicksort<select data-field="pivot"><option value="median3">Медиана трёх</option><option value="random">Случайный</option><option value="last">Последний</option></select></label>' +
      '<label class="atlas-lab__field is-wide" data-sort-control>Массив<input data-field="values" type="text" value="7,2,5,2,9,1,6,3"></label>' +
      '<label data-sort-control>Seed<input data-field="seed" type="number" value="43" min="1" max="4294967295"></label>' +
      '<label data-decision-control hidden>Число элементов n<select data-field="decision-n"><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option></select></label>';

    const mode = shell.controls.querySelector('[data-field="mode"]');
    const algorithm = shell.controls.querySelector('[data-field="algorithm"]');
    const pivot = shell.controls.querySelector('[data-field="pivot"]');
    const values = shell.controls.querySelector('[data-field="values"]');
    const seed = shell.controls.querySelector('[data-field="seed"]');
    const decisionN = shell.controls.querySelector('[data-field="decision-n"]');
    const sortControls = shell.controls.querySelectorAll("[data-sort-control]");
    const decisionControls = shell.controls.querySelectorAll("[data-decision-control]");
    const figure = runtime.createFigure(shell.workspace, {
      id: "sorting-lab-visual",
      title: "Состояние сортировки",
      viewBox: "0 0 1000 590",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel sorting-lab__panel";
    panel.innerHTML =
      '<h4>Текущий шаг</h4><p data-message></p>' +
      '<dl class="atlas-lab__metrics sorting-lab__metrics">' +
      '<div><dt>Сравнения</dt><dd data-comparisons>—</dd></div>' +
      '<div><dt>Записи</dt><dd data-writes>—</dd></div>' +
      '<div><dt>Перестановки</dt><dd data-swaps>—</dd></div>' +
      '<div><dt>Глубина</dt><dd data-depth>—</dd></div>' +
      '<div><dt>Доп. ячейки</dt><dd data-memory>—</dd></div>' +
      '<div><dt>Свойства</dt><dd data-properties>—</dd></div></dl>';
    shell.workspace.appendChild(panel);

    function marked(marks, name, index) {
      const value = marks && marks[name];
      return Array.isArray(value) && value.includes(index);
    }

    function drawSorting(model) {
      const svg = figure.svg;
      const frame = model.frame;
      drawing.clear(svg, "Ход сортировки", "Массив, активные сравнения и накопленные метрики");
      const array = frame.array;
      const cellWidth = Math.min(96, 820 / array.length);
      const startX = (1000 - cellWidth * array.length) / 2;
      const baseline = 410;
      const maxMagnitude = Math.max.apply(null, array.map(function (item) {
        return Math.abs(item.value);
      }).concat([1]));
      array.forEach(function (item, index) {
        const height = 55 + Math.abs(item.value) / maxMagnitude * 180;
        const x = startX + index * cellWidth;
        let className = "sorting-bar";
        if (marked(frame.marks, "compared", index)) className += " is-compared";
        if (marked(frame.marks, "swapped", index)) className += " is-swapped";
        if (frame.marks && frame.marks.pivot === index) className += " is-pivot";
        if (frame.marks && frame.marks.active === index) className += " is-active";
        const sortedRange = frame.marks && frame.marks.sortedRange;
        if (sortedRange && index >= sortedRange[0] && index < sortedRange[1]) {
          className += " is-sorted";
        }
        drawing.append(svg, "rect", {
          x: x + 5,
          y: baseline - height,
          width: cellWidth - 10,
          height: height,
          rx: 5,
          class: className,
        });
        drawing.text(svg, x + cellWidth / 2, baseline - height - 12, item.value,
          "is-strong", "middle");
        drawing.text(svg, x + cellWidth / 2, baseline + 26, "a[" + index + "]",
          "is-muted", "middle");
        drawing.text(svg, x + cellWidth / 2, baseline + 44, "id " + item.id,
          "is-muted", "middle");
      });
      if (frame.marks && frame.marks.range) {
        const left = startX + frame.marks.range[0] * cellWidth;
        const right = startX + frame.marks.range[1] * cellWidth;
        drawing.append(svg, "path", {
          d: "M" + left + " 485v14H" + right + "v-14",
          class: "sorting-range",
        });
        drawing.text(svg, (left + right) / 2, 525, "активный диапазон",
          "is-muted", "middle");
      }
      drawing.text(svg, 500, 62,
        "Шаг " + (model.frameIndex + 1) + " из " + model.scenario.frames.length,
        "is-strong", "middle");
      figure.caption.textContent =
        "Идентификатор под значением позволяет увидеть устойчивость: равные ключи должны сохранить исходный порядок";
      panel.querySelector("[data-message]").textContent = frame.message;
      panel.querySelector("[data-comparisons]").textContent = frame.metrics.comparisons;
      panel.querySelector("[data-writes]").textContent = frame.metrics.writes;
      panel.querySelector("[data-swaps]").textContent = frame.metrics.swaps;
      panel.querySelector("[data-depth]").textContent = frame.metrics.maxDepth;
      panel.querySelector("[data-memory]").textContent = frame.metrics.auxiliarySlots;
      panel.querySelector("[data-properties]").textContent =
        (model.scenario.stable ? "устойчива" : "неустойчива") + " · " +
        (model.scenario.inPlace ? "in-place" : "нужен буфер");
    }

    function decisionLevels(tree) {
      const levels = [];
      tree.nodes.forEach(function (node) {
        if (!levels[node.depth]) levels[node.depth] = [];
        levels[node.depth].push(node);
      });
      return levels;
    }

    function drawDecision(model) {
      const svg = figure.svg;
      const tree = model.scenario;
      const levels = decisionLevels(tree);
      const positions = new Map();
      levels.forEach(function (nodes, depth) {
        nodes.forEach(function (node, index) {
          positions.set(node.id, {
            x: 55 + (index + 0.5) * (890 / nodes.length),
            y: 95 + depth * (390 / Math.max(1, tree.height)),
          });
        });
      });
      drawing.clear(svg, "Decision tree сортировки", "Каждый уровень раскрывает ещё один исход сравнения");
      tree.nodes.forEach(function (node) {
        if (node.depth >= model.frameIndex) return;
        ["no", "yes"].forEach(function (edge) {
          const child = node[edge];
          if (!child || child.depth > model.frameIndex) return;
          const from = positions.get(node.id);
          const to = positions.get(child.id);
          drawing.append(svg, "line", {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            class: "sorting-decision-edge " + (edge === "yes" ? "is-yes" : "is-no"),
          });
        });
      });
      tree.nodes.forEach(function (node) {
        if (node.depth > model.frameIndex) return;
        const point = positions.get(node.id);
        drawing.append(svg, node.terminal ? "rect" : "circle", node.terminal ? {
          x: point.x - 18,
          y: point.y - 14,
          width: 36,
          height: 28,
          rx: 5,
          class: "sorting-decision-node is-leaf",
        } : {
          cx: point.x,
          cy: point.y,
          r: 15,
          class: "sorting-decision-node",
        });
        if (node.label && node.depth < model.frameIndex) {
          drawing.text(svg, point.x, point.y - 22, node.label, "is-muted", "middle");
        }
        if (node.terminal) {
          drawing.text(svg, point.x, point.y + 4,
            node.permutation.join(""), "is-strong", "middle");
        }
      });
      drawing.text(svg, 500, 35,
        tree.n + "! = " + tree.factorial + " листьев · ⌈log₂(" + tree.n + "!)⌉ = " +
          tree.lowerBound + " сравнений в худшем случае",
        "is-strong", "middle");
      drawing.text(svg, 500, 565,
        "Показаны уровни 0…" + model.frameIndex + "; дерево insertion sort имеет высоту " + tree.height,
        "is-muted", "middle");
      figure.caption.textContent =
        "Дерево конкретного алгоритма может быть выше нижней границы, но не может иметь меньше n! достижимых листьев для различных ключей";
      panel.querySelector("[data-message]").textContent =
        "Каждое бинарное сравнение добавляет не больше одного бита информации; раскрыт уровень " +
        model.frameIndex + ".";
      panel.querySelector("[data-comparisons]").textContent = "≥ " + tree.lowerBound;
      panel.querySelector("[data-writes]").textContent = "не считаются";
      panel.querySelector("[data-swaps]").textContent = "не считаются";
      panel.querySelector("[data-depth]").textContent = tree.height;
      panel.querySelector("[data-memory]").textContent = tree.factorial + " листьев";
      panel.querySelector("[data-properties]").textContent = "модель сравнений";
    }

    function render(state) {
      const model = core.visualModel(state);
      if (model.mode === "decision") drawDecision(model);
      else drawSorting(model);
    }

    function syncMode() {
      const decision = mode.value === "decision";
      sortControls.forEach(function (control) { control.hidden = decision; });
      decisionControls.forEach(function (control) { control.hidden = !decision; });
    }

    runtime.mount(root, {
      createState: function () {
        return mode.value === "decision"
          ? core.createState("decision", decisionN.value)
          : core.createState(
            "sorting",
            values.value,
            algorithm.value,
            pivot.value,
            seed.value
          );
      },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 300,
      bind: function (api) {
        mode.addEventListener("change", function () { syncMode(); api.reset(); });
        shell.controls.addEventListener("change", function (event) {
          if (event.target !== mode) api.reset();
        });
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
    syncMode();
  });
})();
