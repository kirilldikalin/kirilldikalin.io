(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.SingleSourceShortestPathsCore;

  if (!runtime || !graphRuntime || !core) {
    throw new Error("Лаборатория кратчайших путей не получила общие зависимости.");
  }

  runtime.boot("single-source-shortest-paths", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один граф, четыре режима поиска пути",
      description: "Сравните BFS, топологический проход, Дейкстру и Bellman–Ford на одной разметке: активное ребро, очередь, релаксация и причина применимости остаются синхронными",
    });

    shell.controls.innerHTML =
      '<label>Алгоритм<select data-field="mode">' +
        '<option value="bfs">BFS · вес 1</option>' +
        '<option value="dag">DAG · топологический порядок</option>' +
        '<option value="dijkstra" selected>Дейкстра · веса ≥ 0</option>' +
        '<option value="bellman-ford">Bellman–Ford</option>' +
      '</select></label>' +
      '<label>Сценарий<select data-field="preset">' +
        '<option value="nonnegative" selected>Неотрицательные веса</option>' +
        '<option value="unit">Единичные веса</option>' +
        '<option value="dag">DAG с отрицательным ребром</option>' +
        '<option value="negativeEdge">Контрпример для Дейкстры</option>' +
        '<option value="negativeCycle">Отрицательный цикл</option>' +
        '<option value="unreachable">Недостижимая компонента</option>' +
        '<option value="custom">Свой граф</option>' +
      '</select></label>' +
      '<label>Источник<select data-field="source"></select></label>' +
      '<label>Целевая вершина<select data-field="target"></select></label>' +
      '<label>Тип рёбер<select data-field="directed"><option value="true" selected>ориентированные</option><option value="false">неориентированные</option></select></label>' +
      '<div class="atlas-lab__field"><span>Изменения графа</span><button type="button" data-action="apply">Применить</button></div>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<input data-field="vertices" type="text" autocomplete="off" spellcheck="false" aria-describedby="sssp-editor-help"></label>' +
      '<label class="atlas-lab__field is-wide">Рёбра: начало конец вес; …<input data-field="edges" type="text" autocomplete="off" spellcheck="false" aria-describedby="sssp-editor-help"></label>' +
      '<p id="sssp-editor-help" class="atlas-lab__note atlas-lab__field is-wide">Вес — целое число. Большие значения читаются как точные десятичные целые; максимум 18 вершин и 72 ребра</p>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      source: shell.controls.querySelector('[data-field="source"]'),
      target: shell.controls.querySelector('[data-field="target"]'),
      directed: shell.controls.querySelector('[data-field="directed"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
      apply: shell.controls.querySelector('[data-action="apply"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Применимость</dt><dd data-metric="accepted">—</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>' +
      '<div><dt>Проход / слой</dt><dd data-metric="iteration">—</dd></div>' +
      '<div><dt>Очередь</dt><dd data-metric="frontier">∅</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "single-source-shortest-paths-graph",
      title: "Граф и текущие верхние границы расстояний",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab",
    });

    const details = document.createElement("section");
    details.className = "atlas-lab__panel";
    details.innerHTML =
      '<h4>Почему режим принят или отклонён</h4><p data-detail="reason"></p>' +
      '<h4>Текущая операция</h4><p data-detail="operation"></p>' +
      '<h4>Релаксация</h4><p data-detail="relaxation"></p>' +
      '<h4>Восстановление</h4><p data-detail="path"></p>';
    shell.workspace.appendChild(details);

    const tableWrap = document.createElement("div");
    tableWrap.className = "atlas-lab__table-wrap";
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute("aria-label", "Метки расстояний и предшественники");
    const table = document.createElement("table");
    table.innerHTML =
      '<thead><tr><th>Вершина</th><th>Метка d</th><th>Предшественник</th><th>Состояние</th></tr></thead><tbody></tbody>';
    tableWrap.appendChild(table);
    shell.workspace.appendChild(tableWrap);

    let graphController = null;
    let graphSignature = "";
    let labController = null;

    function option(select, value, label) {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = label;
      select.appendChild(element);
    }

    function rebuildVertexSelects(graph, preferredSource, preferredTarget) {
      fields.source.replaceChildren();
      fields.target.replaceChildren();
      graph.nodes.forEach(function (node) {
        option(fields.source, node.id, node.label);
        option(fields.target, node.id, node.label);
      });
      if (graph.nodes.some(function (node) { return node.id === preferredSource; })) {
        fields.source.value = preferredSource;
      }
      const target = graph.nodes.some(function (node) { return node.id === preferredTarget; })
        ? preferredTarget
        : graph.nodes.some(function (node) { return node.id === "t"; })
          ? "t"
          : graph.nodes.length ? graph.nodes[graph.nodes.length - 1].id : undefined;
      if (target !== undefined) fields.target.value = target;
    }

    function loadPreset(id) {
      const preset = core.PRESETS[id];
      if (!preset) return;
      const graph = core.graphFromPreset(id);
      const text = core.graphText(graph);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
      fields.directed.value = preset.directed ? "true" : "false";
      rebuildVertexSelects(graph, preset.source, "t");
    }

    function parseEditor() {
      return core.parseGraphText(
        fields.vertices.value,
        fields.edges.value,
        fields.directed.value === "true"
      );
    }

    function createState() {
      const graph = parseEditor();
      const oldSource = fields.source.value;
      const oldTarget = fields.target.value;
      rebuildVertexSelects(graph, oldSource, oldTarget);
      return core.createState({
        mode: fields.mode.value,
        graph: graph,
        source: fields.source.value,
      });
    }

    function compactDistance(value) {
      if (value === null) return "∞";
      const text = String(value);
      if (text.length <= 5) return text;
      return text.slice(0, 2) + "…" + text.slice(-2);
    }

    function displayGraph(state) {
      const current = state.current;
      return {
        id: state.graph.id,
        label: state.graph.label,
        directed: state.graph.directed,
        nodes: state.graph.nodes.map(function (node) {
          return {
            id: node.id,
            label: node.id + "·" + compactDistance(current.distances[node.id]),
          };
        }),
        edges: state.graph.edges.map(function (edge) {
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            directed: edge.directed,
            weight: edge.weight,
          };
        }),
      };
    }

    function vertexSetFromFrontier(frontier) {
      return new Set((frontier || []).map(function (item) {
        return typeof item === "string" ? item : item.vertex;
      }));
    }

    function renderGraph(state) {
      const current = state.current;
      const frontier = vertexSetFromFrontier(current.frontier);
      const settled = new Set(current.settled || []);
      const predecessorEdges = new Set(Object.values(current.predecessors)
        .filter(Boolean)
        .map(function (predecessor) { return predecessor.edgeId; }));
      const negativeCycleEdges = new Set(current.negativeCycleEdgeIds || []);
      const negativeCycleVertices = new Set(current.negativeCycle || []);
      const graph = displayGraph(state);
      const signature = JSON.stringify({
        nodes: graph.nodes.map(function (node) { return node.id; }),
        edges: graph.edges.map(function (edge) {
          return [edge.id, edge.source, edge.target, edge.directed];
        }),
      });
      const options = {
        title: "Пошаговый поиск кратчайших путей",
        description: current.message + " Метки расстояний: " +
          state.graph.nodes.map(function (node) {
            return node.id + " — " + (current.distances[node.id] === null ? "недостижима" : current.distances[node.id]);
          }).join(", ") + ".",
        layout: { type: "circle", width: 920, height: 560, padding: 92 },
        nodeRadius: 39,
        nodeClass: function (node) {
          const classes = [];
          if (negativeCycleVertices.has(node.id)) classes.push("is-rejected");
          else if (node.id === current.activeVertexId) classes.push("is-active");
          else if (settled.has(node.id)) classes.push("is-visited");
          else if (frontier.has(node.id)) classes.push("is-candidate");
          else if (current.phase === "finish" && current.distances[node.id] === null) classes.push("is-dimmed");
          return classes.join(" ");
        },
        edgeClass: function (edge) {
          if (negativeCycleEdges.has(edge.id)) return "is-rejected";
          if (edge.id === current.activeEdgeId) return "is-active";
          if (predecessorEdges.has(edge.id)) return "is-visited";
          return "";
        },
        nodeAriaLabel: function (node) {
          const distance = current.distances[node.id];
          return "Вершина " + node.id + ", расстояние " + (distance === null ? "бесконечность" : distance);
        },
      };
      if (!graphController) {
        graphController = graphRuntime.mount(figure.svg, graph, options);
      } else {
        graphController.update(graph, Object.assign(options, {
          preserveView: signature === graphSignature,
        }));
      }
      graphSignature = signature;
      figure.caption.textContent = current.message;
    }

    function frontierText(frontier) {
      if (!frontier || frontier.length === 0) return "∅";
      return frontier.map(function (item) {
        return typeof item === "string" ? item : item.vertex + ":" + item.distance;
      }).join(" · ");
    }

    function relaxationText(relaxation) {
      if (!relaxation) return "Ребро пока не рассматривается";
      if (relaxation.candidate === null) {
        return "d(" + relaxation.source + ") = ∞, поэтому кандидат для " +
          relaxation.target + " не вычисляется. " + relaxation.note;
      }
      const previous = relaxation.previous === null ? "∞" : relaxation.previous;
      return "d(" + relaxation.target + ") = min(" + previous + ", d(" +
        relaxation.source + ") + " + relaxation.weight + " = " +
        relaxation.candidate + ")" + (relaxation.changed ? " — метка уменьшена. " : " — без изменения. ") +
        relaxation.note;
    }

    function pathText(state) {
      if (state.current.phase === "negative-cycle") {
        return state.current.negativeCycle
          ? "Цикл: " + state.current.negativeCycle.join(" → ") + ". Для достижимых из него вершин конечного кратчайшего расстояния нет."
          : "Улучшение на дополнительном проходе доказывает существование достижимого отрицательного цикла.";
      }
      if (!fields.target.value) return "Целевая вершина не выбрана";
      const path = core.reconstructPath(state, fields.target.value);
      if (!path) return "Путь до " + fields.target.value + " пока не восстановлен или вершина недостижима";
      return "До " + fields.target.value + ": " + path.join(" → ") +
        ", длина " + state.current.distances[fields.target.value];
    }

    function renderTable(state) {
      const current = state.current;
      const frontier = vertexSetFromFrontier(current.frontier);
      const settled = new Set(current.settled || []);
      const body = table.querySelector("tbody");
      body.replaceChildren();
      state.graph.nodes.forEach(function (node) {
        const row = document.createElement("tr");
        if (node.id === current.activeVertexId) row.className = "is-current";
        const predecessor = current.predecessors[node.id];
        let status = "не открыта";
        if (settled.has(node.id)) status = "окончательная";
        else if (frontier.has(node.id)) status = "в очереди";
        else if (current.distances[node.id] !== null) status = "верхняя граница";
        [
          node.id,
          current.distances[node.id] === null ? "∞" : current.distances[node.id],
          predecessor ? predecessor.vertex + " по " + predecessor.edgeId : "—",
          status,
        ].forEach(function (value) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
    }

    function render(state, context) {
      renderGraph(state);
      renderTable(state);
      metrics.querySelector('[data-metric="accepted"]').textContent = state.accepted ? "принят" : "отклонён";
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.cursor + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="iteration"]').textContent = state.current.iteration ? String(state.current.iteration) : "—";
      metrics.querySelector('[data-metric="frontier"]').textContent = frontierText(state.current.frontier);
      details.querySelector('[data-detail="reason"]').textContent = state.reason;
      details.querySelector('[data-detail="operation"]').textContent = state.current.message;
      details.querySelector('[data-detail="relaxation"]').textContent = relaxationText(state.current.relaxation);
      details.querySelector('[data-detail="path"]').textContent = pathText(state);
      if (context && state.current.phase === "negative-cycle") {
        context.announce("Bellman–Ford обнаружил достижимый отрицательный цикл.");
      }
    }

    loadPreset("nonnegative");
    labController = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 4096,
      bind: function (api) {
        fields.mode.addEventListener("change", api.reset);
        fields.source.addEventListener("change", api.reset);
        fields.target.addEventListener("change", api.render);
        fields.preset.addEventListener("change", function () {
          if (fields.preset.value !== "custom") loadPreset(fields.preset.value);
          api.reset();
        });
        [fields.vertices, fields.edges, fields.directed].forEach(function (field) {
          field.addEventListener("input", function () { fields.preset.value = "custom"; });
        });
        fields.apply.addEventListener("click", api.reset);
        shell.controls.addEventListener("submit", function (event) {
          event.preventDefault();
          api.reset();
        });
      },
    });
  });
})();
