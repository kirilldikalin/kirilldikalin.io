(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ProofMethodsInductionCore;
  runtime.boot("proof-methods-induction", function (root) {
    const shell = runtime.createShell(root, {
      title: "Соберите доказательство",
      description: "Выбирайте шаги; граф показывает зависимости, а неверный порядок объясняет недостающее основание",
    });
    shell.controls.innerHTML = '<label class="atlas-lab__field is-wide">Сценарий<select data-lab-field="scenario">' + core.SCENARIOS.map(function (item) { return '<option value="' + item.id + '">' + item.label + "</option>"; }).join("") + "</select></label>";
    const scenario = shell.controls.querySelector('[data-lab-field="scenario"]');
    const figure = runtime.createFigure(shell.workspace, { id: "proof-dag", title: "Граф зависимостей", viewBox: "0 0 760 470" });
    const stepsPanel = document.createElement("section");
    stepsPanel.className = "atlas-lab__panel";
    stepsPanel.innerHTML = '<h4>Шаги</h4><div class="proof-step-list" data-proof-steps></div>';
    shell.workspace.appendChild(stepsPanel);
    const stepList = stepsPanel.querySelector("[data-proof-steps]");
    let app;
    function render(state) {
      const graph = core.graphModel(state);
      const svg = figure.svg;
      drawing.clear(svg, "Граф доказательства", "Узлы шагов и направленные зависимости между ними");
      const nodes = new Map(graph.nodes.map(function (node) { return [node.id, node]; }));
      graph.edges.forEach(function (edge) {
        const from = nodes.get(edge.from); const to = nodes.get(edge.to);
        drawing.append(svg, "line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "proof-edge" + (edge.missing ? " is-missing" : "") });
      });
      graph.nodes.forEach(function (node) {
        drawing.append(svg, "rect", { x: node.x - 85, y: node.y - 27, width: 170, height: 54, rx: 4, class: "proof-node" + (node.complete ? " is-complete" : node.available ? " is-available" : "") });
        drawing.text(svg, node.x, node.y + 5, node.id, "is-strong", "middle");
      });
      stepList.replaceChildren();
      graph.nodes.forEach(function (node) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = node.text;
        if (node.complete) button.classList.add("is-complete");
        if (node.blocked) button.classList.add("is-blocked");
        button.disabled = node.complete;
        button.addEventListener("click", function () {
          const result = core.attemptStep(app.getState(), node.id);
          app.setState(result.state, result.message);
        });
        stepList.appendChild(button);
      });
      figure.caption.textContent = "Зелёные узлы завершены, светлые доступны сейчас, красное ребро показывает недостающее основание";
    }
    app = runtime.mount(root, {
      createState: function () { return core.createState(scenario.value); },
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 10,
      bind: function (api) { shell.controls.addEventListener("change", function () { api.reset(); }); },
    });
  });
})();
