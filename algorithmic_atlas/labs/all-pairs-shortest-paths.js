(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.AllPairsShortestPathsCore;

  if (!runtime || !graphRuntime || !core) {
    throw new Error("Лаборатория APSP не получила общие зависимости.");
  }

  runtime.boot("all-pairs-shortest-paths", function (root) {
    const shell = runtime.createShell(root, {
      title: "Одна задача, две согласованные картины",
      description: "Шагайте по промежуточным вершинам Floyd–Warshall или проследите перевзвешивание Джонсона: граф, матрица, потенциалы и восстановленный путь показывают одно вычисление",
    });

    shell.controls.innerHTML =
      '<label>Алгоритм<select data-field="algorithm">' +
        '<option value="floyd-warshall" selected>Floyd–Warshall</option>' +
        '<option value="johnson">Johnson</option>' +
      '</select></label>' +
      '<label>Сценарий<select data-field="preset">' +
        '<option value="classic" selected>Отрицательные рёбра без цикла</option>' +
        '<option value="unreachable">Недостижимые пары</option>' +
        '<option value="negativeCycle">Отрицательный цикл</option>' +
        '<option value="large">Большие точные веса</option>' +
      '</select></label>' +
      '<label>Начало пути<select data-field="source"></select></label>' +
      '<label>Конец пути<select data-field="target"></select></label>' +
      '<label>Подписи рёбер<select data-field="edge-view">' +
        '<option value="both" selected>исходный → новый вес</option>' +
        '<option value="original">исходный вес</option>' +
        '<option value="reweighted">новый вес</option>' +
      '</select></label>' +
      '<p class="atlas-lab__note atlas-lab__field is-wide">Знак ∞ означает недостижимость, а не большое машинное число. При отрицательном цикле Johnson останавливается до Дейкстры</p>';

    const fields = {
      algorithm: shell.controls.querySelector('[data-field="algorithm"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      source: shell.controls.querySelector('[data-field="source"]'),
      target: shell.controls.querySelector('[data-field="target"]'),
      edgeView: shell.controls.querySelector('[data-field="edge-view"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Кадр</dt><dd data-metric="frame">1 / 1</dd></div>' +
      '<div><dt>Промежуточная / источник</dt><dd data-metric="active">—</dd></div>' +
      '<div><dt>Изменено ячеек</dt><dd data-metric="changed">0</dd></div>' +
      '<div><dt>Отрицательный цикл</dt><dd data-metric="cycle">нет</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "all-pairs-shortest-paths-graph",
      title: "Граф: исходные и перевзвешенные рёбра",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab",
    });

    const matrixPanel = document.createElement("section");
    matrixPanel.className = "atlas-lab__panel";
    matrixPanel.innerHTML =
      '<h4>Матрица текущих расстояний</h4>' +
      '<p data-detail="matrix-rule">До первого шага разрешены только прямые рёбра</p>' +
      '<div class="atlas-lab__table-wrap" tabindex="0" aria-label="Матрица кратчайших расстояний"><table data-table="matrix"></table></div>';
    shell.workspace.appendChild(matrixPanel);

    const explanation = document.createElement("section");
    explanation.className = "atlas-lab__panel";
    explanation.innerHTML =
      '<h4>Текущий переход</h4><p data-detail="operation"></p>' +
      '<h4>Потенциалы и веса Johnson</h4><p data-detail="potentials">Перевзвешивание ещё не выполнено</p>' +
      '<div class="atlas-lab__table-wrap" tabindex="0" aria-label="Исходные и перевзвешенные веса"><table data-table="weights">' +
        '<thead><tr><th>Дуга</th><th>w</th><th>w′</th></tr></thead><tbody></tbody></table></div>' +
      '<h4>Выбранная пара</h4><p data-detail="path"></p>';
    shell.workspace.appendChild(explanation);

    let graphController = null;
    let graphSignature = "";
    let labController = null;

    function option(select, value) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = value;
      select.appendChild(item);
    }

    function populatePathSelectors(graph) {
      const previousSource = fields.source.value;
      const previousTarget = fields.target.value;
      fields.source.replaceChildren();
      fields.target.replaceChildren();
      graph.nodes.forEach(function (node) {
        option(fields.source, node.id);
        option(fields.target, node.id);
      });
      if (graph.nodes.some(function (node) { return node.id === previousSource; })) fields.source.value = previousSource;
      if (graph.nodes.some(function (node) { return node.id === previousTarget; })) fields.target.value = previousTarget;
      else if (graph.nodes.length) fields.target.value = graph.nodes[graph.nodes.length - 1].id;
    }

    function selectedGraph() {
      return core.preset(fields.preset.value);
    }

    function createState() {
      const graph = selectedGraph();
      populatePathSelectors(graph);
      return core.createState(graph, { algorithm: fields.algorithm.value });
    }

    function displayNumber(value) {
      return value === null ? "∞" : String(value);
    }

    function shiftedByEdge(frame) {
      const map = Object.create(null);
      (frame.reweightedEdges || []).forEach(function (edge) {
        map[edge.originalEdgeId] = edge.weight;
      });
      return map;
    }

    function queryPath(state) {
      if (!fields.source.value || !fields.target.value) return null;
      if (!state.playback.finished) return { status: "pending", path: [], distance: null };
      return core.reconstructPath(state.trace, fields.source.value, fields.target.value);
    }

    function pathEdgeIds(graph, path) {
      const ids = new Set();
      for (let index = 1; index < path.length; index += 1) {
        const edge = graph.edges.find(function (candidate) {
          return candidate.source === path[index - 1] && candidate.target === path[index];
        });
        if (edge) ids.add(edge.id);
      }
      return ids;
    }

    function displayGraph(model) {
      const shifted = shiftedByEdge(model.frame);
      return {
        id: model.graph.id,
        label: model.graph.label,
        directed: model.graph.directed,
        nodes: model.graph.nodes.map(function (node) {
          const potential = model.frame.potentials && model.frame.potentials[node.id];
          return { id: node.id, label: potential === undefined ? node.label : node.label + "·h=" + potential };
        }),
        edges: model.graph.edges.map(function (edge) {
          let label = String(edge.weight);
          if (shifted[edge.id] !== undefined && fields.edgeView.value !== "original") {
            label = fields.edgeView.value === "reweighted"
              ? String(shifted[edge.id])
              : String(edge.weight) + "→" + String(shifted[edge.id]);
          }
          return Object.assign({}, edge, { label: label });
        }),
      };
    }

    function renderEmptyGraph(message) {
      if (graphController) {
        graphController.destroy();
        graphController = null;
      }
      figure.svg.replaceChildren();
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "460");
      text.setAttribute("y", "280");
      text.setAttribute("text-anchor", "middle");
      text.textContent = message;
      figure.svg.appendChild(text);
    }

    function renderGraph(model, result) {
      if (!model.graph.nodes.length) {
        renderEmptyGraph("Пустой граф: матрица имеет размер 0 × 0");
        return;
      }
      const graph = displayGraph(model);
      const pathEdges = result && result.status === "ok" ? pathEdgeIds(model.graph, result.path) : new Set();
      const pathNodes = new Set(result && result.status === "ok" ? result.path : []);
      const changedEdges = new Set(model.frame.changedEdges || []);
      const signature = JSON.stringify({
        nodes: graph.nodes.map(function (node) { return node.id; }),
        edges: graph.edges.map(function (edge) { return [edge.id, edge.source, edge.target]; }),
      });
      const options = {
        title: "Граф для поиска расстояний между всеми парами",
        description: model.frame.message,
        layout: { type: "circle", width: 920, height: 560, padding: 102 },
        nodeRadius: 42,
        nodeClass: function (node) {
          if (node.id === model.frame.activeVertexId) return "is-active";
          if (pathNodes.has(node.id)) return "is-visited";
          return "";
        },
        edgeClass: function (edge) {
          if (pathEdges.has(edge.id)) return "is-visited";
          if (changedEdges.has(edge.id)) return "is-active";
          return "";
        },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign(options, { preserveView: graphSignature === signature }));
      graphSignature = signature;
      figure.caption.textContent = model.frame.message;
    }

    function changedCellSet(frame) {
      return new Set((frame.changedCells || []).map(function (cell) { return cell.row + ":" + cell.column; }));
    }

    function renderMatrix(model) {
      const matrix = model.frame.distance || model.distance;
      const table = matrixPanel.querySelector('[data-table="matrix"]');
      table.replaceChildren();
      if (!matrix || !model.ids.length) {
        const caption = document.createElement("caption");
        caption.textContent = matrix === null ? "Расстояния не определены из-за отрицательного цикла" : "Пустая матрица 0 × 0";
        table.appendChild(caption);
        return;
      }
      const head = document.createElement("thead");
      const header = document.createElement("tr");
      const corner = document.createElement("th");
      corner.scope = "col";
      corner.textContent = "из / в";
      header.appendChild(corner);
      model.ids.forEach(function (id) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = id;
        header.appendChild(cell);
      });
      head.appendChild(header);
      table.appendChild(head);
      const body = document.createElement("tbody");
      const changed = changedCellSet(model.frame);
      matrix.forEach(function (row, rowIndex) {
        const tr = document.createElement("tr");
        if (model.frame.k === rowIndex || model.frame.activeSourceId === model.ids[rowIndex]) tr.className = "is-current";
        const rowHead = document.createElement("th");
        rowHead.scope = "row";
        rowHead.textContent = model.ids[rowIndex];
        tr.appendChild(rowHead);
        row.forEach(function (value, columnIndex) {
          const cell = document.createElement("td");
          const text = displayNumber(value);
          if (changed.has(rowIndex + ":" + columnIndex)) {
            const mark = document.createElement("mark");
            mark.textContent = text;
            mark.title = "Значение изменилось на этом шаге";
            cell.appendChild(mark);
          } else cell.textContent = text;
          tr.appendChild(cell);
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
    }

    function renderWeightTable(model) {
      const body = explanation.querySelector('[data-table="weights"] tbody');
      body.replaceChildren();
      const shifted = shiftedByEdge(model.frame);
      model.graph.edges.forEach(function (edge) {
        const row = document.createElement("tr");
        [edge.source + " → " + edge.target, edge.weight, shifted[edge.id] === undefined ? "—" : shifted[edge.id]].forEach(function (value) {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
    }

    function pathText(result) {
      if (!result) return "В пустом графе нельзя выбрать пару";
      if (result.status === "pending") return "Путь будет восстановлен после завершения вычисления матрицы";
      if (result.status === "negative-cycle") return "Для этой пары конечного минимума нет: достижим отрицательный цикл";
      if (result.status === "unreachable") return fields.source.value + " → " + fields.target.value + ": пути нет";
      return result.path.join(" → ") + "; длина " + result.distance;
    }

    function render(state, context) {
      const model = core.visualModel(state);
      const result = queryPath(state);
      renderGraph(model, result);
      renderMatrix(model);
      renderWeightTable(model);
      metrics.querySelector('[data-metric="frame"]').textContent = String(model.cursor + 1) + " / " + model.frameCount;
      metrics.querySelector('[data-metric="active"]').textContent = model.frame.activeVertexId || model.frame.activeSourceId || "—";
      metrics.querySelector('[data-metric="changed"]').textContent = String((model.frame.changedCells || []).length);
      metrics.querySelector('[data-metric="cycle"]').textContent = model.negativeCycle ? "обнаружен" : "нет";
      matrixPanel.querySelector('[data-detail="matrix-rule"]').textContent = model.frame.k === null || model.frame.k === undefined
        ? "До первого слоя разрешены только прямые рёбра"
        : "Разрешены внутренние вершины " + model.ids.slice(0, model.frame.k + 1).join(", ");
      explanation.querySelector('[data-detail="operation"]').textContent = model.frame.message;
      const potentials = model.frame.potentials;
      explanation.querySelector('[data-detail="potentials"]').textContent = potentials
        ? Object.keys(potentials).map(function (id) { return "h(" + id + ")=" + potentials[id]; }).join(" · ")
        : "В Floyd–Warshall потенциалы не используются";
      explanation.querySelector('[data-detail="path"]').textContent = pathText(result);
      if (context && model.negativeCycle) context.announce("Обнаружен отрицательный цикл; часть или все кратчайшие расстояния не определены.");
    }

    labController = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      maxAutomaticSteps: 128,
      bind: function (api) {
        fields.algorithm.addEventListener("change", api.reset);
        fields.preset.addEventListener("change", api.reset);
        fields.source.addEventListener("change", api.render);
        fields.target.addEventListener("change", api.render);
        fields.edgeView.addEventListener("change", api.render);
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
  });
})();
