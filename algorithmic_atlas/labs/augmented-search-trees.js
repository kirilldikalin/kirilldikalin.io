(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.AugmentedSearchTreesCore;

  function parseValues(raw) {
    return raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }

  function parseIntervals(raw) {
    return raw.split(/[;,]+/).filter(Boolean).map(function (part) {
      const match = part.trim().match(/^(-?\d+)\s*[-:]\s*(-?\d+)$/);
      if (!match) throw new RangeError("Интервалы записываются как 2-6, 9-14");
      return [Number(match[1]), Number(match[2])];
    });
  }

  runtime.boot("augmented-search-trees", function (root) {
    const shell = runtime.createShell(root, {
      title: "Агрегат ведёт поиск",
      description: "Переключайтесь между порядковыми статистиками и интервалами: путь запроса определяется size или max",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="order">порядковые статистики</option><option value="interval">интервалы</option></select></label>' +
      '<label>Операция<select data-field="operation"></select></label>' +
      '<label class="atlas-lab__field is-wide">Данные<input data-field="data" value="4, 8, 13, 19, 23, 31, 37, 44, 52"></label>' +
      '<label>Ранг, ключ или интервал<input data-field="target" value="5"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]');
    const operation = shell.controls.querySelector('[data-field="operation"]');
    const data = shell.controls.querySelector('[data-field="data"]');
    const target = shell.controls.querySelector('[data-field="target"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "augmented-search-trees-visual", title: "Аугментированное дерево", viewBox: "0 0 900 570",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Почему выбран этот путь</h4><p data-event></p><dl class="atlas-lab__metrics" data-metrics></dl>';
    shell.workspace.appendChild(panel);
    const eventText = panel.querySelector("[data-event]");
    const metrics = panel.querySelector("[data-metrics]");

    function configureOperations() {
      if (mode.value === "interval") {
        operation.innerHTML = '<option value="search">найти пересечение</option><option value="insert">вставить интервал</option>';
        data.value = "2-6, 5-11, 9-14, 13-18, 17-24, 21-23, 26-31";
        target.value = "12-16";
      } else {
        operation.innerHTML = '<option value="select">select по рангу</option><option value="rank">rank ключа</option><option value="insert">вставить ключ</option>';
        data.value = "4, 8, 13, 19, 23, 31, 37, 44, 52";
        target.value = "5";
      }
    }

    function createState() {
      if (mode.value === "interval") {
        return core.createState("interval", {
          intervals: parseIntervals(data.value), operation: operation.value, target: parseIntervals(target.value)[0],
        });
      }
      return core.createState("order", {
        values: parseValues(data.value), operation: operation.value, target: Number(target.value),
      });
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Агрегаты дерева поиска", "Узлы показывают size или max, а подсветка отмечает путь и пересчитанные значения");
      const positions = {};
      model.nodes.forEach(function (node) { positions[node.id] = { x: 50 + node.xShare * 800, y: 65 + node.depth * 92 }; });
      model.edges.forEach(function (edge) {
        drawing.append(svg, "line", { x1: positions[edge.from].x, y1: positions[edge.from].y, x2: positions[edge.to].x, y2: positions[edge.to].y, class: "tree-edge" });
      });
      model.nodes.forEach(function (node) {
        const position = positions[node.id];
        const classes = ["augmented-node"];
        if (node.onPath) classes.push("is-path");
        if (node.active) classes.push("is-active");
        if (node.recomputed) classes.push("is-recomputed");
        drawing.append(svg, "rect", { x: position.x - 48, y: position.y - 28, width: 96, height: 58, rx: 7, class: classes.join(" ") });
        drawing.text(svg, position.x, position.y - 5, model.mode === "order" ? node.key : "[" + node.interval.join(",") + "]", "is-strong", "middle");
        drawing.text(svg, position.x, position.y + 18, model.mode === "order" ? "size=" + node.size : "max=" + node.max, "is-muted", "middle");
      });
      eventText.textContent = model.event;
      const result = Array.isArray(model.result) ? "[" + model.result.join(", ") + "]" : model.result === null ? "—" : model.result;
      metrics.innerHTML = [
        ["режим", model.mode === "order" ? "size" : "max"], ["узлов", model.nodes.length], ["результат", result], ["кадр", state.frameIndex + 1 + " / " + state.trace.frames.length],
      ].map(function (item) { return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>"; }).join("");
      figure.caption.textContent = "Штриховой путь — просмотренные узлы; двойной акцент — агрегаты, пересчитанные после обновления";
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 100,
      bind: function (api) {
        mode.addEventListener("change", function () { configureOperations(); api.reset(); });
        shell.controls.addEventListener("change", function (event) { if (event.target !== mode) api.reset(); });
      },
    });
  });
})();
