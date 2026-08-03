(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.ConnectivityCutsNetworkDesignCore;

  if (!runtime || !graphRuntime || !core) {
    throw new Error("Лаборатория связности не получила общие зависимости.");
  }

  runtime.boot("connectivity-cuts-network-design", function (root) {
    const shell = runtime.createShell(root, {
      title: "Что переживёт удаление вершины или ребра",
      description: "DFS-индексы, low-link, мосты, точки сочленения и точные малые разрезы читаются из одного редактируемого неориентированного мультиграфа",
    });

    shell.controls.innerHTML =
      '<label>Режим<select data-field="mode">' +
        '<option value="low-link" selected>DFS и low-link</option>' +
        '<option value="bridges">Мосты</option>' +
        '<option value="articulation">Точки сочленения</option>' +
        '<option value="s-t-cut">Минимальный s–t-разрез</option>' +
        '<option value="global-cut">Глобальный разрез</option>' +
      '</select></label>' +
      '<label>Сценарий<select data-field="preset">' +
        '<option value="blocks" selected>Три блока и два шарнира</option>' +
        '<option value="parallel">Параллельные рёбра и петля</option>' +
        '<option value="disconnected">Несвязный граф</option>' +
        '<option value="equalCuts">Несколько равных разрезов</option>' +
        '<option value="weighted">Взвешенная сеть</option>' +
        '<option value="singleton">Одна вершина</option>' +
        '<option value="custom">Свой граф</option>' +
      '</select></label>' +
      '<label>Источник s<select data-field="source"></select></label>' +
      '<label>Сток t<select data-field="sink"></select></label>' +
      '<label>Вершина для отказа<select data-field="remove-vertex"></select></label>' +
      '<div class="atlas-lab__field"><span>Отказ вершины</span><button type="button" data-action="toggle-vertex">Удалить / вернуть</button></div>' +
      '<label>Ребро для отказа<select data-field="remove-edge"></select></label>' +
      '<div class="atlas-lab__field"><span>Отказ ребра</span><button type="button" data-action="toggle-edge">Удалить / вернуть</button></div>' +
      '<div class="atlas-lab__field"><span>Состояние отказов</span><button type="button" data-action="restore">Вернуть всё</button></div>' +
      '<div class="atlas-lab__field"><span>Изменения графа</span><button type="button" data-action="apply">Применить</button></div>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<input data-field="vertices" type="text" autocomplete="off" spellcheck="false" aria-describedby="connectivity-editor-help"></label>' +
      '<label class="atlas-lab__field is-wide">Рёбра: вершина вершина [ёмкость]; …<input data-field="edges" type="text" autocomplete="off" spellcheck="false" aria-describedby="connectivity-editor-help"></label>' +
      '<p id="connectivity-editor-help" class="atlas-lab__note atlas-lab__field is-wide">Граф неориентированный. Параллельные рёбра, петли и нулевые ёмкости разрешены; максимум 14 вершин и 42 ребра</p>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      source: shell.controls.querySelector('[data-field="source"]'),
      sink: shell.controls.querySelector('[data-field="sink"]'),
      removeVertex: shell.controls.querySelector('[data-field="remove-vertex"]'),
      removeEdge: shell.controls.querySelector('[data-field="remove-edge"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
      toggleVertex: shell.controls.querySelector('[data-action="toggle-vertex"]'),
      toggleEdge: shell.controls.querySelector('[data-action="toggle-edge"]'),
      restore: shell.controls.querySelector('[data-action="restore"]'),
      apply: shell.controls.querySelector('[data-action="apply"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Компоненты</dt><dd data-metric="components">—</dd></div>' +
      '<div><dt>Мосты</dt><dd data-metric="bridges">—</dd></div>' +
      '<div><dt>Шарниры</dt><dd data-metric="articulations">—</dd></div>' +
      '<div><dt>Разрез</dt><dd data-metric="cut">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "connectivity-network-graph",
      title: "Граф, отказы и текущий сертификат",
      viewBox: "0 0 920 600",
      className: "atlas-graph-lab",
    });

    const details = document.createElement("section");
    details.className = "atlas-lab__panel";
    details.innerHTML =
      '<h4>Текущий шаг</h4><p data-detail="operation"></p>' +
      '<h4>Удалено</h4><p data-detail="removed"></p>' +
      '<h4>Компоненты</h4><p data-detail="components"></p>' +
      '<h4>Сертификат</h4><p data-detail="certificate"></p>';
    shell.workspace.appendChild(details);

    const tableWrap = document.createElement("div");
    tableWrap.className = "atlas-lab__table-wrap";
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute("aria-label", "Индексы DFS, low-link и компоненты вершин");
    const table = document.createElement("table");
    table.innerHTML =
      '<thead><tr><th>Вершина</th><th>tin</th><th>low</th><th>Родитель</th><th>Компонента</th><th>Состояние</th></tr></thead><tbody></tbody>';
    tableWrap.appendChild(table);
    shell.workspace.appendChild(tableWrap);

    let removedVertices = new Set();
    let removedEdges = new Set();
    let graphController = null;
    let graphSignature = "";

    function option(select, value, label) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      select.appendChild(item);
    }

    function rebuildControls(graph, preferredSource, preferredSink) {
      [fields.source, fields.sink, fields.removeVertex, fields.removeEdge].forEach(function (select) {
        select.replaceChildren();
      });
      graph.nodes.forEach(function (node) {
        option(fields.source, node.id, node.label);
        option(fields.sink, node.id, node.label);
        option(fields.removeVertex, node.id, (removedVertices.has(node.id) ? "↩ " : "") + node.label);
      });
      graph.edges.forEach(function (edge) {
        option(
          fields.removeEdge,
          edge.id,
          (removedEdges.has(edge.id) ? "↩ " : "") + edge.id + ": " +
            edge.source + "—" + edge.target + " · " + edge.capacity
        );
      });
      if (graph.nodes.some(function (node) { return node.id === preferredSource; })) fields.source.value = preferredSource;
      if (graph.nodes.some(function (node) { return node.id === preferredSink; })) fields.sink.value = preferredSink;
      if (!fields.source.value && graph.nodes.length) fields.source.value = graph.nodes[0].id;
      if (!fields.sink.value && graph.nodes.length) fields.sink.value = graph.nodes[graph.nodes.length - 1].id;
    }

    function loadPreset(id) {
      const preset = core.PRESETS[id];
      if (!preset) return;
      removedVertices = new Set();
      removedEdges = new Set();
      const graph = core.graphFromPreset(id);
      const text = core.graphText(graph);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
      rebuildControls(graph, preset.source, preset.sink);
    }

    function parseEditor() {
      return core.parseGraphText(fields.vertices.value, fields.edges.value);
    }

    function ensureEndpoints(baseGraph) {
      const effective = core.effectiveGraph(baseGraph, Array.from(removedVertices), Array.from(removedEdges));
      const oldSource = fields.source.value;
      const oldSink = fields.sink.value;
      rebuildControls(baseGraph, oldSource, oldSink);
      const available = effective.nodes.map(function (node) { return node.id; });
      if (!available.includes(fields.source.value)) fields.source.value = available[0] || "";
      if (!available.includes(fields.sink.value) || fields.sink.value === fields.source.value) {
        fields.sink.value = available.find(function (id) { return id !== fields.source.value; }) || available[0] || "";
      }
    }

    function createState() {
      const graph = parseEditor();
      ensureEndpoints(graph);
      return core.createState({
        mode: fields.mode.value,
        graph: graph,
        source: fields.source.value,
        sink: fields.sink.value,
        removedVertices: Array.from(removedVertices),
        removedEdges: Array.from(removedEdges),
      });
    }

    function componentIndex(frame, vertexId) {
      const index = frame.components.findIndex(function (component) {
        return component.includes(vertexId);
      });
      return index < 0 ? null : index + 1;
    }

    function displayGraph(state) {
      const frame = state.current;
      return {
        id: state.baseGraph.id,
        label: state.baseGraph.label,
        directed: false,
        nodes: state.baseGraph.nodes.map(function (node) {
          const tin = frame.discovery[node.id];
          const low = frame.low[node.id];
          const suffix = tin === null || tin === undefined ? "" : " " + String(tin) + "/" + String(low);
          return { id: node.id, label: node.label + suffix };
        }),
        edges: state.baseGraph.edges.map(function (edge) {
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            directed: false,
            weight: edge.capacity,
          };
        }),
      };
    }

    function renderGraph(state) {
      const frame = state.current;
      const graph = displayGraph(state);
      const removedVertexSet = new Set(state.removedVertices);
      const removedEdgeSet = new Set(state.removedEdges);
      const bridgeSet = new Set(frame.bridges);
      const articulationSet = new Set(frame.articulations);
      const cutEdges = new Set(frame.cut ? frame.cut.cutEdgeIds : []);
      const cutSide = new Set(frame.cut ? frame.cut.sourceSide : []);
      const options = {
        title: "Неориентированный граф и сертификат связности",
        description: frame.message + " Подпись вершины в DFS-режимах имеет вид вершина, tin/low.",
        layout: { type: "circle", width: 920, height: 600, padding: 108 },
        nodeRadius: 39,
        nodeClass: function (node) {
          if (removedVertexSet.has(node.id)) return "is-dimmed";
          if (node.id === frame.activeVertexId) return "is-active";
          if ((state.mode === "articulation" || frame.phase === "finish") && articulationSet.has(node.id)) return "is-rejected";
          if (frame.cut && cutSide.has(node.id)) return "is-visited";
          if (frame.discovery[node.id] !== null && frame.discovery[node.id] !== undefined) return "is-candidate";
          return "";
        },
        edgeClass: function (edge) {
          if (removedEdgeSet.has(edge.id) ||
            removedVertexSet.has(edge.source) ||
            removedVertexSet.has(edge.target)) return "is-dimmed";
          if (edge.id === frame.activeEdgeId) return "is-active";
          if (cutEdges.has(edge.id)) return "is-rejected";
          if ((state.mode === "bridges" || frame.phase === "finish") && bridgeSet.has(edge.id)) return "is-rejected";
          if (frame.edgeStack.includes(edge.id)) return "is-candidate";
          return "";
        },
      };
      const signature = JSON.stringify({
        nodes: graph.nodes.map(function (node) { return node.id; }),
        edges: graph.edges.map(function (edge) { return [edge.id, edge.source, edge.target]; }),
      });
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: signature === graphSignature }, options));
      graphSignature = signature;
      figure.caption.textContent = frame.cut
        ? "Красные рёбра пересекают показанный разрез; затемнённые элементы удалены пользователем"
        : "Красным отмечен итоговый мост или шарнир; активные значения tin/low берутся из кадра DFS";
    }

    function renderTable(state) {
      const frame = state.current;
      const removed = new Set(state.removedVertices);
      const articulation = new Set(frame.articulations);
      table.tBodies[0].replaceChildren();
      state.baseGraph.nodes.forEach(function (node) {
        const row = document.createElement("tr");
        let status = "не открыта";
        if (removed.has(node.id)) status = "удалена";
        else if (articulation.has(node.id)) status = "шарнир";
        else if (frame.discovery[node.id] !== null && frame.discovery[node.id] !== undefined) status = "посещена";
        [
          node.id,
          frame.discovery[node.id] === undefined ? "—" : frame.discovery[node.id],
          frame.low[node.id] === undefined ? "—" : frame.low[node.id],
          frame.parent[node.id] === undefined || frame.parent[node.id] === null ? "—" : frame.parent[node.id],
          componentIndex(frame, node.id) || "—",
          status,
        ].forEach(function (value) {
          const cell = document.createElement("td");
          cell.textContent = value === null ? "—" : String(value);
          row.appendChild(cell);
        });
        table.tBodies[0].appendChild(row);
      });
    }

    function certificateText(state) {
      const frame = state.current;
      if (frame.cut) {
        return "S = {" + frame.cut.sourceSide.join(", ") + "}; T = {" +
          frame.cut.sinkSide.join(", ") + "}; рёбра {" +
          (frame.cut.cutEdgeIds.join(", ") || "∅") + "}; ёмкость " + frame.cut.capacity;
      }
      if (state.mode === "bridges") return "Мосты: " + (frame.bridges.join(", ") || "нет");
      if (state.mode === "articulation") return "Точки сочленения: " + (frame.articulations.join(", ") || "нет");
      return "Рёберные блоки: " + (frame.biconnected.length
        ? frame.biconnected.map(function (block) { return "{" + block.join(", ") + "}"; }).join("; ")
        : "пока не выделены");
    }

    function render(state, context) {
      renderGraph(state);
      renderTable(state);
      const frame = state.current;
      metrics.querySelector('[data-metric="components"]').textContent =
        String(frame.baseComponentCount) + " → " + String(frame.components.length);
      metrics.querySelector('[data-metric="bridges"]').textContent = String(frame.bridges.length);
      metrics.querySelector('[data-metric="articulations"]').textContent = String(frame.articulations.length);
      metrics.querySelector('[data-metric="cut"]').textContent = frame.cut ? frame.cut.capacity : "—";
      details.querySelector('[data-detail="operation"]').textContent = frame.message;
      details.querySelector('[data-detail="removed"]').textContent =
        "Вершины: " + (state.removedVertices.join(", ") || "нет") +
        "; рёбра: " + (state.removedEdges.join(", ") || "нет");
      details.querySelector('[data-detail="components"]').textContent =
        frame.components.length
          ? frame.components.map(function (component, index) {
              return "C" + String(index + 1) + " = {" + component.join(", ") + "}";
            }).join("; ")
          : "После удаления вершин граф пуст";
      details.querySelector('[data-detail="certificate"]').textContent = certificateText(state);
      fields.source.disabled = fields.mode.value !== "s-t-cut";
      fields.sink.disabled = fields.mode.value !== "s-t-cut";
      if (context && frame.phase === "finish") context.announce(frame.message);
    }

    loadPreset("blocks");
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 4096,
      bind: function (api) {
        fields.mode.addEventListener("change", api.reset);
        fields.source.addEventListener("change", api.reset);
        fields.sink.addEventListener("change", api.reset);
        fields.preset.addEventListener("change", function () {
          if (fields.preset.value !== "custom") loadPreset(fields.preset.value);
          api.reset();
        });
        fields.toggleVertex.addEventListener("click", function () {
          const id = fields.removeVertex.value;
          if (!id) return;
          if (removedVertices.has(id)) removedVertices.delete(id);
          else removedVertices.add(id);
          api.reset();
        });
        fields.toggleEdge.addEventListener("click", function () {
          const id = fields.removeEdge.value;
          if (!id) return;
          if (removedEdges.has(id)) removedEdges.delete(id);
          else removedEdges.add(id);
          api.reset();
        });
        fields.restore.addEventListener("click", function () {
          removedVertices.clear();
          removedEdges.clear();
          api.reset();
        });
        [fields.vertices, fields.edges].forEach(function (field) {
          field.addEventListener("input", function () { fields.preset.value = "custom"; });
        });
        fields.apply.addEventListener("click", function () {
          removedVertices.clear();
          removedEdges.clear();
          api.reset();
        });
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
  });
})();
