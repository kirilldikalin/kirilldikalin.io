(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.MaxFlowMinCutCore;

  if (!runtime || !graphRuntime || !core) {
    throw new Error("Лаборатория максимального потока не получила общие зависимости.");
  }

  runtime.boot("max-flow-min-cut", function (root) {
    const shell = runtime.createShell(root, {
      title: "Поток, остаточная сеть и разрез в одном вычислении",
      description: "Каждый кадр синхронно показывает поток на исходных дугах, прямые и обратные остаточные ёмкости, выбранный путь и текущий кандидат в разрез",
    });

    shell.controls.innerHTML =
      '<label>Алгоритм<select data-field="mode">' +
        '<option value="ford-fulkerson">Форд — Фалкерсон · DFS</option>' +
        '<option value="edmonds-karp" selected>Эдмондс — Карп · BFS</option>' +
        '<option value="dinic">Диниц · слоистая сеть</option>' +
      '</select></label>' +
      '<label>Сценарий<select data-field="preset">' +
        '<option value="classic" selected>Классическая сеть</option>' +
        '<option value="cancellation">Отмена прежнего выбора</option>' +
        '<option value="parallelZero">Параллельные и нулевые дуги</option>' +
        '<option value="unreachable">Сток недостижим</option>' +
        '<option value="multiple">Несколько оптимумов</option>' +
        '<option value="huge">Большие точные ёмкости</option>' +
        '<option value="custom">Своя сеть</option>' +
      '</select></label>' +
      '<label>Порядок DFS<select data-field="path-order"><option value="input">как во вводе</option><option value="reverse">обратный</option></select></label>' +
      '<label>Источник<select data-field="source"></select></label>' +
      '<label>Сток<select data-field="sink"></select></label>' +
      '<div class="atlas-lab__field"><span>Изменения сети</span><button type="button" data-action="apply">Применить</button></div>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<input data-field="vertices" type="text" autocomplete="off" spellcheck="false" aria-describedby="flow-editor-help"></label>' +
      '<label class="atlas-lab__field is-wide">Дуги: начало конец ёмкость; …<input data-field="edges" type="text" autocomplete="off" spellcheck="false" aria-describedby="flow-editor-help"></label>' +
      '<p id="flow-editor-help" class="atlas-lab__note atlas-lab__field is-wide">Ёмкость — неотрицательное целое до 40 цифр. Параллельные дуги разрешены; максимум 18 вершин и 54 дуги</p>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      pathOrder: shell.controls.querySelector('[data-field="path-order"]'),
      source: shell.controls.querySelector('[data-field="source"]'),
      sink: shell.controls.querySelector('[data-field="sink"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
      apply: shell.controls.querySelector('[data-action="apply"]'),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Значение потока</dt><dd data-metric="value">0</dd></div>' +
      '<div><dt>Бутылочное горлышко</dt><dd data-metric="bottleneck">—</dd></div>' +
      '<div><dt>Добавление</dt><dd data-metric="augmentation">0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">1 / 1</dd></div>';
    shell.workspace.appendChild(metrics);

    const originalFigure = runtime.createFigure(shell.workspace, {
      id: "max-flow-network",
      title: "Исходная сеть · поток / ёмкость",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab",
    });
    const residualFigure = runtime.createFigure(shell.workspace, {
      id: "max-flow-residual",
      title: "Остаточная сеть · доступная ёмкость",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab",
    });

    const details = document.createElement("section");
    details.className = "atlas-lab__panel";
    details.innerHTML =
      '<h4>Текущий шаг</h4><p data-detail="operation"></p>' +
      '<h4>Путь и остаточные дуги</h4><p data-detail="path"></p>' +
      '<h4>Слоистая сеть / поиск</h4><p data-detail="levels"></p>' +
      '<h4>Текущий разрез</h4><p data-detail="cut"></p>';
    shell.workspace.appendChild(details);

    const tableWrap = document.createElement("div");
    tableWrap.className = "atlas-lab__table-wrap";
    tableWrap.tabIndex = 0;
    tableWrap.setAttribute("aria-label", "Потоки и остаточные ёмкости всех дуг");
    const table = document.createElement("table");
    table.innerHTML =
      '<thead><tr><th>Дуга</th><th>Поток / ёмкость</th><th>Вперёд</th><th>Назад</th><th>Состояние</th></tr></thead><tbody></tbody>';
    tableWrap.appendChild(table);
    shell.workspace.appendChild(tableWrap);

    let networkController = null;
    let residualController = null;
    let networkSignature = "";
    let residualSignature = "";

    function option(select, value, label) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      select.appendChild(item);
    }

    function rebuildEndpointSelects(network, preferredSource, preferredSink) {
      fields.source.replaceChildren();
      fields.sink.replaceChildren();
      network.nodes.forEach(function (node) {
        option(fields.source, node.id, node.label);
        option(fields.sink, node.id, node.label);
      });
      if (network.nodes.some(function (node) { return node.id === preferredSource; })) fields.source.value = preferredSource;
      if (network.nodes.some(function (node) { return node.id === preferredSink; })) fields.sink.value = preferredSink;
      if (!fields.source.value && network.nodes.length) fields.source.value = network.nodes[0].id;
      if (!fields.sink.value && network.nodes.length) fields.sink.value = network.nodes[network.nodes.length - 1].id;
    }

    function loadPreset(id) {
      const preset = core.PRESETS[id];
      if (!preset) return;
      const network = core.networkFromPreset(id);
      const text = core.networkText(network);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
      rebuildEndpointSelects(network, preset.source, preset.sink);
      if (id === "cancellation") fields.pathOrder.value = "input";
    }

    function parseEditor() {
      return core.parseNetworkText(fields.vertices.value, fields.edges.value);
    }

    function createState() {
      const network = parseEditor();
      const oldSource = fields.source.value;
      const oldSink = fields.sink.value;
      rebuildEndpointSelects(network, oldSource, oldSink);
      if (fields.source.value === fields.sink.value && network.nodes.length > 1) {
        fields.sink.value = network.nodes[network.nodes.length - 1].id;
      }
      return core.createState({
        mode: fields.mode.value,
        network: network,
        source: fields.source.value,
        sink: fields.sink.value,
        pathOrder: fields.pathOrder.value,
      });
    }

    function compact(value) {
      const text = String(value);
      return text.length <= 12 ? text : text.slice(0, 5) + "…" + text.slice(-4);
    }

    function layerMap(network, source, sink) {
      const layers = {};
      network.nodes.forEach(function (node, index) {
        if (node.id === source) layers[node.id] = 0;
        else if (node.id === sink) layers[node.id] = 3;
        else layers[node.id] = 1 + (index % 2);
      });
      return layers;
    }

    function originalGraph(state) {
      return {
        id: state.network.id + "-original",
        label: "Исходная сеть",
        directed: true,
        nodes: state.network.nodes.map(function (node) {
          return { id: node.id, label: node.label };
        }),
        edges: state.network.edges.map(function (edge) {
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            directed: true,
            weight: state.current.flows[edge.id] + "/" + edge.capacity,
          };
        }),
      };
    }

    function residualGraph(state) {
      return {
        id: state.network.id + "-residual",
        label: "Остаточная сеть",
        directed: true,
        nodes: state.network.nodes.map(function (node) {
          return { id: node.id, label: node.label };
        }),
        edges: state.current.residual.filter(function (arc) {
          return BigInt(arc.capacity) > 0n;
        }).map(function (arc) {
          return {
            id: arc.id,
            source: arc.source,
            target: arc.target,
            directed: true,
            weight: (arc.kind === "reverse" ? "↩ " : "") + compact(arc.capacity),
          };
        }),
      };
    }

    function signature(graph) {
      return JSON.stringify({
        nodes: graph.nodes.map(function (node) { return node.id; }),
        edges: graph.edges.map(function (edge) { return [edge.id, edge.source, edge.target]; }),
      });
    }

    function renderOriginal(state) {
      const graph = originalGraph(state);
      const active = new Set(state.current.activeEdgeIds);
      const sourceSide = new Set(state.current.cut.sourceSide);
      const options = {
        title: "Исходная сеть с текущим потоком",
        description: state.current.message + " Подпись дуги имеет вид поток делить на ёмкость.",
        layout: { type: "layers", width: 920, height: 560, padding: 105, layerById: layerMap(state.network, state.source, state.sink) },
        nodeRadius: 37,
        nodeClass: function (node) {
          if (state.current.cut.isSeparating && sourceSide.has(node.id)) return "is-visited";
          if (state.current.activePathVertices.includes(node.id)) return "is-active";
          return "";
        },
        edgeClass: function (edge) {
          if (active.has(edge.id)) return "is-active";
          const original = state.network.edges.find(function (item) { return item.id === edge.id; });
          if (state.current.cut.isSeparating && sourceSide.has(original.source) && !sourceSide.has(original.target)) return "is-rejected";
          if (BigInt(state.current.flows[edge.id]) === BigInt(original.capacity) && BigInt(original.capacity) > 0n) return "is-visited";
          return "";
        },
      };
      const nextSignature = signature(graph);
      if (!networkController) networkController = graphRuntime.mount(originalFigure.svg, graph, options);
      else networkController.update(graph, Object.assign({ preserveView: nextSignature === networkSignature }, options));
      networkSignature = nextSignature;
      originalFigure.caption.textContent = state.current.cut.isSeparating
        ? "Красные дуги пересекают сертифицирующий разрез; их суммарная ёмкость равна потоку"
        : "Активный путь выделен; насыщенные дуги отмечены отдельно";
    }

    function renderResidual(state) {
      const graph = residualGraph(state);
      const active = new Set(state.current.activeArcIds);
      const options = {
        title: "Остаточная сеть",
        description: "Прямые дуги показывают свободную ёмкость, дуги со знаком возврата — объём, который разрешено отменить.",
        layout: { type: "layers", width: 920, height: 560, padding: 105, layerById: layerMap(state.network, state.source, state.sink) },
        nodeRadius: 37,
        nodeClass: function (node) {
          if (state.current.activePathVertices.includes(node.id)) return "is-active";
          if (state.current.levels && state.current.levels[node.id] !== null) return "is-candidate";
          return "";
        },
        edgeClass: function (edge) {
          if (active.has(edge.id)) return "is-active";
          return edge.id.endsWith(":reverse") ? "is-candidate" : "";
        },
      };
      const nextSignature = signature(graph);
      if (!residualController) residualController = graphRuntime.mount(residualFigure.svg, graph, options);
      else residualController.update(graph, Object.assign({ preserveView: nextSignature === residualSignature }, options));
      residualSignature = nextSignature;
      residualFigure.caption.textContent = state.current.usesReverseArc
        ? "Активный путь содержит обратную дугу: прежний поток на исходной дуге уменьшается"
        : "Нулевые остаточные дуги скрыты с рисунка, но остаются в таблице";
    }

    function residualByEdge(frame, edgeId, kind) {
      const arc = frame.residual.find(function (item) {
        return item.edgeId === edgeId && item.kind === kind;
      });
      return arc ? arc.capacity : "0";
    }

    function renderTable(state) {
      const frame = state.current;
      const active = new Set(frame.activeEdgeIds);
      const sourceSide = new Set(frame.cut.sourceSide);
      table.tBodies[0].replaceChildren();
      state.network.edges.forEach(function (edge) {
        const row = document.createElement("tr");
        let status = "свободна";
        if (active.has(edge.id)) status = "путь";
        else if (frame.cut.isSeparating && sourceSide.has(edge.source) && !sourceSide.has(edge.target)) status = "разрез";
        else if (BigInt(frame.flows[edge.id]) === BigInt(edge.capacity)) status = "насыщена";
        [edge.source + " → " + edge.target,
          frame.flows[edge.id] + " / " + edge.capacity,
          residualByEdge(frame, edge.id, "forward"),
          residualByEdge(frame, edge.id, "reverse"),
          status].forEach(function (text) {
          const cell = document.createElement("td");
          cell.textContent = text;
          row.appendChild(cell);
        });
        table.tBodies[0].appendChild(row);
      });
    }

    function levelsText(state) {
      if (state.current.levels) {
        return state.network.nodes.map(function (node) {
          const level = state.current.levels[node.id];
          return node.id + ": " + (level === null ? "∞" : String(level));
        }).join("; ");
      }
      return state.current.queue.length
        ? "Порядок просмотра: " + state.current.queue.join(" → ")
        : "Слоистая сеть строится только в режиме Диница";
    }

    function cutText(frame) {
      if (!frame.cut.isSeparating) {
        return "Из истока пока достижим сток: сертифицирующего разреза ещё нет";
      }
      return "S = {" + frame.cut.sourceSide.join(", ") + "}; T = {" +
        frame.cut.sinkSide.join(", ") + "}; c(S,T) = " + frame.cut.capacity;
    }

    function render(state, context) {
      renderOriginal(state);
      renderResidual(state);
      renderTable(state);
      metrics.querySelector('[data-metric="value"]').textContent = state.current.value;
      metrics.querySelector('[data-metric="bottleneck"]').textContent = state.current.bottleneck || "—";
      metrics.querySelector('[data-metric="augmentation"]').textContent = String(state.current.augmentation);
      metrics.querySelector('[data-metric="frame"]').textContent = String(state.cursor + 1) + " / " + state.frames.length;
      details.querySelector('[data-detail="operation"]').textContent = state.current.message;
      details.querySelector('[data-detail="path"]').textContent = state.current.activeArcIds.length
        ? state.current.activePathVertices.join(" → ") + "; " +
          state.current.activeArcIds.map(function (id) {
            const arc = state.current.residual.find(function (item) { return item.id === id; });
            return arc ? (arc.kind === "reverse" ? "назад " : "вперёд ") + arc.source + "→" + arc.target : id;
          }).join(", ")
        : "Увеличивающий путь на этом кадре не выбран";
      details.querySelector('[data-detail="levels"]').textContent = levelsText(state);
      details.querySelector('[data-detail="cut"]').textContent = cutText(state.current);
      fields.pathOrder.disabled = fields.mode.value !== "ford-fulkerson";
      if (context && state.current.phase === "finish") {
        context.announce("Максимальный поток " + state.current.value + ". Минимальный разрез имеет ту же ёмкость.");
      }
    }

    loadPreset("classic");
    runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 4096,
      bind: function (api) {
        fields.mode.addEventListener("change", api.reset);
        fields.pathOrder.addEventListener("change", api.reset);
        fields.source.addEventListener("change", api.reset);
        fields.sink.addEventListener("change", api.reset);
        fields.preset.addEventListener("change", function () {
          if (fields.preset.value !== "custom") loadPreset(fields.preset.value);
          api.reset();
        });
        [fields.vertices, fields.edges].forEach(function (field) {
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
