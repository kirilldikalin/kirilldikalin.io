(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.GraphLanguageTraversalsCore;

  runtime.boot("graph-language-traversals", function (root) {
    const shell = runtime.createShell(root, {
      title: "Редактор графа и единая трасса BFS/DFS",
      description: "Меняйте настоящий граф, его направление и представление; очередь, стек, дерево и метки строятся из одной детерминированной трассы",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Пример<select data-field="preset"><option value="connected">Связный граф</option><option value="disconnected">Несвязный граф</option><option value="directed">Ориентированный граф</option><option value="multigraph">Петля и параллельные рёбра</option></select></label>' +
      '<label>Обход<select data-field="algorithm"><option value="bfs">BFS · очередь</option><option value="dfs">DFS · стек</option></select></label>' +
      '<label>Представление<select data-field="representation"><option value="list">Список смежности</option><option value="matrix">Матрица смежности</option></select></label>' +
      '<label>Стартовая вершина<select data-field="source"></select></label>' +
      '<label class="atlas-lab__check"><input data-field="directed" type="checkbox"> Ориентированные рёбра</label>' +
      '<div class="atlas-lab__field"><span>Вершина</span><div class="atlas-lab__actions"><input data-field="node-label" type="text" maxlength="24" aria-label="Название новой вершины" placeholder="Например, G"><button data-action="add-node" type="button">Добавить</button></div></div>' +
      '<div class="atlas-lab__field"><span>Удалить вершину</span><div class="atlas-lab__actions"><select data-field="remove-node" aria-label="Удаляемая вершина"></select><button data-action="remove-node" type="button">Удалить</button></div></div>' +
      '<div class="atlas-lab__field is-wide"><span>Ребро</span><div class="atlas-lab__actions"><select data-field="edge-source" aria-label="Начало нового ребра"></select><select data-field="edge-target" aria-label="Конец нового ребра"></select><button data-action="add-edge" type="button">Добавить ребро</button><select data-field="remove-edge" aria-label="Удаляемое ребро"></select><button data-action="remove-edge" type="button">Удалить ребро</button></div></div>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      algorithm: shell.controls.querySelector('[data-field="algorithm"]'),
      representation: shell.controls.querySelector('[data-field="representation"]'),
      source: shell.controls.querySelector('[data-field="source"]'),
      directed: shell.controls.querySelector('[data-field="directed"]'),
      nodeLabel: shell.controls.querySelector('[data-field="node-label"]'),
      removeNode: shell.controls.querySelector('[data-field="remove-node"]'),
      edgeSource: shell.controls.querySelector('[data-field="edge-source"]'),
      edgeTarget: shell.controls.querySelector('[data-field="edge-target"]'),
      removeEdge: shell.controls.querySelector('[data-field="remove-edge"]'),
    };
    const actions = {
      addNode: shell.controls.querySelector('[data-action="add-node"]'),
      removeNode: shell.controls.querySelector('[data-action="remove-node"]'),
      addEdge: shell.controls.querySelector('[data-action="add-edge"]'),
      removeEdge: shell.controls.querySelector('[data-action="remove-edge"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Вершины</dt><dd data-metric="nodes">0</dd></div>' +
      '<div><dt>Рёбра</dt><dd data-metric="edges">0</dd></div>' +
      '<div><dt>Компоненты</dt><dd data-metric="components">0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "graph-language-traversals-visual",
      title: "Полноширинный граф и дерево обхода",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const detail = document.createElement("section");
    detail.className = "atlas-lab__panel";
    detail.innerHTML =
      '<h4>Текущий шаг</h4><p data-current-step></p>' +
      '<dl class="atlas-lab__metrics"><div><dt data-frontier-title>Очередь</dt><dd data-frontier>∅</dd></div><div><dt>Порядок открытия</dt><dd data-order>∅</dd></div><div><dt>Рёбра дерева</dt><dd data-tree>∅</dd></div></dl>';
    shell.workspace.appendChild(detail);

    const representationPanel = document.createElement("section");
    representationPanel.className = "atlas-lab__panel";
    representationPanel.innerHTML = '<h4 data-representation-title>Список смежности</h4><div class="atlas-lab__table-wrap" tabindex="0" data-representation-body></div><p class="atlas-lab__note" data-complexity></p>';
    shell.workspace.appendChild(representationPanel);

    const vertexPanel = document.createElement("section");
    vertexPanel.className = "atlas-lab__panel";
    vertexPanel.innerHTML = '<h4>Состояние вершин</h4><div class="atlas-lab__table-wrap" tabindex="0" data-vertex-table></div>';
    shell.workspace.appendChild(vertexPanel);

    let graph = core.preset("connected");
    let graphController = null;
    let currentFrame = null;
    let mounted = null;

    function option(value, label) {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = label;
      return element;
    }

    function replaceOptions(select, entries, preferred) {
      const previous = preferred === undefined ? select.value : preferred;
      select.replaceChildren();
      entries.forEach(function (entry) { select.appendChild(option(entry.value, entry.label)); });
      if (entries.some(function (entry) { return entry.value === previous; })) select.value = previous;
    }

    function edgeLabel(edge) {
      return edge.id + ": " + edge.source + (edge.directed ? " → " : " — ") + edge.target;
    }

    function syncEditor() {
      const nodeEntries = graph.nodes.map(function (node) { return { value: node.id, label: node.label }; });
      const sourceValue = fields.source.value || (graph.nodes[0] && graph.nodes[0].id);
      [fields.source, fields.removeNode, fields.edgeSource, fields.edgeTarget].forEach(function (select) {
        replaceOptions(select, nodeEntries, select === fields.source ? sourceValue : select.value);
      });
      replaceOptions(fields.removeEdge, graph.edges.map(function (edge) {
        return { value: edge.id, label: edgeLabel(edge) };
      }), fields.removeEdge.value);
      fields.directed.checked = graph.directed;
      fields.source.disabled = graph.nodes.length === 0;
      fields.removeNode.disabled = graph.nodes.length === 0;
      fields.edgeSource.disabled = graph.nodes.length === 0;
      fields.edgeTarget.disabled = graph.nodes.length === 0;
      fields.removeEdge.disabled = graph.edges.length === 0;
      actions.removeNode.disabled = graph.nodes.length === 0;
      actions.addEdge.disabled = graph.nodes.length === 0;
      actions.removeEdge.disabled = graph.edges.length === 0;
    }

    function nextId(prefix, collection) {
      const used = new Set(collection.map(function (item) { return item.id; }));
      let index = 1;
      while (used.has(prefix + index)) index += 1;
      return prefix + index;
    }

    function makeCell(tag, text, scope) {
      const cell = document.createElement(tag);
      cell.textContent = text;
      if (scope) cell.scope = scope;
      return cell;
    }

    function renderRepresentation() {
      const body = representationPanel.querySelector("[data-representation-body]");
      body.replaceChildren();
      const kind = fields.representation.value;
      if (kind === "list") {
        representationPanel.querySelector("[data-representation-title]").textContent = "Список смежности";
        const list = document.createElement("ul");
        core.adjacencyList(graph).forEach(function (entry) {
          const item = document.createElement("li");
          const neighbors = entry.neighbors.map(function (neighbor) {
            return neighbor.nodeId + " [" + neighbor.edgeId + "]";
          });
          item.textContent = entry.label + ": " + (neighbors.length ? neighbors.join(", ") : "∅");
          list.appendChild(item);
        });
        if (!graph.nodes.length) {
          const empty = document.createElement("p");
          empty.textContent = "Список пуст: добавьте первую вершину";
          body.appendChild(empty);
        } else body.appendChild(list);
      } else {
        representationPanel.querySelector("[data-representation-title]").textContent = "Матрица смежности";
        const matrix = core.adjacencyMatrix(graph);
        const table = document.createElement("table");
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headerRow.appendChild(makeCell("th", "из / в", "col"));
        matrix.ids.forEach(function (id) { headerRow.appendChild(makeCell("th", id, "col")); });
        head.appendChild(headerRow);
        const tableBody = document.createElement("tbody");
        matrix.values.forEach(function (row, index) {
          const tr = document.createElement("tr");
          tr.appendChild(makeCell("th", matrix.ids[index], "row"));
          row.forEach(function (value) { tr.appendChild(makeCell("td", String(value))); });
          tableBody.appendChild(tr);
        });
        table.append(head, tableBody);
        if (!matrix.ids.length) {
          const empty = document.createElement("p");
          empty.textContent = "Матрица имеет размер 0 × 0";
          body.appendChild(empty);
        } else body.appendChild(table);
      }
      const estimate = core.complexity(graph, kind);
      representationPanel.querySelector("[data-complexity]").textContent =
        "Для n = " + estimate.n + " и m = " + estimate.m + ": память " + estimate.memory +
        ", полный обход в этой модели " + estimate.traversal;
    }

    function renderVertexTable(frame) {
      const wrap = vertexPanel.querySelector("[data-vertex-table]");
      wrap.replaceChildren();
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const header = document.createElement("tr");
      ["Вершина", "Цвет", "Родитель", "d", "вход", "выход", "компонента"].forEach(function (label) {
        header.appendChild(makeCell("th", label, "col"));
      });
      head.appendChild(header);
      const body = document.createElement("tbody");
      graph.nodes.forEach(function (node) {
        const row = document.createElement("tr");
        const values = [
          node.label,
          frame.colors[node.id] === "white" ? "белая" : frame.colors[node.id] === "gray" ? "серая" : "чёрная",
          frame.parents[node.id] === null ? "—" : frame.parents[node.id],
          frame.distances[node.id] === null ? "∞" : String(frame.distances[node.id]),
          frame.discover[node.id] === null ? "—" : String(frame.discover[node.id]),
          frame.finish[node.id] === null ? "—" : String(frame.finish[node.id]),
          frame.components[node.id] === null ? "—" : String(frame.components[node.id]),
        ];
        values.forEach(function (value, index) {
          row.appendChild(makeCell(index === 0 ? "th" : "td", value, index === 0 ? "row" : null));
        });
        body.appendChild(row);
      });
      table.append(head, body);
      wrap.appendChild(table);
    }

    function nodeClass(node) {
      if (!currentFrame) return "";
      if (currentFrame.currentVertexId === node.id) return "is-active";
      if (currentFrame.colors[node.id] === "black") return "is-visited";
      if (currentFrame.colors[node.id] === "gray") return "is-candidate";
      return "is-dimmed";
    }

    function edgeClass(edge) {
      if (!currentFrame) return "";
      if (currentFrame.activeEdgeId === edge.id) return "is-active";
      if (currentFrame.edgeTypes[edge.id] === "tree") return "is-visited";
      if (currentFrame.edgeTypes[edge.id]) return "is-rejected";
      return "is-dimmed";
    }

    function renderGraph() {
      if (!graph.nodes.length) {
        if (graphController) {
          graphController.destroy();
          graphController = null;
        }
        figure.svg.setAttribute("viewBox", "0 0 920 560");
        drawing.clear(figure.svg, "Пустой граф", "Добавьте вершину, чтобы начать обход");
        drawing.text(figure.svg, 460, 280, "Добавьте первую вершину", "is-muted", "middle");
        return;
      }
      const options = {
        layout: { type: "circle", width: 920, height: 560, padding: 96 },
        title: fields.algorithm.value === "bfs" ? "Пошаговый BFS" : "Пошаговый DFS",
        description: "Цвета вершин, активное ребро и дерево обхода синхронизированы с таблицей состояния",
        nodeClass: nodeClass,
        edgeClass: edgeClass,
        onNodeActivate: function (node) {
          fields.source.value = node.id;
          mounted.reset();
          mounted.announce("Стартовая вершина изменена на " + node.label);
        },
        nodeAriaLabel: function (node) {
          const color = currentFrame && currentFrame.colors[node.id] ? currentFrame.colors[node.id] : "white";
          return "Вершина " + node.label + ", состояние " + color + ". Нажмите, чтобы выбрать её стартовой";
        },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: true }, options));
    }

    function createState() {
      const source = graph.nodes.length ? fields.source.value : null;
      return core.createState(graph, { algorithm: fields.algorithm.value, source: source });
    }

    function render(state) {
      const model = core.visualModel(state);
      currentFrame = model.frame;
      renderGraph();
      renderRepresentation();
      renderVertexTable(model.frame);
      metrics.querySelector('[data-metric="nodes"]').textContent = String(graph.nodes.length);
      metrics.querySelector('[data-metric="edges"]').textContent = String(graph.edges.length);
      metrics.querySelector('[data-metric="components"]').textContent = String(model.frame.componentCount);
      metrics.querySelector('[data-metric="frame"]').textContent =
        String(model.cursor + 1) + " / " + String(model.frameCount);
      detail.querySelector("[data-current-step]").textContent = model.frame.message;
      detail.querySelector("[data-frontier-title]").textContent = model.algorithm === "bfs" ? "Очередь" : "Стек";
      detail.querySelector("[data-frontier]").textContent = model.frame.frontier.length
        ? model.frame.frontier.join(" → ") : "∅";
      detail.querySelector("[data-order]").textContent = model.frame.order.length
        ? model.frame.order.join(" → ") : "∅";
      detail.querySelector("[data-tree]").textContent = model.frame.treeEdges.length
        ? model.frame.treeEdges.join(", ") : "∅";
      figure.caption.textContent = model.algorithm.toUpperCase() + ": " + model.frame.message +
        ". Чёрные вершины завершены, серые находятся во frontier, бледные ещё не открыты";
    }

    function updateGraph(nextGraph, message) {
      graph = nextGraph;
      syncEditor();
      mounted.reset();
      if (message) mounted.announce(message);
    }

    function bindEditor(api) {
      fields.preset.addEventListener("change", function () {
        updateGraph(core.preset(fields.preset.value), "Загружен новый пример графа");
      });
      fields.algorithm.addEventListener("change", api.reset);
      fields.source.addEventListener("change", api.reset);
      fields.representation.addEventListener("change", api.render);
      fields.directed.addEventListener("change", function () {
        updateGraph(core.graphWithDirection(graph, fields.directed.checked),
          fields.directed.checked ? "Все рёбра стали ориентированными" : "Все рёбра стали неориентированными");
      });
      actions.addNode.addEventListener("click", function () {
        const label = fields.nodeLabel.value.trim();
        if (!label) {
          api.showError("Введите название новой вершины");
          fields.nodeLabel.focus();
          return;
        }
        try {
          const id = nextId("v", graph.nodes);
          updateGraph(core.graphWithNode(graph, { id: id, label: label }), "Добавлена вершина " + label);
          fields.nodeLabel.value = "";
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      actions.removeNode.addEventListener("click", function () {
        if (!fields.removeNode.value) return;
        try {
          updateGraph(core.graphWithoutNode(graph, fields.removeNode.value), "Вершина и её рёбра удалены");
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      actions.addEdge.addEventListener("click", function () {
        if (!fields.edgeSource.value || !fields.edgeTarget.value) return;
        try {
          updateGraph(core.graphWithEdge(graph, {
            id: nextId("e", graph.edges), source: fields.edgeSource.value,
            target: fields.edgeTarget.value, directed: graph.directed,
          }), "Ребро добавлено; трасса обхода построена заново");
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      actions.removeEdge.addEventListener("click", function () {
        if (!fields.removeEdge.value) return;
        try {
          updateGraph(core.graphWithoutEdge(graph, fields.removeEdge.value), "Ребро удалено; представление обновлено");
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    syncEditor();
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      maxAutomaticSteps: 320,
      bind: bindEditor,
    });
  });
})();
