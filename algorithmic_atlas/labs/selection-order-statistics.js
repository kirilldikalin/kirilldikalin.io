(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.SelectionOrderStatisticsCore;

  runtime.boot("selection-order-statistics", function (root) {
    const shell = runtime.createShell(root, {
      title: "Два pivot на одном поиске ранга",
      description: "Randomized quickselect и median-of-medians синхронно делят один массив, отбрасывают ненужные области и приходят к одной порядковой статистике",
    });
    shell.controls.innerHTML =
      '<label class="atlas-lab__field is-wide">Массив<input data-field="values" type="text" value="12,3,7,1,9,4,10,2,6,8,11,5"></label>' +
      '<label>Ранг k<input data-field="rank" type="number" min="1" max="12" value="6"></label>' +
      '<label>Seed случайного pivot<input data-field="seed" type="number" min="1" max="4294967295" value="73"></label>';
    const values = shell.controls.querySelector('[data-field="values"]');
    const rank = shell.controls.querySelector('[data-field="rank"]');
    const seed = shell.controls.querySelector('[data-field="seed"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "selection-lab-visual",
      title: "Синхронные разбиения",
      viewBox: "0 0 1040 680",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel selection-lab__panel";
    panel.innerHTML =
      '<h4>Сравнение трасс</h4><p data-summary></p>' +
      '<div class="selection-lab__metric-grid">' +
      '<dl class="atlas-lab__metrics"><div><dt>Random: сравнения</dt><dd data-random-comparisons>0</dd></div><div><dt>Разбиения</dt><dd data-random-partitions>0</dd></div></dl>' +
      '<dl class="atlas-lab__metrics"><div><dt>BFPRT: сравнения</dt><dd data-bfprt-comparisons>0</dd></div><div><dt>Разбиения</dt><dd data-bfprt-partitions>0</dd></div></dl></div>';
    shell.workspace.appendChild(panel);

    function valuesForFrame(frame) {
      if (frame.action === "partition") {
        return frame.less.map(function (value) { return { value: value, kind: "less" }; })
          .concat(frame.equal.map(function (value) { return { value: value, kind: "equal" }; }))
          .concat(frame.greater.map(function (value) { return { value: value, kind: "greater" }; }));
      }
      return frame.active.map(function (value) { return { value: value, kind: "active" }; });
    }

    function drawTrack(svg, frame, title, top, colorClass) {
      drawing.text(svg, 40, top + 24, title, "is-strong");
      drawing.text(svg, 1000, top + 24,
        "k=" + frame.rank + " · сравнений " + frame.comparisons,
        "is-muted", "end");
      const entries = valuesForFrame(frame);
      const width = Math.min(62, 880 / Math.max(1, entries.length));
      const startX = (1040 - width * entries.length) / 2;
      entries.forEach(function (entry, index) {
        let className = "selection-cell " + colorClass + " is-" + entry.kind;
        if (entry.value === frame.pivot) className += " is-pivot";
        drawing.append(svg, "rect", {
          x: startX + index * width + 3,
          y: top + 50,
          width: width - 6,
          height: 58,
          rx: 6,
          class: className,
        });
        drawing.text(svg, startX + (index + 0.5) * width, top + 85,
          entry.value, "is-strong", "middle");
      });
      if (frame.action === "partition") {
        const lessWidth = frame.less.length * width;
        const equalWidth = frame.equal.length * width;
        drawing.text(svg, startX + lessWidth / 2, top + 132,
          "< pivot", "is-muted", "middle");
        drawing.text(svg, startX + lessWidth + equalWidth / 2, top + 132,
          "= pivot", "is-muted", "middle");
        drawing.text(svg, startX + lessWidth + equalWidth + frame.greater.length * width / 2,
          top + 132, "> pivot", "is-muted", "middle");
      }
      if (frame.groups && frame.groups.length) {
        drawing.text(svg, 40, top + 166,
          "Группы: " + frame.groups.map(function (group) {
            return "[" + group.join(" ") + "]";
          }).join("  "), "is-muted");
        drawing.text(svg, 40, top + 188,
          "Медианы: " + frame.medians.join(", ") +
          (frame.guarantee ? " · гарантированно отсекается хотя бы " + frame.guarantee : ""),
          "is-muted");
      }
      drawing.text(svg, 40, top + 214, frame.message, "is-muted");
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Quickselect и median-of-medians",
        "Две синхронные трассы выбора одной порядковой статистики");
      drawing.text(svg, 520, 34,
        "Искомый ранг k=" + model.scenario.targetRank +
        " · контрольный ответ " + model.scenario.expected,
        "is-strong", "middle");
      drawTrack(svg, model.random, "Randomized quickselect", 55, "is-random");
      drawing.append(svg, "line", {
        x1: 30, y1: 325, x2: 1010, y2: 325, class: "selection-divider",
      });
      drawTrack(svg, model.bfprt, "Median of medians", 340, "is-bfprt");
      figure.caption.textContent =
        "Серые элементы уже не могут иметь искомый ранг; три полосы показывают трёхпутевое разбиение, безопасное при дубликатах";
      panel.querySelector("[data-summary]").textContent =
        "Шаг " + (model.frameIndex + 1) + " из " + model.scenario.frameCount +
        ". Обе трассы работают с одним исходным массивом и одним k.";
      panel.querySelector("[data-random-comparisons]").textContent = model.random.comparisons;
      panel.querySelector("[data-random-partitions]").textContent = model.random.partitions;
      panel.querySelector("[data-bfprt-comparisons]").textContent = model.bfprt.comparisons;
      panel.querySelector("[data-bfprt-partitions]").textContent = model.bfprt.partitions;
    }

    runtime.mount(root, {
      createState: function () {
        const parsed = core.parseArray(values.value);
        rank.max = String(parsed.length);
        return core.createState(values.value, rank.value, seed.value);
      },
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 120,
      bind: function (api) {
        shell.controls.addEventListener("change", function () { api.reset(); });
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
  });
})();
