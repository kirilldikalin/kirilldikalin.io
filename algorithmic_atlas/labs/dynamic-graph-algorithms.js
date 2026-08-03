(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.DynamicGraphAlgorithmsCore;

  runtime.boot("dynamic-graph-algorithms", function (root) {
    const shell = runtime.createShell(root, {
      title: "Связность на временной шкале",
      description: "Добавляйте, удаляйте и спрашивайте: полный пересчёт сравнивается с остовным лесом, который ищет замену только после удаления древесного ребра",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Сценарий<select data-field="preset"><option value="replacement">Замена на разрезе</option><option value="parallel">Параллельный резерв</option><option value="adversarial">Дорогие удаления</option><option value="disconnected">Слияние и распад</option><option value="loop">Петля</option><option value="singleton">Одна вершина</option><option value="empty">Пустая шкала</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<textarea data-field="vertices" rows="2" spellcheck="false" aria-describedby="dynamic-editor-note"></textarea></label>' +
      '<label class="atlas-lab__field is-wide">Операции временной шкалы<textarea data-field="operations" rows="8" spellcheck="false" aria-describedby="dynamic-editor-note"></textarea></label>' +
      '<div class="atlas-lab__field is-wide"><span id="dynamic-editor-note">Формат: + id u v, − id или ? u v. ID ребра не переиспользуется; одинаковые концы с разными ID образуют параллельные рёбра</span><div class="atlas-lab__actions"><button data-action="apply" type="button">Применить шкалу</button></div></div>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      operations: shell.controls.querySelector('[data-field="operations"]'),
    };
    const apply = shell.controls.querySelector('[data-action="apply"]');

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Активные рёбра</dt><dd data-metric="edges">0</dd></div>' +
      '<div><dt>Компоненты</dt><dd data-metric="components">0</dd></div>' +
      '<div><dt>Древесные / резервные</dt><dd data-metric="forest">0 / 0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>';
    shell.workspace.appendChild(metrics);

    const figure = runtime.createFigure(shell.workspace, {
      id: "dynamic-graph-algorithms-visual",
      title: "Текущий граф и поддерживаемый остовный лес",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const comparison = document.createElement("section");
    comparison.className = "atlas-lab__panel";
    comparison.innerHTML =
      '<h4>Полный пересчёт и динамический лес</h4><p data-current-step></p>' +
      '<dl class="atlas-lab__metrics">' +
      '<div><dt>Работа полного пересчёта</dt><dd data-baseline-work>0</dd></div>' +
      '<div><dt>Работа леса</dt><dd data-dynamic-work>0</dd></div>' +
      '<div><dt>Накоплено: пересчёт</dt><dd data-baseline-total>0</dd></div>' +
      '<div><dt>Накоплено: лес</dt><dd data-dynamic-total>0</dd></div>' +
      '</dl><p class="atlas-lab__note" data-certificate></p>';
    shell.workspace.appendChild(comparison);

    const timelinePanel = document.createElement("section");
    timelinePanel.className = "atlas-lab__panel";
    timelinePanel.innerHTML = '<h4>Временная шкала</h4><div class="atlas-lab__table-wrap" tabindex="0" data-timeline-table></div>';
    shell.workspace.appendChild(timelinePanel);

    let timeline = core.timelineFromPreset("replacement");
    let currentFrame = null;
    let graphController = null;
    let mounted = null;

    function syncEditor() {
      const text = core.timelineText(timeline);
      fields.vertices.value = text.vertices;
      fields.operations.value = text.operations;
    }

    function currentGraph() {
      return { nodes: timeline.nodes, edges: currentFrame.activeEdges };
    }

    function nodeClass(node) {
      if (!currentFrame || !currentFrame.operation || currentFrame.operation.type !== "query") return "";
      if (node.id === currentFrame.operation.source || node.id === currentFrame.operation.target) return "is-active";
      return "";
    }

    function edgeClass(edge) {
      if (!currentFrame) return "";
      if (currentFrame.promotedEdgeId === edge.id) return "is-active";
      if (currentFrame.replacementCandidateIds.includes(edge.id)) return "is-candidate";
      if (currentFrame.forestEdgeIds.includes(edge.id)) return "is-visited";
      return "is-dimmed";
    }

    function renderGraph() {
      if (!timeline.nodes.length) {
        if (graphController) { graphController.destroy(); graphController = null; }
        drawing.clear(figure.svg, "Пустая временная шкала", "Добавьте вершины и операции");
        drawing.text(figure.svg, 460, 280, "Нет состояния графа", "is-muted", "middle");
        return;
      }
      const graph = currentGraph();
      const options = {
        layout: { type: "circle", width: 920, height: 560, padding: 108 },
        title: "Динамический граф после операции " + (currentFrame.operationIndex + 1),
        description: "Зелёные рёбра образуют остовный лес; бледные — резерв; пунктир показывает проверенную замену",
        nodeClass: nodeClass,
        edgeClass: edgeClass,
        nodeAriaLabel: function (node) {
          const group = currentFrame.groups.findIndex(function (ids) { return ids.includes(node.id); });
          return "Вершина " + node.label + ", компонента " + (group + 1);
        },
        edgeAriaLabel: function (edge) {
          const state = currentFrame.forestEdgeIds.includes(edge.id) ? "древесное" : "резервное";
          return "Ребро " + edge.id + ": " + edge.source + " — " + edge.target + ", " + state;
        },
      };
      if (!graphController) graphController = graphRuntime.mount(figure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: true }, options));
    }

    function makeCell(tag, text, scope) {
      const cell = document.createElement(tag); cell.textContent = text;
      if (scope) cell.scope = scope;
      return cell;
    }

    function renderTimeline(state) {
      const wrap = timelinePanel.querySelector("[data-timeline-table]");
      wrap.replaceChildren();
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Шаг", "Операция", "Результат", "Состояние"].forEach(function (label) { headRow.appendChild(makeCell("th", label, "col")); });
      head.appendChild(headRow);
      const body = document.createElement("tbody");
      timeline.operations.forEach(function (operation, index) {
        const row = document.createElement("tr");
        if (index === currentFrame.operationIndex) row.setAttribute("aria-current", "step");
        const marker = index < currentFrame.operationIndex ? "готово" : index === currentFrame.operationIndex ? "текущий шаг" : "ожидает";
        const resultFrame = state.frames[index + 1];
        const answer = operation.type === "query" && index <= currentFrame.operationIndex
          ? (resultFrame.dynamicResult ? "да" : "нет") : "—";
        row.append(makeCell("th", String(index + 1), "row"), makeCell("td", operation.label), makeCell("td", answer), makeCell("td", marker));
        body.appendChild(row);
      });
      table.append(head, body); wrap.appendChild(table);
    }

    function render(state) {
      currentFrame = state.current;
      renderGraph(); renderTimeline(state);
      metrics.querySelector('[data-metric="edges"]').textContent = String(currentFrame.activeEdges.length);
      metrics.querySelector('[data-metric="components"]').textContent = String(currentFrame.groups.length);
      metrics.querySelector('[data-metric="forest"]').textContent = currentFrame.forestEdgeIds.length + " / " + currentFrame.nonTreeEdgeIds.length;
      metrics.querySelector('[data-metric="frame"]').textContent = (state.cursor + 1) + " / " + state.frames.length;
      comparison.querySelector("[data-current-step]").textContent = currentFrame.message;
      comparison.querySelector("[data-baseline-work]").textContent = String(currentFrame.baselineWork);
      comparison.querySelector("[data-dynamic-work]").textContent = String(currentFrame.dynamicWork);
      comparison.querySelector("[data-baseline-total]").textContent = String(currentFrame.cumulativeBaselineWork);
      comparison.querySelector("[data-dynamic-total]").textContent = String(currentFrame.cumulativeDynamicWork);
      const certificate = comparison.querySelector("[data-certificate]");
      certificate.textContent = currentFrame.operation && currentFrame.operation.type === "query"
        ? "Ответы совпали: " + (currentFrame.dynamicResult ? "вершины связаны" : "вершины находятся в разных компонентах")
        : currentFrame.promotedEdgeId
          ? "Замена " + currentFrame.promotedEdgeId + " восстановила компонентный инвариант"
          : currentFrame.invariantHolds ? "Компоненты остовного леса точно совпадают с компонентами полного графа" : "Инвариант нарушен";
      figure.caption.textContent = currentFrame.message + " Работа — пересчёт: " + currentFrame.baselineWork + ", лес: " + currentFrame.dynamicWork + ".";
    }

    function createState() { return core.createState({ timeline: timeline }); }

    function setTimeline(next, message) {
      timeline = next; syncEditor();
      if (graphController) graphController.resetView();
      mounted.reset();
      if (message) mounted.announce(message);
    }

    function bind(api) {
      fields.preset.addEventListener("change", function () { setTimeline(core.timelineFromPreset(fields.preset.value), "Загружен новый сценарий"); });
      apply.addEventListener("click", function () {
        try {
          setTimeline(core.parseTimeline(fields.vertices.value, fields.operations.value), "Временная шкала применена");
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    syncEditor();
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: core.isFinished,
      render: render,
      maxAutomaticSteps: core.MAX_OPERATIONS + 1,
      bind: bind,
    });
  });
})();
