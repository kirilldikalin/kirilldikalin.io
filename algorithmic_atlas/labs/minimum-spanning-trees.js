(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.MinimumSpanningTreesCore;

  runtime.boot("minimum-spanning-trees", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один граф, три способа строить минимальный остов",
      description: "Редактируйте веса и рёбра, затем синхронно наблюдайте разрез, безопасное ребро, компоненты и накопленный вес",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Пример<select data-field="preset"><option value="unique">Единственный MST</option><option value="multiple">Несколько MST</option><option value="parallel">Петли и параллельные рёбра</option><option value="disconnected">Несвязный граф</option><option value="singleton">Одна вершина</option><option value="signed">Отрицательные и большие веса</option></select></label>' +
      '<label>Алгоритм<select data-field="mode"><option value="kruskal">Kruskal · глобальный порядок</option><option value="prim">Prim · один растущий компонент</option><option value="boruvka">Borůvka · параллельные слияния</option></select></label>' +
      '<label>Старт Prim<select data-field="root"></select></label>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<textarea data-field="vertices" rows="2" spellcheck="false" aria-describedby="mst-editor-note"></textarea></label>' +
      '<label class="atlas-lab__field is-wide">Рёбра: начало конец вес; …<textarea data-field="edges" rows="4" spellcheck="false" aria-describedby="mst-editor-note"></textarea></label>' +
      '<div class="atlas-lab__field is-wide"><span id="mst-editor-note">Порядок строк задаёт стабильный ID ребра; повторы концов и петли сохраняются</span><div class="atlas-lab__actions"><button data-action="apply" type="button">Применить граф</button></div></div>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      mode: shell.controls.querySelector('[data-field="mode"]'),
      root: shell.controls.querySelector('[data-field="root"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
    };
    const applyButton = shell.controls.querySelector('[data-action="apply"]');

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Вершины</dt><dd data-metric="nodes">0</dd></div>' +
      '<div><dt>Рёбра леса</dt><dd data-metric="selected">0</dd></div>' +
      '<div><dt>Компоненты</dt><dd data-metric="components">0</dd></div>' +
      '<div><dt>Суммарный вес</dt><dd data-metric="weight">0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "minimum-spanning-trees-visual",
      title: "Взвешенный граф и выбранный остовный лес",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const stepPanel = document.createElement("section");
    stepPanel.className = "atlas-lab__panel";
    stepPanel.innerHTML =
      '<h4>Текущий шаг</h4><p data-current-step></p>' +
      '<dl class="atlas-lab__metrics"><div><dt>Разрез: левая сторона</dt><dd data-cut-left>∅</dd></div><div><dt>Правая сторона</dt><dd data-cut-right>∅</dd></div><div><dt>Кандидаты</dt><dd data-candidates>∅</dd></div><div><dt>Безопасное ребро</dt><dd data-safe-edge>—</dd></div></dl>';
    shell.workspace.appendChild(stepPanel);

    const componentPanel = document.createElement("section");
    componentPanel.className = "atlas-lab__panel";
    componentPanel.innerHTML =
      '<h4>Компоненты и disjoint-set union</h4>' +
      '<p data-component-list></p><div class="atlas-lab__table-wrap" tabindex="0" data-dsu-table></div>';
    shell.workspace.appendChild(componentPanel);

    const resultPanel = document.createElement("section");
    resultPanel.className = "atlas-lab__panel";
    resultPanel.innerHTML =
      '<h4>Оптимальность и единственность</h4><p data-optimality></p><p class="atlas-lab__note" data-witness></p>';
    shell.workspace.appendChild(resultPanel);

    let graph = core.graphFromPreset("unique");
    let graphController = null;
    let currentFrame = null;
    let mounted = null;

    function option(value, label) {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = label;
      return element;
    }

    function replaceRootOptions(preferred) {
      const previous = preferred === undefined ? fields.root.value : preferred;
      fields.root.replaceChildren();
      graph.nodes.forEach(function (node) {
        fields.root.appendChild(option(node.id, node.label));
      });
      if (graph.nodes.some(function (node) { return node.id === previous; })) {
        fields.root.value = previous;
      }
      fields.root.disabled = fields.mode.value !== "prim" || graph.nodes.length === 0;
    }

    function syncEditor(preferredRoot) {
      const text = core.graphText(graph);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
      replaceRootOptions(preferredRoot);
    }

    function makeCell(tag, text, scope) {
      const cell = document.createElement(tag);
      cell.textContent = text;
      if (scope) cell.scope = scope;
      return cell;
    }

    function renderDsu(frame) {
      componentPanel.querySelector("[data-component-list]").textContent = frame.components.length
        ? frame.components.map(function (group) { return "{" + group.join(", ") + "}"; }).join(" · ")
        : "∅";
      const wrap = componentPanel.querySelector("[data-dsu-table]");
      wrap.replaceChildren();
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Вершина", "Родитель", "Корень", "Размер компоненты"].forEach(function (label) {
        headRow.appendChild(makeCell("th", label, "col"));
      });
      head.appendChild(headRow);
      const body = document.createElement("tbody");
      frame.dsu.forEach(function (entry) {
        const row = document.createElement("tr");
        [entry.id, entry.parent, entry.root, String(entry.size)].forEach(function (value, index) {
          row.appendChild(makeCell(index === 0 ? "th" : "td", value, index === 0 ? "row" : null));
        });
        body.appendChild(row);
      });
      table.append(head, body);
      wrap.appendChild(table);
    }

    function nodeClass(node) {
      if (!currentFrame) return "";
      if (currentFrame.activeVertexId === node.id) return "is-active";
      if (currentFrame.cutLeft.includes(node.id)) return "is-visited";
      if (currentFrame.cutRight.includes(node.id)) return "is-dimmed";
      return "";
    }

    function edgeClass(edge) {
      if (!currentFrame) return "";
      if (currentFrame.activeEdgeId === edge.id) return "is-active";
      if (currentFrame.selectedEdgeIds.includes(edge.id)) return "is-visited";
      if (currentFrame.candidateEdgeIds.includes(edge.id)) return "is-candidate";
      if (currentFrame.rejectedEdgeIds.includes(edge.id)) return "is-rejected";
      return "is-dimmed";
    }

    function edgeDescription(edge) {
      return edge.id + ": " + edge.source + " — " + edge.target + ", вес " + edge.weight;
    }

    function renderGraph() {
      if (!graph.nodes.length) {
        if (graphController) {
          graphController.destroy();
          graphController = null;
        }
        drawing.clear(figure.svg, "Пустой граф", "Добавьте хотя бы одну вершину");
        drawing.text(figure.svg, 460, 280, "Добавьте первую вершину", "is-muted", "middle");
        return;
      }
      const options = {
        layout: { type: "circle", width: 920, height: 560, padding: 104 },
        title: "Минимальный остов: " + fields.mode.options[fields.mode.selectedIndex].textContent,
        description: "Активное ребро, разрез и компоненты синхронизированы с числовым состоянием",
        nodeClass: nodeClass,
        edgeClass: edgeClass,
        edgeAriaLabel: function (edge) {
          const status = currentFrame && currentFrame.selectedEdgeIds.includes(edge.id)
            ? ", входит в текущий лес"
            : currentFrame && currentFrame.activeEdgeId === edge.id ? ", рассматривается сейчас" : "";
          return edgeDescription(edge) + status;
        },
        onNodeActivate: function (node) {
          if (fields.mode.value !== "prim") {
            mounted.announce("Стартовая вершина нужна только алгоритму Prim");
            return;
          }
          fields.root.value = node.id;
          mounted.reset();
          mounted.announce("Старт Prim изменён на " + node.label);
        },
        nodeAriaLabel: function (node) {
          return "Вершина " + node.label + (fields.mode.value === "prim"
            ? ". Нажмите, чтобы выбрать её стартом Prim" : "");
        },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: true }, options));
    }

    function createState() {
      return core.createState({
        mode: fields.mode.value,
        graph: graph,
        root: fields.root.value,
      });
    }

    function render(state) {
      const frame = state.current;
      currentFrame = frame;
      renderGraph();
      renderDsu(frame);
      metrics.querySelector('[data-metric="nodes"]').textContent = String(graph.nodes.length);
      metrics.querySelector('[data-metric="selected"]').textContent = String(frame.selectedEdgeIds.length);
      metrics.querySelector('[data-metric="components"]').textContent = String(frame.components.length);
      metrics.querySelector('[data-metric="weight"]').textContent = frame.totalWeight;
      metrics.querySelector('[data-metric="frame"]').textContent =
        String(state.cursor + 1) + " / " + String(state.frames.length);
      stepPanel.querySelector("[data-current-step]").textContent = frame.message;
      stepPanel.querySelector("[data-cut-left]").textContent = frame.cutLeft.length
        ? frame.cutLeft.join(", ") : "∅";
      stepPanel.querySelector("[data-cut-right]").textContent = frame.cutRight.length
        ? frame.cutRight.join(", ") : "∅";
      stepPanel.querySelector("[data-candidates]").textContent = frame.candidateEdgeIds.length
        ? frame.candidateEdgeIds.join(", ") : "∅";
      stepPanel.querySelector("[data-safe-edge]").textContent = frame.safeEdgeId || "—";
      const optimality = resultPanel.querySelector("[data-optimality]");
      const witness = resultPanel.querySelector("[data-witness]");
      if (!state.finished) {
        optimality.textContent = "Единственность будет проверена по фундаментальным циклам после завершения";
        witness.textContent = "Равный обмен не угадывается по рисунку: нужны веса на всём пути в построенном лесу";
      } else {
        optimality.textContent = state.optimality.unique
          ? "Полученный минимальный остовный лес единственен"
          : "Минимальный остовный лес не единственен";
        witness.textContent = state.optimality.witness
          ? "Можно добавить " + state.optimality.witness.addEdgeId + " и удалить " +
            state.optimality.witness.removeEdgeId + " того же веса " + state.optimality.witness.weight
          : state.optimality.reason;
      }
      figure.caption.textContent = frame.message + " Выбрано рёбер: " +
        frame.selectedEdgeIds.length + ", суммарный вес: " + frame.totalWeight;
    }

    function setGraph(nextGraph, preferredRoot, message) {
      graph = nextGraph;
      syncEditor(preferredRoot);
      if (graphController) graphController.resetView();
      mounted.reset();
      if (message) mounted.announce(message);
    }

    function bind(api) {
      fields.preset.addEventListener("change", function () {
        const preset = core.PRESETS[fields.preset.value];
        setGraph(core.graphFromPreset(fields.preset.value), preset.root, "Загружен новый пример графа");
      });
      fields.mode.addEventListener("change", function () {
        replaceRootOptions(fields.root.value);
        api.reset();
      });
      fields.root.addEventListener("change", api.reset);
      applyButton.addEventListener("click", function () {
        try {
          const next = core.parseGraphText(fields.vertices.value, fields.edges.value);
          setGraph(next, fields.root.value, "Редактируемый граф применён; трасса построена заново");
          api.clearError();
        } catch (error) {
          api.showError(error.message);
        }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    syncEditor("A");
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 4096,
      bind: bind,
    });
  });
})();
