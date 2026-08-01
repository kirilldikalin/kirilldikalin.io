(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.MeetInTheMiddleCore;

  runtime.boot("meet-in-the-middle", function (root) {
    const shell = runtime.createShell(root, {
      title: "Две половины встречаются на целевой сумме",
      description: "Постройте списки всех полусумм, отсортируйте правый и проследите бинарный поиск дополнения для каждой левой суммы",
    });
    shell.controls.innerHTML =
      '<label class="atlas-lab__field is-wide">Числа<input data-field="values" type="text" value="8,3,5,6,11,2,9,1,7,4"></label>' +
      '<label>Целевая сумма<input data-field="target" type="text" value="29"></label>';
    const values = shell.controls.querySelector('[data-field="values"]');
    const target = shell.controls.querySelector('[data-field="target"]');
    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics mitm-metrics";
    metrics.innerHTML =
      '<div><dt>Левых сумм</dt><dd data-left>—</dd></div>' +
      '<div><dt>Правых сумм</dt><dd data-right>—</dd></div>' +
      '<div><dt>Бинарных сравнений</dt><dd data-comparisons>—</dd></div>' +
      '<div><dt>Обработано слева</dt><dd data-processed>—</dd></div>' +
      '<div><dt>Точных пар</dt><dd data-exact>—</dd></div>' +
      '<div><dt>Память, записей</dt><dd data-memory>—</dd></div>';
    shell.workspace.appendChild(metrics);
    const figure = runtime.createFigure(shell.workspace, {
      id: "meet-in-the-middle-visual",
      title: "Полусуммы и соединяемая пара",
      viewBox: "0 0 1120 700",
      className: "mitm-figure",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel mitm-panel";
    panel.innerHTML =
      '<h4>Текущий запрос</h4><p data-query></p>' +
      '<h4>Лучшее свидетельство</h4><p data-witness></p>';
    shell.workspace.appendChild(panel);

    function compactEntries(entries, active, limit) {
      if (entries.length <= limit) return entries;
      const selected = [];
      const seen = new Set();
      function add(entry) {
        if (!entry || seen.has(entry.mask)) return;
        seen.add(entry.mask);
        selected.push(entry);
      }
      entries.slice(0, 4).forEach(add);
      entries.slice(-4).forEach(add);
      if (active) {
        const index = entries.indexOf(active);
        entries.slice(Math.max(0, index - 2), index + 3).forEach(add);
      }
      return selected.slice(0, limit);
    }

    function subsetLabel(entry) {
      if (!entry.items.length) return "∅";
      return "{" + entry.items.map(function (index) { return index + 1; }).join(",") + "}";
    }

    function drawList(svg, title, entries, active, x, phaseClass) {
      drawing.text(svg, x, 125, title + " · " + entries.length, "is-strong");
      const visible = compactEntries(entries, active, 15);
      visible.forEach(function (entry, index) {
        const y = 150 + index * 30;
        let className = "mitm-entry " + phaseClass;
        if (active && entry.mask === active.mask) className += " is-active";
        drawing.append(svg, "rect", {
          x: x,
          y: y,
          width: 350,
          height: 24,
          rx: 4,
          class: className,
        });
        drawing.text(svg, x + 12, y + 17, subsetLabel(entry), "mitm-entry-label");
        drawing.text(svg, x + 330, y + 17, String(entry.sum),
          "mitm-entry-sum", "end");
      });
      if (entries.length > visible.length) {
        drawing.text(svg, x + 175, 620,
          "Показано " + visible.length + " из " + entries.length + " записей",
          "is-muted", "middle");
      }
    }

    function render(state) {
      const model = core.visualModel(state);
      const frame = model.frame;
      const svg = figure.svg;
      const activeLeft = model.activeSearch ? model.activeSearch.left : null;
      const activeRight = model.activeSearch ? model.activeSearch.selectedRight : null;
      drawing.clear(
        svg,
        "Meet-in-the-middle для subset sum",
        "Два списка сумм половин и бинарный поиск пары, дающей целевую сумму"
      );
      drawing.text(svg, 50, 42,
        "Левая половина: " + model.values.slice(0, model.middle).map(String).join(", "),
        "is-strong");
      drawing.text(svg, 1070, 42,
        "Правая половина: " + model.values.slice(model.middle).map(String).join(", "),
        "is-strong", "end");
      drawing.text(svg, 560, 82, "цель = " + String(model.target),
        "mitm-target", "middle");
      drawList(svg, "L: суммы подмножеств", model.leftEntries, activeLeft, 50, "is-left");
      drawList(
        svg,
        model.rightSorted ? "R: отсортированные суммы" : "R: суммы подмножеств",
        model.rightEntries,
        activeRight,
        720,
        "is-right"
      );
      if (activeLeft && activeRight) {
        const total = activeLeft.sum + activeRight.sum;
        drawing.append(svg, "path", {
          d: "M405 355 C500 260 620 260 720 355",
          class: total === model.target ? "mitm-join is-exact" : "mitm-join",
        });
        drawing.text(svg, 560, 298,
          String(activeLeft.sum) + " + " + String(activeRight.sum) + " = " + String(total),
          total === model.target ? "mitm-equation is-exact" : "mitm-equation",
          "middle");
        drawing.text(svg, 560, 332,
          "ищем дополнение " + String(model.activeSearch.complement),
          "is-muted", "middle");
      } else {
        drawing.text(svg, 560, 318,
          frame.phase === "split"
            ? "2^n вариантов превращаются в два списка порядка 2^(n/2)"
            : "Сначала материализуем и сортируем полусуммы",
          "is-muted", "middle");
      }
      drawing.text(svg, 560, 665, frame.message, "mitm-message", "middle");

      metrics.querySelector("[data-left]").textContent = model.leftEntries.length;
      metrics.querySelector("[data-right]").textContent = model.rightEntries.length;
      metrics.querySelector("[data-comparisons]").textContent = model.comparisons;
      metrics.querySelector("[data-processed]").textContent =
        model.processedSearches + " / " + model.totalSearches;
      metrics.querySelector("[data-exact]").textContent = model.exactPairCount;
      metrics.querySelector("[data-memory]").textContent = model.memoryEntries;
      panel.querySelector("[data-query]").textContent = model.activeSearch
        ? "Для левой суммы " + model.activeSearch.left.sum +
          " требуется правая сумма " + model.activeSearch.complement +
          "; выполнено сравнений: " + model.activeSearch.comparisons
        : frame.message;
      const witnessItems = model.best.left.items.concat(model.best.right.items)
        .map(function (index) { return index + 1; });
      panel.querySelector("[data-witness]").textContent =
        "Индексы " + (witnessItems.length ? witnessItems.join(", ") : "∅") +
        " дают сумму " + model.best.total +
        (model.best.distance === 0n ? " — точное решение" : " — расстояние до цели " + model.best.distance);
      figure.caption.textContent =
        "Списки могут быть агрегированы визуально, но счётчики и найденная пара вычисляются по всем точным BigInt-суммам";
    }

    const mounted = runtime.mount(root, {
      createState: function () {
        return core.createState(values.value, target.value);
      },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 150,
      bind: function (api) {
        shell.controls.addEventListener("change", api.reset);
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
    mounted.reset();
  });
})();
