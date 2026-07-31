(function () {
  "use strict";
  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const core = window.ProbabilitySpacesCore;
  runtime.boot("probability-spaces", function (root) {
    const shell = runtime.createShell(root, {
      title: "Байес: дерево и площадь",
      description: "Одни параметры одновременно меняют вероятности ветвей, площади событий и формулу условной вероятности",
    });
    shell.controls.innerHTML =
      '<label>P(A), ‰<input data-lab-field="prior" type="range" min="0" max="1000" value="10"><output data-output="prior"></output></label>' +
      '<label>P(B|A), ‰<input data-lab-field="likelihood" type="range" min="0" max="1000" value="900"><output data-output="likelihood"></output></label>' +
      '<label>P(B|¬A), ‰<input data-lab-field="false-positive" type="range" min="0" max="1000" value="80"><output data-output="false-positive"></output></label>';
    const prior = shell.controls.querySelector('[data-lab-field="prior"]');
    const likelihood = shell.controls.querySelector('[data-lab-field="likelihood"]');
    const falsePositive = shell.controls.querySelector('[data-lab-field="false-positive"]');
    const outputs = {
      prior: shell.controls.querySelector('[data-output="prior"]'),
      likelihood: shell.controls.querySelector('[data-output="likelihood"]'),
      falsePositive: shell.controls.querySelector('[data-output="false-positive"]'),
    };
    const treeFigure = runtime.createFigure(shell.workspace, { id: "probability-tree", title: "Дерево вероятностей", viewBox: "0 0 760 430" });
    const areaFigure = runtime.createFigure(shell.workspace, { id: "probability-area", title: "Условная площадь", viewBox: "0 0 760 430" });
    const formula = document.createElement("p"); formula.className = "atlas-lab__note"; formula.dataset.formula = ""; shell.workspace.after(formula);

    function createState() {
      outputs.prior.textContent = (Number(prior.value) / 10).toFixed(1) + "%";
      outputs.likelihood.textContent = (Number(likelihood.value) / 10).toFixed(1) + "%";
      outputs.falsePositive.textContent = (Number(falsePositive.value) / 10).toFixed(1) + "%";
      return core.createState(Number(prior.value), Number(likelihood.value), Number(falsePositive.value));
    }
    function percent(rational) { return rational ? (100 * Number(rational.numerator) / Number(rational.denominator)).toFixed(2).replace(".", ",") + "%" : "не определено"; }
    function render(state) {
      const model = state.model;
      renderTree(treeFigure.svg, model, state.stage);
      renderArea(areaFigure.svg, model, state.stage);
      formula.textContent = model.posteriorDefined
        ? "P(A|B) = P(A∩B) / P(B) = " + percent(model.aAndB) + " / " + percent(model.b) + " = " + percent(model.posterior)
        : "P(B)=0, поэтому условная вероятность P(A|B) не определена";
      treeFigure.caption.textContent = "Толщина и подпись каждой ветви происходят из одной точной рациональной модели";
      areaFigure.caption.textContent = "Внутри события B выделена доля A∩B; отношение площадей равно P(A|B)";
    }
    function renderTree(svg, model, stage) {
      drawing.clear(svg, "Дерево вероятностей", "Разветвление на A и не A, затем на B и не B");
      const nodes = [[90,215,"Ω"],[330,105,"A"],[330,325,"¬A"],[650,60,"A∩B"],[650,150,"A∩¬B"],[650,280,"¬A∩B"],[650,370,"¬A∩¬B"]];
      const edges = [[0,1,model.prior,"is-a"],[0,2,model.notPrior,""],[1,3,model.likelihood,"is-b"],[1,4,core.complement(model.likelihood),""],[2,5,model.falsePositive,"is-b"],[2,6,core.complement(model.falsePositive),""]];
      edges.forEach(function (edge, index) {
        if (stage < (index < 2 ? 1 : index < 4 ? 2 : 3)) return;
        const from = nodes[edge[0]], to = nodes[edge[1]];
        drawing.append(svg, "line", { x1: from[0], y1: from[1], x2: to[0], y2: to[1], class: "probability-edge " + edge[3], "stroke-width": 1 + 6 * Number(edge[2].numerator) / Number(edge[2].denominator) });
        drawing.text(svg, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 7, percent(edge[2]), "is-muted", "middle");
      });
      nodes.forEach(function (node, index) {
        if (index > 0 && stage === 0) return;
        drawing.append(svg, "circle", { cx: node[0], cy: node[1], r: 27, class: "probability-node" + (index === 3 || index === 5 ? " is-active" : "") });
        drawing.text(svg, node[0], node[1] + 5, node[2], "is-strong", "middle");
      });
    }
    function renderArea(svg, model, stage) {
      drawing.clear(svg, "Площадь условной вероятности", "Единичный прямоугольник разбит на A и не A, а затем на B и не B");
      const x = 80, y = 55, width = 600, height = 320;
      drawing.append(svg, "rect", { x: x, y: y, width: width, height: height, class: "binary-cell" });
      const aWidth = width * model.area.priorShare;
      if (stage >= 1) drawing.append(svg, "rect", { x: x, y: y, width: aWidth, height: height, class: "probability-area-a" });
      if (stage >= 2) {
        drawing.append(svg, "rect", { x: x, y: y, width: aWidth, height: height * model.area.likelihoodShare, class: "probability-area-a is-highlighted" });
        drawing.append(svg, "rect", { x: x + aWidth, y: y, width: width - aWidth, height: height * model.area.falsePositiveShare, class: "probability-area-b is-highlighted" });
      }
      drawing.text(svg, x + 8, y + 22, "A", "is-strong", "start");
      drawing.text(svg, x + width - 8, y + 22, "¬A", "is-strong", "end");
      if (stage >= 4) drawing.text(svg, x + width / 2, 410, "P(A|B)=" + percent(model.posterior), "is-strong", "middle");
    }
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 5,
      bind: function (api) { shell.controls.addEventListener("input", function () { api.reset(); }); },
    });
  });
})();
