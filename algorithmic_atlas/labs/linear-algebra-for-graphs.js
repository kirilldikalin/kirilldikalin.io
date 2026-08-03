(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.LinearAlgebraForGraphsCore;

  runtime.boot("linear-algebra-for-graphs", function (root) {
    const shell = runtime.createShell(root, {
      title: "Один граф — пять согласованных представлений",
      description: "Добавляйте рёбра по шагам и наблюдайте, как одновременно меняются граф, A, D, L, энергия, компоненты и спектр",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Пример<select data-field="preset"><option value="path">Путь из четырёх вершин</option><option value="disconnected">Несвязный граф</option><option value="multigraph">Параллельные рёбра и петля</option><option value="weighted">Взвешенный цикл</option><option value="singleton">Одна вершина</option><option value="zero">Нулевые веса</option></select></label>' +
      '<label>Редактируемое ребро<select data-field="edge"></select></label>' +
      '<label>Вес выбранного ребра<input data-field="edge-weight" type="number" min="0" max="1000000000" step="1" inputmode="numeric"><button data-action="weight" type="button">Изменить вес</button></label>' +
      '<label class="atlas-lab__field is-wide">Вершины через запятую<textarea data-field="vertices" rows="2" spellcheck="false" aria-describedby="linear-graph-note"></textarea></label>' +
      '<label class="atlas-lab__field is-wide">Рёбра: начало конец вес; …<textarea data-field="edges" rows="4" spellcheck="false" aria-describedby="linear-graph-note"></textarea></label>' +
      '<label class="atlas-lab__field is-wide">Координаты вектора x в порядке вершин<input data-field="vector" type="text" spellcheck="false" aria-describedby="linear-vector-note"><span id="linear-vector-note">Например: 0, 1, 2, 3</span></label>' +
      '<div class="atlas-lab__field is-wide"><span id="linear-graph-note">Петля считается дважды в A и степени, но сокращается в L. Параллельные рёбра остаются отдельными столбцами B</span><div class="atlas-lab__actions"><button data-action="apply" type="button">Применить граф и вектор</button></div></div>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      edge: shell.controls.querySelector('[data-field="edge"]'),
      edgeWeight: shell.controls.querySelector('[data-field="edge-weight"]'),
      vertices: shell.controls.querySelector('[data-field="vertices"]'),
      edges: shell.controls.querySelector('[data-field="edges"]'),
      vector: shell.controls.querySelector('[data-field="vector"]'),
    };
    const weightButton = shell.controls.querySelector('[data-action="weight"]');
    const applyButton = shell.controls.querySelector('[data-action="apply"]');

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Компоненты</dt><dd data-metric="components">0</dd></div>' +
      '<div><dt>Кратность λ = 0</dt><dd data-metric="nullity">0</dd></div>' +
      '<div><dt>xᵀLx</dt><dd data-metric="energy">0</dd></div>' +
      '<div><dt>Частное Рэлея</dt><dd data-metric="rayleigh">—</dd></div>' +
      '<div><dt>Вес остовных деревьев</dt><dd data-metric="trees">0</dd></div>' +
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>';
    shell.workspace.appendChild(metrics);

    const graphFigure = runtime.createFigure(shell.workspace, {
      id: "linear-algebra-for-graphs-visual",
      title: "Граф и добавляемые рёбра",
      viewBox: "0 0 920 540",
      className: "atlas-graph-lab__figure",
    });

    const matrixGrid = document.createElement("section");
    matrixGrid.className = "atlas-lab__triple";
    matrixGrid.setAttribute("aria-label", "Матрицы графа");
    matrixGrid.innerHTML =
      '<section class="atlas-lab__panel"><h4>A · смежность</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="adjacency"></div></section>' +
      '<section class="atlas-lab__panel"><h4>D · степени</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="degree"></div></section>' +
      '<section class="atlas-lab__panel"><h4>L = D − A</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="laplacian"></div></section>';
    shell.workspace.appendChild(matrixGrid);

    const spectrumFigure = runtime.createFigure(shell.workspace, {
      id: "linear-algebra-for-graphs-spectrum",
      title: "Спектр лапласиана",
      viewBox: "0 0 920 300",
    });

    const detailGrid = document.createElement("section");
    detailGrid.className = "atlas-lab__split";
    detailGrid.innerHTML =
      '<section class="atlas-lab__panel"><h4>Нормированный лапласиан 𝓛</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="normalized"></div><p class="atlas-lab__note" data-spectrum-note></p></section>' +
      '<section class="atlas-lab__panel"><h4>Ориентированная инцидентность B</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="incidence"></div><p class="atlas-lab__note">Ориентация столбцов произвольна: её смена не меняет BWBᵀ</p></section>' +
      '<section class="atlas-lab__panel"><h4>Случайное блуждание P</h4><div class="atlas-lab__table-wrap" tabindex="0" data-matrix="transition"></div><p class="atlas-lab__note" data-stationary></p></section>' +
      '<section class="atlas-lab__panel"><h4>Синхронное состояние</h4><p data-current-step></p><p data-energy-identity></p><p class="atlas-lab__note" data-components></p></section>';
    shell.workspace.appendChild(detailGrid);

    let graph = core.graphFromPreset("path");
    let vector = core.parseVector(core.PRESETS.path.vector, graph.nodes.length);
    let currentFrame = null;
    let graphController = null;
    let mounted = null;

    function formatNumber(value) {
      if (Number.isInteger(value)) return String(value);
      if (Math.abs(value) < 5e-10) return "0";
      return Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    function makeCell(tag, text, scope) {
      const cell = document.createElement(tag);
      cell.textContent = text;
      if (scope) cell.scope = scope;
      return cell;
    }

    function renderMatrix(container, matrix, rowLabels, columnLabels) {
      container.replaceChildren();
      if (!rowLabels.length) {
        const empty = document.createElement("p");
        empty.textContent = "Матрица 0 × 0";
        container.appendChild(empty);
        return;
      }
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      headRow.appendChild(makeCell("th", "", "col"));
      columnLabels.forEach(function (label) { headRow.appendChild(makeCell("th", label, "col")); });
      head.appendChild(headRow);
      const body = document.createElement("tbody");
      matrix.forEach(function (row, index) {
        const tableRow = document.createElement("tr");
        tableRow.appendChild(makeCell("th", rowLabels[index], "row"));
        row.forEach(function (value) { tableRow.appendChild(makeCell("td", formatNumber(value))); });
        body.appendChild(tableRow);
      });
      table.append(head, body);
      container.appendChild(table);
    }

    function syncEdgeOptions(preferred) {
      const previous = preferred || fields.edge.value;
      fields.edge.replaceChildren();
      graph.edges.forEach(function (edge) {
        const option = document.createElement("option");
        option.value = edge.id;
        option.textContent = edge.id + ": " + edge.source + " — " + edge.target;
        fields.edge.appendChild(option);
      });
      if (graph.edges.some(function (edge) { return edge.id === previous; })) fields.edge.value = previous;
      fields.edge.disabled = graph.edges.length === 0;
      weightButton.disabled = graph.edges.length === 0;
      syncWeight();
    }

    function syncWeight() {
      const edge = graph.edges.find(function (candidate) { return candidate.id === fields.edge.value; });
      fields.edgeWeight.value = edge ? String(edge.weight) : "";
      fields.edgeWeight.disabled = !edge;
    }

    function syncEditor(preferredEdge) {
      const text = core.graphText(graph);
      fields.vertices.value = text.vertices;
      fields.edges.value = text.edges;
      fields.vector.value = vector.join(", ");
      syncEdgeOptions(preferredEdge);
    }

    function edgeClass(edge) {
      if (!currentFrame) return "is-dimmed";
      if (currentFrame.activeEdgeId === edge.id) return "is-active";
      if (currentFrame.includedEdgeIds.includes(edge.id)) return "is-visited";
      return "is-dimmed";
    }

    function nodeClass(node) {
      const index = graph.nodes.findIndex(function (candidate) { return candidate.id === node.id; });
      if (vector[index] > 0) return "is-visited";
      if (vector[index] < 0) return "is-rejected";
      return "";
    }

    function renderGraph() {
      if (!graph.nodes.length) {
        if (graphController) { graphController.destroy(); graphController = null; }
        drawing.clear(graphFigure.svg, "Пустой граф", "Добавьте хотя бы одну вершину");
        drawing.text(graphFigure.svg, 460, 270, "Граф пока пуст", "is-muted", "middle");
        return;
      }
      const options = {
        layout: { type: "circle", width: 920, height: 540, padding: 105 },
        title: "Граф и координаты вектора x",
        description: "Зелёные вершины имеют положительную координату x, красные отрицательную; активное ребро добавляется на этом шаге",
        nodeClass: nodeClass,
        edgeClass: edgeClass,
        nodeAriaLabel: function (node) {
          const index = graph.nodes.findIndex(function (candidate) { return candidate.id === node.id; });
          return "Вершина " + node.label + ", координата x равна " + formatNumber(vector[index]);
        },
        edgeAriaLabel: function (edge) {
          const status = currentFrame && currentFrame.activeEdgeId === edge.id
            ? ", добавляется сейчас"
            : currentFrame && currentFrame.includedEdgeIds.includes(edge.id) ? ", уже учтено" : ", ещё не учтено";
          return "Ребро " + edge.source + " — " + edge.target + ", вес " + edge.weight + status;
        },
      };
      if (!graphController) graphController = graphRuntime.mount(graphFigure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: true }, options));
    }

    function renderSpectrum(frame) {
      const svg = spectrumFigure.svg;
      drawing.clear(svg, "Собственные значения лапласиана", "Нули соответствуют компонентам положительной опоры графа");
      const values = frame.eigenvalues;
      if (!values.length) {
        drawing.text(svg, 460, 150, "У пустого графа нет собственных значений", "is-muted", "middle");
        spectrumFigure.caption.textContent = "Спектр пуст";
        return;
      }
      const left = 70;
      const right = 875;
      const baseline = 205;
      const maximum = Math.max(1, ...values);
      drawing.append(svg, "line", { x1: left, y1: baseline, x2: right, y2: baseline, class: "atlas-lab__axis" });
      values.forEach(function (value, index) {
        const x = values.length === 1 ? (left + right) / 2 : left + index * (right - left) / (values.length - 1);
        const height = 125 * Math.max(0, value) / maximum;
        drawing.append(svg, "line", {
          x1: x, y1: baseline, x2: x, y2: baseline - height,
          class: value <= core.EIGEN_TOLERANCE ? "is-a" : "is-b",
          "stroke-width": 8,
        });
        drawing.append(svg, "circle", {
          cx: x, cy: baseline - height, r: 8,
          class: value <= core.EIGEN_TOLERANCE ? "is-a" : "is-b",
        });
        drawing.text(svg, x, baseline + 28, "λ" + String(index + 1), "is-strong", "middle");
        drawing.text(svg, x, baseline - height - 17, formatNumber(value), "is-muted", "middle");
      });
      drawing.text(svg, 460, 266, "Красные нули считают компоненты · синяя часть измеряет неоднородность", "is-muted", "middle");
      spectrumFigure.caption.textContent = "λ = " + values.map(formatNumber).join(", ");
    }

    function createState() {
      return core.createState({ graph: graph, vector: vector });
    }

    function render(state) {
      const frame = state.current;
      currentFrame = frame;
      renderGraph();
      renderSpectrum(frame);
      const labels = graph.nodes.map(function (node) { return node.id; });
      const edgeLabels = frame.includedEdgeIds.length
        ? graph.edges.slice(0, frame.includedEdgeIds.length).map(function (edge) { return edge.id; })
        : [];
      renderMatrix(matrixGrid.querySelector('[data-matrix="adjacency"]'), frame.adjacency, labels, labels);
      renderMatrix(matrixGrid.querySelector('[data-matrix="degree"]'), frame.degree, labels, labels);
      renderMatrix(matrixGrid.querySelector('[data-matrix="laplacian"]'), frame.laplacian, labels, labels);
      renderMatrix(detailGrid.querySelector('[data-matrix="normalized"]'), frame.normalizedLaplacian, labels, labels);
      renderMatrix(detailGrid.querySelector('[data-matrix="incidence"]'), frame.incidence, labels, edgeLabels);
      renderMatrix(detailGrid.querySelector('[data-matrix="transition"]'), frame.transition, labels, labels);
      metrics.querySelector('[data-metric="components"]').textContent = String(frame.components.length);
      metrics.querySelector('[data-metric="nullity"]').textContent = String(frame.nullity);
      metrics.querySelector('[data-metric="energy"]').textContent = formatNumber(frame.quadraticForm);
      metrics.querySelector('[data-metric="rayleigh"]').textContent = frame.rayleigh === null ? "не определено" : formatNumber(frame.rayleigh);
      metrics.querySelector('[data-metric="trees"]').textContent = frame.treeWeight;
      metrics.querySelector('[data-metric="frame"]').textContent = (state.cursor + 1) + " / " + state.frames.length;
      detailGrid.querySelector("[data-current-step]").textContent = frame.message;
      detailGrid.querySelector("[data-energy-identity]").textContent =
        "xᵀLx = " + formatNumber(frame.quadraticForm) + "; сумма wₑ(xᵤ−xᵥ)² = " + formatNumber(frame.edgeEnergy);
      detailGrid.querySelector("[data-components]").textContent = frame.components.length
        ? "Компоненты положительной опоры: " + frame.components.map(function (component) { return "{" + component.join(", ") + "}"; }).join(" · ")
        : "Пустой граф не содержит компонент";
      detailGrid.querySelector("[data-spectrum-note]").textContent = frame.eigenvalues.length
        ? "Спектр 𝓛 лежит в [0, 2]: " + core.eigenSymmetric(frame.normalizedLaplacian).values.map(formatNumber).join(", ")
        : "Спектр пуст";
      detailGrid.querySelector("[data-stationary]").textContent = frame.stationary.length
        ? "Одна стационарная мера π: " + frame.stationary.map(function (value, index) { return labels[index] + "=" + formatNumber(value); }).join(" · ")
        : "Пустое распределение";
      graphFigure.caption.textContent = frame.message;
    }

    function replaceGraph(nextGraph, nextVector, message, showComplete) {
      graph = nextGraph;
      vector = core.parseVector(nextVector, graph.nodes.length);
      syncEditor();
      if (graphController) graphController.resetView();
      const state = core.createState({ graph: graph, vector: vector });
      if (showComplete) mounted.setState(core.runToEnd(state), message);
      else {
        mounted.reset();
        if (message) mounted.announce(message);
      }
    }

    function bind(api) {
      fields.preset.addEventListener("change", function () {
        const preset = core.PRESETS[fields.preset.value];
        replaceGraph(core.graphFromPreset(fields.preset.value), preset.vector, "Загружен новый пример; запускайте рёбра по шагам", false);
      });
      fields.edge.addEventListener("change", syncWeight);
      weightButton.addEventListener("click", function () {
        try {
          const selected = fields.edge.value;
          const next = core.updateEdgeWeight(graph, selected, fields.edgeWeight.value);
          replaceGraph(next, vector, "Вес " + selected + " изменён; все представления пересчитаны", true);
          fields.edge.value = selected;
          syncWeight();
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      applyButton.addEventListener("click", function () {
        try {
          const next = core.parseGraphText(fields.vertices.value, fields.edges.value);
          const nextVector = core.parseVector(fields.vector.value, next.nodes.length);
          replaceGraph(next, nextVector, "Редактируемый граф применён; все представления пересчитаны", true);
          api.clearError();
        } catch (error) { api.showError(error.message); }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    syncEditor("e1");
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.finished; },
      render: render,
      maxAutomaticSteps: 64,
      bind: bind,
    });
  });
})();
