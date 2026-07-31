(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.BalancedSearchTreesCore;

  function parseKeys(raw) {
    return raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }

  runtime.boot("balanced-search-trees", function (root) {
    const shell = runtime.createShell(root, {
      title: "Нарушить — локально восстановить",
      description: "Вставляйте одну последовательность в AVL- и красно-чёрное дерево, следя за путём, высотами, цветами и исправлением",
    });
    shell.controls.innerHTML =
      '<label>Балансировка<select data-field="mode"><option value="avl">AVL</option><option value="red-black">красно-чёрное</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Последовательность ключей<input data-field="keys" value="30, 20, 10, 25, 28, 40, 50, 45" inputmode="numeric"></label>';
    const mode = shell.controls.querySelector('[data-field="mode"]');
    const keys = shell.controls.querySelector('[data-field="keys"]');
    const figure = runtime.createFigure(shell.workspace, {
      id: "balanced-search-trees-visual", title: "Балансируемое дерево", viewBox: "0 0 900 570",
    });
    const panel = document.createElement("section");
    panel.className = "atlas-lab__panel";
    panel.innerHTML = '<h4>Правило восстановления</h4><p data-event></p><dl class="atlas-lab__metrics" data-metrics></dl><p class="atlas-lab__note" data-invariant></p>';
    shell.workspace.appendChild(panel);
    const eventText = panel.querySelector("[data-event]");
    const metrics = panel.querySelector("[data-metrics]");
    const invariant = panel.querySelector("[data-invariant]");

    function createState() {
      return core.createState(mode.value, parseKeys(keys.value));
    }

    function render(state) {
      const model = core.visualModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Балансировка дерева поиска", "Путь вставки и текущие вращения или перекраски");
      const positionById = {};
      const verticalStep = model.validation.height > 6 ? 64 : 74;
      model.nodes.forEach(function (node) {
        positionById[node.id] = { x: 50 + node.xShare * 800, y: 55 + node.depth * verticalStep };
      });
      model.edges.forEach(function (edge) {
        const from = positionById[edge.from];
        const to = positionById[edge.to];
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "tree-edge" });
      });
      model.nodes.forEach(function (node) {
        const position = positionById[node.id];
        const classes = ["tree-node"];
        if (node.color === "red") classes.push("is-red");
        else classes.push("is-black");
        if (node.onPath) classes.push("is-path");
        if (node.active) classes.push("is-active");
        if (node.violation) classes.push("is-violation");
        drawing.append(svg, "circle", { cx: position.x, cy: position.y, r: 27, class: classes.join(" ") });
        drawing.text(svg, position.x, position.y + 5, node.key, "tree-key", "middle");
        drawing.text(svg, position.x, position.y + 42, model.mode === "avl" ? "h=" + node.height + ", bf=" + node.balance : node.color === "red" ? "красный" : "чёрный", "is-muted", "middle");
      });
      eventText.textContent = model.event;
      metrics.innerHTML = [
        ["вставлено", model.insertedCount], ["узлов", model.nodes.length], ["высота", model.validation.height],
        [model.mode === "avl" ? "AVL-инвариант" : "чёрная высота", model.mode === "avl" ? (model.invariantValid ? "выполнен" : "нарушен") : model.validation.blackHeight],
      ].map(function (item) { return "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>"; }).join("");
      invariant.textContent = model.invariantValid
        ? "Текущий кадр удовлетворяет всем инвариантам выбранного дерева"
        : "Это промежуточный кадр: подсвеченное нарушение должно быть исправлено следующим правилом";
      invariant.classList.toggle("is-warning", !model.invariantValid);
      figure.caption.textContent = model.schematic
        ? "Для длинной последовательности расстояния между уровнями уменьшены, вычисления остаются точными"
        : "Контур пути поиска и акцент текущего правила не зависят только от цвета";
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 180,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); },
    });
  });
})();
