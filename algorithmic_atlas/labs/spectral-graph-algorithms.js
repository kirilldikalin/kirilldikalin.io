(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.SpectralGraphAlgorithmsCore;

  runtime.boot("spectral-graph-algorithms", function (root) {
    const shell = runtime.createShell(root, {
      title: "Спектральный разрез и sweep по вектору Фидлера",
      description: "Цвет вершины кодирует координату D⁻¹ᐟ²z₂, порог задаёт разрез, а панели одновременно показывают проводимость и спектры индуцированных сторон",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Граф<select data-field="preset"><option value="bottleneck">Два квартала и мост</option><option value="path4">Путь P₄</option><option value="cycle4">Цикл C₄</option><option value="complete4">Полный K₄</option><option value="weighted">Взвешенная цепь</option><option value="disconnected">Две компоненты</option><option value="isolate">Есть изолированная</option><option value="zeroEdge">Нулевое ребро</option></select></label>' +
      '<label class="atlas-lab__field is-wide">Порог sweep<input data-field="threshold" type="range" min="0" max="4" value="0" step="1"><output data-threshold-output>1 / 5</output></label>' +
      '<div class="atlas-lab__field is-wide"><span data-graph-note></span></div>';

    const fields = {
      preset: shell.controls.querySelector('[data-field="preset"]'),
      threshold: shell.controls.querySelector('[data-field="threshold"]'),
      thresholdOutput: shell.controls.querySelector("[data-threshold-output]"),
      graphNote: shell.controls.querySelector("[data-graph-note]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>λ₂(L)</dt><dd data-metric="fiedler">—</dd></div>' +
      '<div><dt>ν₂(ℒ)</dt><dd data-metric="gap">—</dd></div>' +
      '<div><dt>Вес разреза</dt><dd data-metric="cut">—</dd></div>' +
      '<div><dt>Проводимость φ</dt><dd data-metric="conductance">—</dd></div>' +
      '<div><dt>Точный минимум</dt><dd data-metric="optimum">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const graphFigure = runtime.createFigure(shell.workspace, {
      id: "spectral-partition-graph",
      title: "Граф и текущий sweep-разрез",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const coordinateFigure = runtime.createFigure(shell.workspace, {
      id: "spectral-fiedler-coordinates",
      title: "Координаты sweep-вектора",
      viewBox: "0 0 920 360",
      className: "atlas-graph-lab__figure",
    });

    const spectrumFigure = runtime.createFigure(shell.workspace, {
      id: "spectral-induced-spectra",
      title: "Спектр полного графа и двух сторон",
      viewBox: "0 0 920 430",
      className: "atlas-graph-lab__figure",
    });

    const statePanel = document.createElement("section");
    statePanel.className = "atlas-lab__panel";
    statePanel.innerHTML =
      '<h4>Синхронное состояние</h4><p data-message></p>' +
      '<dl class="atlas-lab__metrics">' +
      '<div><dt>S</dt><dd data-side>—</dd></div>' +
      '<div><dt>V \\ S</dt><dd data-complement>—</dd></div>' +
      '<div><dt>vol(S) / vol(V \\ S)</dt><dd data-volumes>—</dd></div>' +
      '<div><dt>Normalized cut</dt><dd data-ncut>—</dd></div>' +
      '<div><dt>Чигер</dt><dd data-cheeger>—</dd></div>' +
      '</dl><p class="atlas-lab__note" data-caveat></p>';
    shell.workspace.appendChild(statePanel);

    let graph = core.preset("bottleneck");
    let graphController = null;
    let mounted = null;

    function formatted(value, digits) {
      if (value === null || value === undefined || !Number.isFinite(value)) return "—";
      const rounded = Math.abs(value) < 1e-10 ? 0 : value;
      return rounded.toFixed(digits === undefined ? 4 : digits).replace(/\.0+$/, "");
    }

    function graphModel(source) {
      return {
        id: source.id, label: source.label, directed: false,
        nodes: source.nodes.map(function (node) { return { id: node.id, label: node.label }; }),
        edges: source.edges.map(function (edge) { return { id: edge.id, source: edge.source, target: edge.target, directed: false, weight: formatted(edge.weight, 2) }; }),
      };
    }

    function coordinateMap(model) {
      const result = new Map();
      model.graph.nodes.forEach(function (node, index) { result.set(node.id, model.spectral.sweepVector[index] || 0); });
      return result;
    }

    function colorFor(value, extent) {
      const ratio = extent <= 1e-12 ? 0 : Math.max(-1, Math.min(1, value / extent));
      if (ratio < 0) return "hsl(207 62% " + (88 - 33 * Math.abs(ratio)) + "%)";
      if (ratio > 0) return "hsl(14 66% " + (89 - 35 * ratio) + "%)";
      return "hsl(45 18% 88%)";
    }

    function renderGraph(model) {
      const selected = new Set(model.frame.sideIds);
      const coordinates = coordinateMap(model);
      const extent = Math.max(1e-12, ...Array.from(coordinates.values()).map(Math.abs));
      const options = {
        layout: { type: "circle", width: 920, height: 560, padding: 110 },
        title: "Спектральный разрез: " + model.graph.label,
        description: "Синие и красные оттенки показывают знак и величину координаты; жирные рёбра пересекают выбранный порог",
        nodeClass: function (node) { return selected.has(node.id) ? "is-active" : ""; },
        edgeClass: function (edge) { return selected.has(edge.source) !== selected.has(edge.target) ? "is-active" : "is-dimmed"; },
        nodeAriaLabel: function (node) { return "Вершина " + node.label + ", координата " + formatted(coordinates.get(node.id), 5) + (selected.has(node.id) ? ", сторона S" : ", дополнение S"); },
        edgeAriaLabel: function (edge) { return "Ребро " + edge.source + " — " + edge.target + ", вес " + edge.weight + (selected.has(edge.source) !== selected.has(edge.target) ? ", пересекает разрез" : ""); },
      };
      if (!graphController) graphController = graphRuntime.mount(graphFigure.svg, graphModel(model.graph), options);
      else graphController.update(graphModel(model.graph), Object.assign({ preserveView: true }, options));
      graphFigure.svg.querySelectorAll(".atlas-graph__node").forEach(function (group) {
        const id = group.dataset.nodeId;
        const shape = group.querySelector(".atlas-graph__node-shape");
        if (shape) shape.style.fill = colorFor(coordinates.get(id), extent);
      });
      graphFigure.caption.textContent = "Контрастные рёбра образуют ∂S; масштаб и положение управляются мышью, касанием, клавишами +, −, стрелками и 0";
    }

    function renderCoordinates(model) {
      drawing.clear(coordinateFigure.svg, "Координаты вектора для sweep", "Вершины упорядочены по D в степени минус одна вторая умножить на нормализованный вектор Фидлера");
      const order = model.frame.order;
      if (!order || !order.length) { drawing.text(coordinateFigure.svg, 460, 180, "Нет координат", "is-muted", "middle"); return; }
      const values = order.map(function (item) { return item.value; });
      const minimum = Math.min.apply(null, values); const maximum = Math.max.apply(null, values);
      const span = Math.max(1e-9, maximum - minimum);
      const x = function (value) { return 75 + 770 * (value - minimum) / span; };
      drawing.append(coordinateFigure.svg, "line", { x1: 75, y1: 190, x2: 845, y2: 190, class: "atlas-graph__edge-line" });
      const thresholdX = x(model.frame.threshold);
      drawing.append(coordinateFigure.svg, "line", { x1: thresholdX, y1: 42, x2: thresholdX, y2: 315, class: "atlas-graph__edge-line is-active" });
      drawing.text(coordinateFigure.svg, thresholdX, 30, "порог " + formatted(model.frame.threshold, 5), "is-active", "middle");
      order.forEach(function (item, index) {
        const px = x(item.value); const py = 125 + (index % 2) * 130;
        drawing.append(coordinateFigure.svg, "line", { x1: px, y1: 190, x2: px, y2: py, class: "atlas-graph__edge-line" });
        const group = drawing.append(coordinateFigure.svg, "g", { transform: "translate(" + px + " " + py + ")", class: "atlas-graph__node " + (model.frame.sideIds.includes(item.id) ? "is-active" : ""), tabindex: "0", role: "img", "aria-label": item.id + ", координата " + formatted(item.value, 6) });
        drawing.append(group, "title", {}, item.id + ": " + formatted(item.value, 6));
        drawing.append(group, "circle", { r: 22, class: "atlas-graph__node-shape", style: "fill:" + colorFor(item.value, Math.max(Math.abs(minimum), Math.abs(maximum))) });
        drawing.text(group, 0, 5, item.id, "atlas-graph__node-label", "middle");
      });
      coordinateFigure.caption.textContent = "Sweep рассматривает все префиксы этого порядка; совпадающие координаты разрешаются стабильным ID, что особенно важно при кратном собственном значении";
    }

    function renderSpectrum(model) {
      drawing.clear(spectrumFigure.svg, "Сравнение спектров", "Столбцы показывают собственные значения обычного Лапласиана полного графа и двух индуцированных подграфов");
      const series = [
        { label: "G", values: model.spectral.laplacian.values, className: "is-active" },
        { label: "G[S]", values: model.frame.leftSpectrum, className: "is-candidate" },
        { label: "G[V\\S]", values: model.frame.rightSpectrum, className: "is-visited" },
      ];
      const maximum = Math.max(1e-9, ...series.flatMap(function (item) { return item.values; }));
      series.forEach(function (seriesItem, seriesIndex) {
        const top = 45 + seriesIndex * 128;
        drawing.text(spectrumFigure.svg, 30, top + 45, seriesItem.label, seriesItem.className, "start");
        const width = Math.max(20, 760 / Math.max(1, seriesItem.values.length));
        seriesItem.values.forEach(function (value, index) {
          const height = 72 * value / maximum;
          const x = 125 + index * width;
          drawing.append(spectrumFigure.svg, "rect", { x: x, y: top + 78 - height, width: Math.max(8, width - 8), height: Math.max(2, height), class: seriesItem.className, tabindex: "0", role: "img", "aria-label": seriesItem.label + ", собственное значение " + (index + 1) + ": " + formatted(value, 5) });
          drawing.text(spectrumFigure.svg, x + (width - 8) / 2, top + 96, formatted(value, 2), "is-muted", "middle");
        });
      });
      spectrumFigure.caption.textContent = "Спектр G постоянен, а спектры G[S] и G[V \\ S] пересчитываются при каждом пороге и отражают внутреннюю связность сторон";
    }

    function cheegerText(model) {
      if (!model.cheeger.applicable) return model.cheeger.reason + "; нормализованное неравенство Чигера здесь не применяется";
      return formatted(model.cheeger.lower, 4) + " ≤ " + formatted(model.cheeger.phi, 4) + " ≤ " + formatted(model.cheeger.upper, 4);
    }

    function render(state) {
      const model = core.visualModel(state);
      renderGraph(model); renderCoordinates(model); renderSpectrum(model);
      const metricsValue = model.frame.metrics;
      metrics.querySelector('[data-metric="fiedler"]').textContent = formatted(model.spectral.algebraicConnectivity, 6);
      metrics.querySelector('[data-metric="gap"]').textContent = formatted(model.spectral.normalizedGap, 6);
      metrics.querySelector('[data-metric="cut"]').textContent = formatted(metricsValue.boundaryWeight, 4);
      metrics.querySelector('[data-metric="conductance"]').textContent = formatted(metricsValue.conductance, 5);
      metrics.querySelector('[data-metric="optimum"]').textContent = formatted(model.optimum.value, 5);
      fields.threshold.max = String(model.frameCount - 1);
      fields.threshold.value = String(model.cursor);
      fields.thresholdOutput.value = (model.cursor + 1) + " / " + model.frameCount;
      fields.thresholdOutput.textContent = fields.thresholdOutput.value;
      statePanel.querySelector("[data-message]").textContent = model.frame.message;
      statePanel.querySelector("[data-side]").textContent = "{" + model.frame.sideIds.join(", ") + "}";
      statePanel.querySelector("[data-complement]").textContent = "{" + model.frame.complementIds.join(", ") + "}";
      statePanel.querySelector("[data-volumes]").textContent = formatted(metricsValue.volume, 3) + " / " + formatted(metricsValue.complementVolume, 3);
      statePanel.querySelector("[data-ncut]").textContent = formatted(metricsValue.normalizedCut, 5);
      statePanel.querySelector("[data-cheeger]").textContent = cheegerText(model);
      const caveats = [];
      if (model.spectral.components.length > 1) caveats.push("Граф несвязен: нулевое собственное пространство многомерно, выбранный базис не каноничен");
      if (model.spectral.repeatedFiedler) caveats.push("Значение Фидлера кратно: другой корректный собственный базис может дать иной sweep-порядок");
      if (model.spectral.hasIsolates) caveats.push("Изолированные вершины имеют нулевой объём; проводимость для стороны нулевого объёма не определена");
      statePanel.querySelector("[data-caveat]").textContent = caveats.length ? caveats.join(" · ") : "Вектор выбран детерминированно; его знак можно обратить без изменения математического содержания";
    }

    function createState() { return core.createState(graph); }

    function setGraph(name, api) {
      graph = core.preset(name);
      const spectral = core.spectrum(graph);
      fields.graphNote.textContent = graph.nodes.length + " вершин · " + graph.edges.length + " рёбер · компонент положительной поддержки: " + spectral.components.length;
      if (graphController) graphController.resetView();
      api.reset(); api.announce("Спектральный пример изменён");
    }

    function bind(api) {
      fields.preset.addEventListener("change", function () {
        try { setGraph(fields.preset.value, api); api.clearError(); }
        catch (error) { api.showError(error.message); }
      });
      fields.threshold.addEventListener("input", function () {
        try { api.setState(core.seek(api.getState(), Number(fields.threshold.value)), "Порог sweep изменён"); api.clearError(); }
        catch (error) { api.showError(error.message); }
      });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    fields.graphNote.textContent = graph.nodes.length + " вершин · " + graph.edges.length + " рёбер · связный взвешенный граф";
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      maxAutomaticSteps: 32,
      bind: bind,
    });
  });
})();
