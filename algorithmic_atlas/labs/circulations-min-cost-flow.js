(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.CirculationsMinCostFlowCore;
  if (!runtime || !graphRuntime || !core) throw new Error("Лаборатория циркуляций не получила общие зависимости.");

  runtime.boot("circulations-min-cost-flow", function (root) {
    const shell = runtime.createShell(root, {
      title: "От нижних границ к допустимости и минимальной стоимости",
      description: "Один кадр связывает исходный поток, скорректированные балансы, вспомогательную сеть, остаточные дуги, потенциалы и приведённые стоимости",
    });
    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode"><option value="feasible" selected>Допустимая циркуляция</option><option value="min-cost">Минимальная стоимость</option></select></label>' +
      '<label>Сценарий<select data-field="preset">' +
        '<option value="lowerBounds" selected>Нижние границы</option><option value="infeasible">Недопустимая сеть</option>' +
        '<option value="parallelZero">Параллельные и нулевые дуги</option><option value="negativeCosts">Отрицательные стоимости</option>' +
        '<option value="finiteNegativeCycle">Конечный отрицательный цикл</option><option value="unbounded">Неограниченная стоимость</option>' +
        '<option value="huge">Большие точные целые</option></select></label>' +
      '<label>Вид рёбер<select data-field="view"><option value="original" selected>исходные границы и поток</option><option value="residual">остаточная сеть</option><option value="reduced">приведённые стоимости</option></select></label>' +
      '<p class="atlas-lab__note atlas-lab__field is-wide">Баланс — требуемый чистый приток: положительное значение означает спрос, отрицательное — предложение. Знак ∞ разрешён только для верхней границы</p>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      view: shell.controls.querySelector('[data-field="view"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Кадр</dt><dd data-metric="frame">1 / 1</dd></div>' +
      '<div><dt>Этап</dt><dd data-metric="stage">—</dd></div>' +
      '<div><dt>Стоимость</dt><dd data-metric="cost">0</dd></div>' +
      '<div><dt>Итог</dt><dd data-metric="verdict">ещё не получен</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "circulations-min-cost-flow-graph",
      title: "Исходная, вспомогательная или остаточная сеть",
      viewBox: "0 0 980 600",
      className: "atlas-graph-lab",
    });

    const balancePanel = document.createElement("section");
    balancePanel.className = "atlas-lab__panel";
    balancePanel.innerHTML =
      '<h4>Баланс каждой вершины</h4><div class="atlas-lab__table-wrap" tabindex="0" aria-label="Требуемые и текущие балансы">' +
      '<table data-table="balances"><thead><tr><th>Вершина</th><th>требуется b</th><th>после нижних границ</th><th>текущий приток</th><th>потенциал π</th></tr></thead><tbody></tbody></table></div>';
    shell.workspace.appendChild(balancePanel);

    const edgePanel = document.createElement("section");
    edgePanel.className = "atlas-lab__panel";
    edgePanel.innerHTML =
      '<h4>Исходные дуги</h4><div class="atlas-lab__table-wrap" tabindex="0" aria-label="Границы, поток и стоимость дуг">' +
      '<table data-table="edges"><thead><tr><th>Дуга</th><th>границы</th><th>поток</th><th>стоимость единицы</th><th>вклад</th></tr></thead><tbody></tbody></table></div>' +
      '<h4>Вспомогательные дуги</h4><p data-detail="auxiliary">Вспомогательных дуг пока нет</p>' +
      '<h4>Текущий переход</h4><p data-detail="operation"></p>';
    shell.workspace.appendChild(edgePanel);

    const residualPanel = document.createElement("section");
    residualPanel.className = "atlas-lab__panel";
    residualPanel.innerHTML =
      '<h4>Остаточные дуги</h4><div class="atlas-lab__table-wrap" tabindex="0" aria-label="Остаточные ёмкости и стоимости">' +
      '<table data-table="residual"><thead><tr><th>Дуга</th><th>направление</th><th>остаток</th><th>стоимость</th><th>приведённая</th></tr></thead><tbody></tbody></table></div>';
    shell.workspace.appendChild(residualPanel);

    let graphController = null;
    let nodeSignature = "";

    function createState() {
      return core.createState(core.preset(fields.preset.value), { mode: fields.mode.value });
    }

    function potential(frame, id) {
      return frame.potentials && frame.potentials[id] !== undefined ? frame.potentials[id] : "—";
    }

    function nodeList(model) {
      const nodes = model.network.nodes.map(function (node) {
        const actual = model.frame.balances[node.id];
        return { id: node.id, label: node.id + "·" + actual };
      });
      if (model.frame.auxiliaryEdges.length) {
        nodes.push({ id: "__super_source__", label: "σ" }, { id: "__super_sink__", label: "τ" });
      }
      return nodes;
    }

    function pathResidualIds(frame) {
      return new Set(frame.pathArcIds || []);
    }

    function graphModel(model) {
      const path = pathResidualIds(model.frame);
      const pathOriginal = new Set();
      model.frame.residual.forEach(function (arc) {
        if (path.has(arc.id) && arc.originId) pathOriginal.add(arc.originId);
      });
      const nodes = nodeList(model);
      let edges;
      if (fields.view.value === "original") {
        edges = model.network.edges.map(function (edge) {
          const upper = edge.upper === null ? "∞" : edge.upper;
          return {
            id: edge.id, source: edge.source, target: edge.target, directed: true,
            label: model.frame.flow[edge.id] + "∈[" + edge.lower + "," + upper + "] · c=" + edge.cost,
            active: pathOriginal.has(edge.id),
          };
        });
        model.frame.auxiliaryEdges.forEach(function (edge) {
          edges.push({ id: edge.id, source: edge.source, target: edge.target, directed: true, label: edge.flow + "/" + edge.capacity, active: path.has(edge.id + ":forward") || path.has(edge.id + ":reverse") });
        });
      } else {
        edges = model.frame.residual.map(function (arc) {
          const capacity = arc.capacity === null ? "∞" : arc.capacity;
          const cost = fields.view.value === "reduced"
            ? (arc.reducedCost === null ? "—" : arc.reducedCost)
            : arc.cost;
          return { id: arc.id, source: arc.source, target: arc.target, directed: true, label: capacity + " · " + (fields.view.value === "reduced" ? "ĉ=" : "c=") + cost, active: path.has(arc.id) };
        });
      }
      return { id: model.network.id, label: model.network.label, directed: true, nodes: nodes, edges: edges };
    }

    function renderGraph(model) {
      const graph = graphModel(model);
      if (!graph.nodes.length) {
        if (graphController) { graphController.destroy(); graphController = null; }
        figure.svg.replaceChildren();
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", "490"); text.setAttribute("y", "300"); text.setAttribute("text-anchor", "middle");
        text.textContent = "Пустая сеть: единственная циркуляция пуста"; figure.svg.appendChild(text);
        figure.caption.textContent = model.frame.message;
        return;
      }
      const signature = graph.nodes.map(function (node) { return node.id; }).join("|");
      const options = {
        title: "Сеть циркуляции",
        description: model.frame.message,
        layout: { type: "circle", width: 980, height: 600, padding: 112 },
        nodeRadius: 44,
        nodeClass: function (node) {
          if (node.id === "__super_source__" || node.id === "__super_sink__") return "is-candidate";
          if (model.frame.settledVertexIds && model.frame.settledVertexIds.includes(node.id)) return "is-visited";
          return "";
        },
        edgeClass: function (edge) { return edge.active ? "is-active" : ""; },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign(options, { preserveView: signature === nodeSignature }));
      nodeSignature = signature;
      figure.caption.textContent = model.frame.message;
    }

    function appendCells(row, values) {
      values.forEach(function (value) {
        const cell = document.createElement("td"); cell.textContent = String(value); row.appendChild(cell);
      });
    }

    function renderBalances(model) {
      const body = balancePanel.querySelector("tbody"); body.replaceChildren();
      model.network.nodes.forEach(function (node) {
        const row = document.createElement("tr");
        if (model.frame.balances[node.id] === node.balance) row.className = "is-current";
        appendCells(row, [node.id, node.balance, model.frame.adjustedBalances[node.id], model.frame.balances[node.id], potential(model.frame, node.id)]);
        body.appendChild(row);
      });
    }

    function renderEdges(model) {
      const body = edgePanel.querySelector('[data-table="edges"] tbody'); body.replaceChildren();
      model.network.edges.forEach(function (edge) {
        const flow = model.frame.flow[edge.id];
        const row = document.createElement("tr");
        appendCells(row, [edge.source + " → " + edge.target, "[" + edge.lower + ", " + (edge.upper === null ? "∞" : edge.upper) + "]", flow, edge.cost, (BigInt(flow) * BigInt(edge.cost)).toString()]);
        body.appendChild(row);
      });
      const auxiliary = model.frame.auxiliaryEdges;
      edgePanel.querySelector('[data-detail="auxiliary"]').textContent = auxiliary.length
        ? auxiliary.map(function (edge) { return edge.source.replace("__super_source__", "σ") + " → " + edge.target.replace("__super_sink__", "τ") + ": " + edge.flow + "/" + edge.capacity; }).join(" · ")
        : "Вспомогательных дуг на этом кадре нет";
      edgePanel.querySelector('[data-detail="operation"]').textContent = model.frame.message;
    }

    function renderResidual(model) {
      const body = residualPanel.querySelector("tbody"); body.replaceChildren();
      const active = pathResidualIds(model.frame);
      model.frame.residual.forEach(function (arc) {
        const row = document.createElement("tr");
        if (active.has(arc.id)) row.className = "is-current";
        appendCells(row, [arc.edgeId, arc.source + " → " + arc.target, arc.capacity === null ? "∞" : arc.capacity, arc.cost, arc.reducedCost === null ? "—" : arc.reducedCost]);
        body.appendChild(row);
      });
    }

    function verdict(frame) {
      if (frame.unbounded) return "стоимость не ограничена";
      if (frame.feasible === true) return frame.stage === "optimal" ? "оптимальный поток" : "допустимая циркуляция";
      if (frame.feasible === false) return "циркуляции нет";
      return "ещё не получен";
    }

    function render(state, context) {
      const model = core.visualModel(state);
      renderGraph(model); renderBalances(model); renderEdges(model); renderResidual(model);
      metrics.querySelector('[data-metric="frame"]').textContent = String(model.cursor + 1) + " / " + model.frameCount;
      metrics.querySelector('[data-metric="stage"]').textContent = model.frame.stage;
      metrics.querySelector('[data-metric="cost"]').textContent = model.frame.totalCost;
      metrics.querySelector('[data-metric="verdict"]').textContent = verdict(model.frame);
      if (context && model.frame.finished) context.announce(model.frame.message);
    }

    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      maxAutomaticSteps: 256,
      bind: function (api) {
        fields.mode.addEventListener("change", api.reset);
        fields.preset.addEventListener("change", api.reset);
        fields.view.addEventListener("change", api.render);
        shell.controls.addEventListener("submit", function (event) { event.preventDefault(); api.reset(); });
      },
    });
  });
})();
