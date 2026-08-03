(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.GraphMatchingsCore;

  runtime.boot("graph-matchings", function (root) {
    const shell = runtime.createShell(root, {
      title: "Увеличивающий путь и нечётный цветок",
      description: "Редактируйте граф и наблюдайте одно точное состояние: паросочетание, чередующийся лес, путь, покрытие Кёнига или сжатый цветок",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Представление<select data-field="mode"><option value="bipartite">Двудольный граф</option><option value="blossom">Общий граф и цветок</option></select></label>' +
      '<label>Пример<select data-field="preset"><option value="augmenting">Путь длины 3</option><option value="multiple">Несколько максимумов</option><option value="deficient">Нет совершенного</option><option value="parallel">Параллельные рёбра</option><option value="empty">Пустой граф</option><option value="singleton">Одна вершина</option><option value="blossom">Нечётный цветок</option><option value="oddCycle">Пятицикл</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<textarea data-field="vertices" rows="2" spellcheck="false" aria-describedby="matching-editor-note"></textarea></label>' +
      '<label class="atlas-lab__field is-wide">Рёбра: два конца в строке<textarea data-field="edges" rows="5" spellcheck="false" aria-describedby="matching-editor-note"></textarea></label>' +
      '<div class="atlas-lab__field is-wide"><span id="matching-editor-note">В двудольном режиме помечайте доли как A:L и 1:R. Порядок строк задаёт ID ребра, поэтому параллельные рёбра различимы</span><div class="atlas-lab__actions"><button data-action="apply" type="button">Применить граф</button></div></div>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
    };
    const apply = shell.controls.querySelector('[data-action="apply"]');

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Размер</dt><dd data-metric="size">0</dd></div>' +
      '<div><dt>Свободные вершины</dt><dd data-metric="free">0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>' +
      '<div><dt>Фаза</dt><dd data-metric="phase">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "graph-matchings-visual",
      title: "Граф и состояние поиска",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const statePanel = document.createElement("section");
    statePanel.className = "atlas-lab__panel";
    statePanel.innerHTML =
      '<h4>Алгоритмическое состояние</h4><p data-current-step></p>' +
      '<dl class="atlas-lab__metrics">' +
      '<div><dt>Паросочетание</dt><dd data-matching>∅</dd></div>' +
      '<div><dt>Увеличивающий путь</dt><dd data-path>—</dd></div>' +
      '<div><dt>Слои / достижимые</dt><dd data-layers>—</dd></div>' +
      '<div><dt>Минимальное покрытие</dt><dd data-cover>—</dd></div>' +
      '</dl>';
    shell.workspace.appendChild(statePanel);

    const proofPanel = document.createElement("section");
    proofPanel.className = "atlas-lab__panel";
    proofPanel.innerHTML = '<h4>Свидетельство</h4><p data-certificate></p><p class="atlas-lab__note" data-detail></p>';
    shell.workspace.appendChild(proofPanel);

    let graph = core.graphFromPreset("augmenting");
    let currentFrame = null;
    let graphController = null;
    let mounted = null;

    function syncPresetOptions() {
      Array.from(fields.preset.options).forEach(function (option) {
        option.hidden = core.PRESETS[option.value].mode !== fields.mode.value;
      });
      if (core.PRESETS[fields.preset.value].mode !== fields.mode.value) {
        fields.preset.value = fields.mode.value === "bipartite" ? "augmenting" : "blossom";
      }
    }

    function syncEditor() {
      const text = core.graphText(graph, fields.mode.value);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
    }

    function contractedGraph(source, frame) {
      if (frame.phase !== "contract" || !frame.blossomVertexIds.length) return source;
      const set = new Set(frame.blossomVertexIds);
      const beta = "β(" + frame.contractedBaseId + ")";
      const nodes = source.nodes.filter(function (node) { return !set.has(node.id); }).map(function (node) {
        return { id: node.id, label: node.label, partition: node.partition };
      });
      nodes.push({ id: beta, label: "β", partition: null });
      const seen = new Set();
      const edges = [];
      source.edges.forEach(function (edge) {
        const a = set.has(edge.source) ? beta : edge.source;
        const b = set.has(edge.target) ? beta : edge.target;
        if (a === b) return;
        const key = [a, b].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ id: "contract-" + edges.length, source: a, target: b, directed: false });
      });
      return { nodes: nodes, edges: edges };
    }

    function nodeClass(node) {
      if (!currentFrame) return "";
      if (node.id.indexOf("β(") === 0) return "is-active";
      if (currentFrame.minVertexCoverIds.includes(node.id)) return "is-active";
      if (currentFrame.blossomVertexIds.includes(node.id)) return "is-candidate";
      if (currentFrame.reachableVertexIds.includes(node.id)) return "is-visited";
      return "";
    }

    function edgeClass(edge) {
      if (!currentFrame) return "";
      if (edge.id.indexOf("contract-") === 0) return "is-candidate";
      if (currentFrame.augmentingPathEdgeIds.includes(edge.id)) return "is-active";
      if (currentFrame.matchingEdgeIds.includes(edge.id)) return "is-visited";
      if (currentFrame.activeEdgeId === edge.id) return "is-candidate";
      return "is-dimmed";
    }

    function renderGraph() {
      if (!graph.nodes.length) {
        if (graphController) { graphController.destroy(); graphController = null; }
        drawing.clear(figure.svg, "Пустой граф", "Добавьте вершины или выберите другой пример");
        drawing.text(figure.svg, 460, 280, "Паросочетание пусто", "is-muted", "middle");
        return;
      }
      const shown = contractedGraph(graph, currentFrame);
      const left = shown.nodes.filter(function (node) { return node.partition === "L"; }).map(function (node) { return node.id; });
      const right = shown.nodes.filter(function (node) { return node.partition === "R"; }).map(function (node) { return node.id; });
      const options = {
        layout: fields.mode.value === "bipartite"
          ? { type: "bipartite", width: 920, height: 560, padding: 105, left: left, right: right }
          : { type: "circle", width: 920, height: 560, padding: 105 },
        title: currentFrame.phase === "contract" ? "Цветок после сжатия" : "Текущее паросочетание",
        description: "Зелёные рёбра входят в паросочетание, красное показывает путь, пунктир — поиск или цветок",
        nodeClass: nodeClass,
        edgeClass: edgeClass,
        nodeAriaLabel: function (node) {
          const suffix = currentFrame.blossomVertexIds.includes(node.id) ? ", вершина цветка" : currentFrame.minVertexCoverIds.includes(node.id) ? ", входит в минимальное покрытие" : "";
          return "Вершина " + node.label + suffix;
        },
        edgeAriaLabel: function (edge) {
          const suffix = currentFrame.matchingEdgeIds.includes(edge.id) ? ", в паросочетании" : currentFrame.augmentingPathEdgeIds.includes(edge.id) ? ", на увеличивающем пути" : "";
          return "Ребро " + edge.source + " — " + edge.target + suffix;
        },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, shown, options);
      else graphController.update(shown, Object.assign({ preserveView: true }, options));
    }

    function createState() {
      return core.createState({ mode: fields.mode.value, graph: graph });
    }

    function freeCount(frame) {
      const matched = new Set();
      const byId = Object.create(null);
      graph.edges.forEach(function (edge) { byId[edge.id] = edge; });
      frame.matchingEdgeIds.forEach(function (id) {
        const edge = byId[id]; if (edge) { matched.add(edge.source); matched.add(edge.target); }
      });
      return graph.nodes.length - matched.size;
    }

    function layerText(frame) {
      const entries = Object.keys(frame.layers).sort(function (a, b) { return frame.layers[a] - frame.layers[b] || a.localeCompare(b); });
      if (entries.length) return entries.map(function (id) { return id + ":" + frame.layers[id]; }).join(" · ");
      return frame.reachableVertexIds.length ? frame.reachableVertexIds.join(", ") : "—";
    }

    function render(state) {
      currentFrame = state.current;
      renderGraph();
      metrics.querySelector('[data-metric="size"]').textContent = String(currentFrame.matchingEdgeIds.length);
      metrics.querySelector('[data-metric="free"]').textContent = String(freeCount(currentFrame));
      metrics.querySelector('[data-metric="frame"]').textContent = (state.cursor + 1) + " / " + state.frames.length;
      metrics.querySelector('[data-metric="phase"]').textContent = currentFrame.phase;
      statePanel.querySelector("[data-current-step]").textContent = currentFrame.message;
      statePanel.querySelector("[data-matching]").textContent = currentFrame.matchingEdgeIds.length ? currentFrame.matchingEdgeIds.join(", ") : "∅";
      statePanel.querySelector("[data-path]").textContent = currentFrame.augmentingPathVertexIds.length ? currentFrame.augmentingPathVertexIds.join(" → ") : "—";
      statePanel.querySelector("[data-layers]").textContent = layerText(currentFrame);
      statePanel.querySelector("[data-cover]").textContent = currentFrame.minVertexCoverIds.length ? currentFrame.minVertexCoverIds.join(", ") : "—";
      const certificate = proofPanel.querySelector("[data-certificate]");
      const detail = proofPanel.querySelector("[data-detail]");
      if (currentFrame.phase === "contract") {
        certificate.textContent = "Цветок {" + currentFrame.blossomVertexIds.join(", ") + "} сжат в псевдовершину β; база — " + currentFrame.contractedBaseId;
        detail.textContent = "Сжатие сохраняет существование увеличивающего пути. После поиска путь разворачивается через чередующуюся часть нечётного цикла";
      } else if (state.finished) {
        certificate.textContent = "Максимум: " + state.finalMatchingEdgeIds.length + " рёбер" + (state.analysis.exact && state.analysis.count > 1 ? "; оптимальных вариантов: " + state.analysis.count : "");
        if (state.mode === "bipartite") {
          detail.textContent = "Покрытие размера " + state.minVertexCoverIds.length + " подтверждает оптимальность по теореме Кёнига" + (state.finalMatchingEdgeIds.length * 2 === graph.nodes.length ? "; паросочетание совершенное" : "; совершенного паросочетания нет");
        } else {
          detail.textContent = state.analysis.exact ? "Независимый полный перебор на этом малом графе подтвердил размер" : "Граф велик для дополнительного полного перебора; показана трасса алгоритма цветков";
        }
      } else {
        certificate.textContent = "Алгоритм ещё строит свидетельство";
        detail.textContent = state.mode === "bipartite" ? "Слои чередуют незанятые и занятые рёбра" : "При встрече двух чётных вершин одного дерева проверяется нечётный цветок";
      }
      figure.caption.textContent = currentFrame.message;
    }

    function setGraph(next, mode, message) {
      graph = next;
      fields.mode.value = mode;
      syncPresetOptions(); syncEditor();
      if (graphController) graphController.resetView();
      mounted.reset();
      if (message) mounted.announce(message);
    }

    function bind(api) {
      fields.mode.addEventListener("change", function () {
        syncPresetOptions();
        const name = fields.preset.value;
        setGraph(core.graphFromPreset(name), fields.mode.value, "Режим и пример изменены");
      });
      fields.preset.addEventListener("change", function () {
        const preset = core.PRESETS[fields.preset.value];
        setGraph(core.graphFromPreset(fields.preset.value), preset.mode, "Загружен новый пример");
      });
      apply.addEventListener("click", function () {
        try {
          setGraph(core.parseGraphText(fields.vertices.value, fields.edges.value, fields.mode.value), fields.mode.value, "Редактируемый граф применён");
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    syncPresetOptions(); syncEditor();
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: 4096,
      bind: bind,
    });
  });
})();
