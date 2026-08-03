(function () {
  "use strict";

  const runtime = window.AtlasLabRuntime;
  const drawing = window.AtlasLabSvg;
  const graphRuntime = window.AtlasGraphLabRuntime;
  const core = window.TravelingSalesmanExactCore;

  runtime.boot("traveling-salesman-exact", function (root) {
    const shell = runtime.createShell(root, {
      title: "Три точных взгляда на один тур",
      description: "Сравните полный перебор, динамику Held–Karp и ветвление с границами на одном малом экземпляре; каждый кадр хранит точную целую стоимость",
    });
    root.classList.add("atlas-graph-lab");
    shell.controls.innerHTML =
      '<label>Метод<select data-field="mode"><option value="brute-force">Полный перебор</option><option value="held-karp" selected>Held–Karp</option><option value="branch-bound">Ветвление и границы</option></select></label>' +
      '<label>Экземпляр<select data-field="preset"><option value="branching">Полезные отсечения</option><option value="metric">Метрические кварталы</option><option value="multiple">Несколько оптимумов</option><option value="asymmetric">Асимметричные тарифы</option><option value="violation">Нарушение метрики</option><option value="noTour">Цикла нет</option><option value="huge">Большие целые веса</option></select></label>' +
      '<div class="atlas-lab__field is-wide"><span data-instance-note></span><div class="atlas-lab__actions"><button type="button" data-action="compare">Сравнить все методы</button></div></div>';

    const fields = {
      mode: shell.controls.querySelector('[data-field="mode"]'),
      preset: shell.controls.querySelector('[data-field="preset"]'),
      note: shell.controls.querySelector("[data-instance-note]"),
    };

    const metrics = document.createElement("dl");
    metrics.className = "atlas-lab__metrics";
    metrics.innerHTML =
      '<div><dt>Кадр</dt><dd data-metric="frame">0 / 0</dd></div>' +
      '<div><dt>Стоимость пути</dt><dd data-metric="cost">—</dd></div>' +
      '<div><dt>Рекорд</dt><dd data-metric="incumbent">—</dd></div>' +
      '<div><dt>Нижняя граница</dt><dd data-metric="bound">—</dd></div>';
    shell.workspace.appendChild(metrics);

    const graphFigure = runtime.createFigure(shell.workspace, {
      id: "traveling-salesman-graph",
      title: "Города, стоимости и текущий путь",
      viewBox: "0 0 920 560",
      className: "atlas-graph-lab__figure",
    });

    const statePanel = document.createElement("section");
    statePanel.className = "atlas-lab__panel";
    statePanel.innerHTML =
      '<h4>Точное состояние</h4><p data-message></p>' +
      '<dl class="atlas-lab__metrics">' +
      '<div><dt>Текущий путь</dt><dd data-path>—</dd></div>' +
      '<div><dt>Подмножество</dt><dd data-subset>—</dd></div>' +
      '<div><dt>Последний город</dt><dd data-endpoint>—</dd></div>' +
      '<div><dt>Причина</dt><dd data-reason>—</dd></div>' +
      '</dl>';
    shell.workspace.appendChild(statePanel);

    const processFigure = runtime.createFigure(shell.workspace, {
      id: "traveling-salesman-process",
      title: "Пространство поиска",
      viewBox: "0 0 920 520",
      className: "atlas-graph-lab__figure",
    });

    const comparison = document.createElement("section");
    comparison.className = "atlas-lab__panel";
    comparison.innerHTML =
      '<h4>Тот же экземпляр тремя методами</h4>' +
      '<div class="atlas-lab__table-wrap"><table><thead><tr><th>Метод</th><th>Ответ</th><th>Исследовано</th></tr></thead><tbody data-comparison></tbody></table></div>' +
      '<p class="atlas-lab__note" data-metric-note></p>';
    shell.workspace.appendChild(comparison);

    let instance = core.preset(fields.preset.value);
    let currentModel = null;
    let graphController = null;
    let mounted = null;

    function graphFromInstance(source) {
      const edges = [];
      for (let from = 0; from < source.cities.length; from += 1) {
        for (let to = 0; to < source.cities.length; to += 1) {
          if (from === to || source.matrix[from][to] === null) continue;
          if (source.symmetric && to < from) continue;
          edges.push({
            id: "edge-" + from + "-" + to,
            source: source.cities[from].id,
            target: source.cities[to].id,
            directed: !source.symmetric,
            weight: source.matrix[from][to],
          });
        }
      }
      return {
        id: source.id,
        label: source.label,
        directed: !source.symmetric,
        nodes: source.cities.map(function (city) { return { id: city.id, label: city.label }; }),
        edges: edges,
      };
    }

    function pathEdgeKeys(path, symmetric) {
      const keys = new Set();
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        keys.add(symmetric && to < from ? to + "|" + from : from + "|" + to);
      }
      return keys;
    }

    function renderGraph(model) {
      const graph = graphFromInstance(model.instance);
      const path = model.frame.path || [];
      const active = pathEdgeKeys(path, model.instance.symmetric);
      const pathVertices = new Set(path);
      const options = {
        layout: { type: "circle", width: 920, height: 560, padding: 105 },
        title: "TSP: " + model.instance.label,
        description: "Веса подписаны на рёбрах. Текущий частичный или полный тур выделен контрастно",
        nodeClass: function (node) { return pathVertices.has(node.id) ? "is-active" : ""; },
        edgeClass: function (edge) {
          const key = model.instance.symmetric && edge.target < edge.source
            ? edge.target + "|" + edge.source
            : edge.source + "|" + edge.target;
          return active.has(key) ? "is-active" : "is-dimmed";
        },
        nodeAriaLabel: function (node) { return "Город " + node.label + (pathVertices.has(node.id) ? ", входит в текущий путь" : ""); },
        edgeAriaLabel: function (edge) { return "Переезд " + edge.source + (edge.directed ? " в " : " — ") + edge.target + ", стоимость " + edge.weight; },
      };
      if (!graphController) graphController = graphRuntime.mount(graphFigure.svg, graph, options);
      else graphController.update(graph, Object.assign({ preserveView: true }, options));
      graphFigure.caption.textContent = path.length ? "Текущий маршрут: " + path.join(" → ") : "Маршрут ещё не выбран";
    }

    function processFrames(state) {
      return state.trace.frames.slice(0, state.playback.cursor + 1);
    }

    function drawBranchTree(state) {
      const frames = processFrames(state).filter(function (frame) { return frame.nodeId && frame.nodeId !== "final"; }).slice(-72);
      drawing.clear(processFigure.svg, "Дерево ветвления", "Каждый узел — частичный маршрут; перечёркнутые ветки имеют указанную причину отсечения");
      if (!frames.length) { drawing.text(processFigure.svg, 460, 260, "Дерево пока пусто", "is-muted", "middle"); return; }
      const byId = new Map();
      const groups = new Map();
      frames.forEach(function (frame) {
        const depth = Math.max(0, frame.path.length - 1);
        if (!groups.has(depth)) groups.set(depth, []);
        groups.get(depth).push(frame);
      });
      const positions = new Map();
      groups.forEach(function (items, depth) {
        items.forEach(function (frame, index) {
          positions.set(frame.nodeId, { x: 75 + depth * 150, y: 55 + (index + 1) * 420 / (items.length + 1) });
          byId.set(frame.nodeId, frame);
        });
      });
      frames.forEach(function (frame) {
        const point = positions.get(frame.nodeId);
        const parent = positions.get(frame.parentId);
        if (parent) drawing.append(processFigure.svg, "line", { x1: parent.x, y1: parent.y, x2: point.x, y2: point.y, class: "atlas-graph__edge-line" });
      });
      frames.forEach(function (frame) {
        const point = positions.get(frame.nodeId);
        const group = drawing.append(processFigure.svg, "g", {
          transform: "translate(" + point.x + " " + point.y + ")",
          class: "atlas-graph__node " + (frame.stage === "prune" ? "is-dimmed" : frame.stage === "improve" ? "is-active" : "is-candidate"),
          tabindex: "0",
          role: "img",
          "aria-label": frame.message + "; путь " + frame.path.join(" — "),
        });
        drawing.append(group, "title", {}, frame.message);
        drawing.append(group, "circle", { r: 22, class: "atlas-graph__node-shape" });
        drawing.text(group, 0, 5, String(frame.path.length - 1), "atlas-graph__node-label", "middle");
      });
      const last = frames[frames.length - 1];
      drawing.text(processFigure.svg, 18, 500, "Последний узел: " + last.reason + " · LB " + (last.lowerBound === null ? "∞" : last.lowerBound), "is-muted", "start");
      processFigure.caption.textContent = "Число внутри вершины — глубина пути; затемнённый узел отсечён, а точная причина продублирована в панели состояния";
    }

    function drawDpStates(state) {
      const frames = processFrames(state).filter(function (frame) { return frame.stage === "dp-state"; }).slice(-70);
      drawing.clear(processFigure.svg, "Состояния Held–Karp", "Столбец задаёт размер подмножества, точка — последний город маршрута");
      const groups = new Map();
      frames.forEach(function (frame) {
        const size = frame.subset.length;
        if (!groups.has(size)) groups.set(size, []);
        groups.get(size).push(frame);
      });
      groups.forEach(function (items, size) {
        const x = 80 + size * 145;
        drawing.text(processFigure.svg, x, 35, "|S|=" + size, "is-muted", "middle");
        items.forEach(function (frame, index) {
          const y = 65 + (index + 1) * 410 / (items.length + 1);
          const group = drawing.append(processFigure.svg, "g", { transform: "translate(" + x + " " + y + ")", class: "atlas-graph__node " + (frame.cost === null ? "is-dimmed" : "is-active"), tabindex: "0", role: "img", "aria-label": frame.message });
          drawing.append(group, "title", {}, frame.message);
          drawing.append(group, "circle", { r: 21, class: "atlas-graph__node-shape" });
          drawing.text(group, 0, 5, frame.endpoint || "∅", "atlas-graph__node-label", "middle");
        });
      });
      processFigure.caption.textContent = "Столбцы группируют состояния по размеру S; подпись вершины — конечный город v";
    }

    function drawPermutations(state) {
      const frames = processFrames(state).filter(function (frame) { return frame.permutation; }).slice(-24);
      drawing.clear(processFigure.svg, "Перебранные перестановки", "Каждая строка — один порядок городов после фиксированного старта A");
      if (!frames.length) { drawing.text(processFigure.svg, 460, 260, "Первый кандидат появится после шага", "is-muted", "middle"); return; }
      frames.forEach(function (frame, index) {
        const y = 28 + index * 19;
        drawing.text(processFigure.svg, 28, y, String(frame.permutation).padStart(3, "0"), "is-muted", "start");
        drawing.text(processFigure.svg, 105, y, frame.path.join(" → "), frame.reason === "new-incumbent" ? "is-active" : "", "start");
        drawing.text(processFigure.svg, 825, y, frame.cost === null ? "∞" : frame.cost, frame.reason === "new-incumbent" ? "is-active" : "is-muted", "end");
      });
      processFigure.caption.textContent = "Показаны последние 24 кандидата; новый рекорд выделяется контрастно";
    }

    function renderProcess(state) {
      processFigure.figure.querySelector("h4").textContent = state.trace.mode === "branch-bound" ? "Дерево поиска" : state.trace.mode === "held-karp" ? "Пространство DP[S, v]" : "Порядки обхода";
      if (state.trace.mode === "branch-bound") drawBranchTree(state);
      else if (state.trace.mode === "held-karp") drawDpStates(state);
      else drawPermutations(state);
    }

    function compareAll() {
      const body = comparison.querySelector("[data-comparison]");
      body.replaceChildren();
      ["brute-force", "held-karp", "branch-bound"].forEach(function (mode) {
        const trace = core.buildTrace(instance, { mode: mode });
        const row = document.createElement("tr");
        const label = mode === "brute-force" ? "Перебор" : mode === "held-karp" ? "Held–Karp" : "Ветвление";
        const explored = mode === "brute-force" ? trace.permutations : mode === "held-karp" ? trace.states + " состояний" : trace.nodes + " узлов";
        [label, trace.cost === null ? "цикла нет" : trace.cost, String(explored)].forEach(function (text) { const cell = document.createElement("td"); cell.textContent = text; row.appendChild(cell); });
        body.appendChild(row);
      });
      const analysis = core.metricAnalysis(instance);
      comparison.querySelector("[data-metric-note]").textContent = analysis.metric
        ? "Экземпляр метрический: симметрия, полнота и все неравенства треугольника проверены"
        : analysis.symmetric ? "Экземпляр симметричный, но не метрический; найдено нарушений треугольника: " + analysis.violations.length
          : "Экземпляр асимметричный: стоимость A → B может отличаться от B → A";
    }

    function createState() { return core.createState(instance, { mode: fields.mode.value }); }

    function render(state) {
      currentModel = core.visualModel(state);
      const frame = currentModel.frame;
      renderGraph(currentModel);
      renderProcess(state);
      metrics.querySelector('[data-metric="frame"]').textContent = (currentModel.cursor + 1) + " / " + currentModel.frameCount;
      metrics.querySelector('[data-metric="cost"]').textContent = frame.cost === null ? "—" : frame.cost;
      metrics.querySelector('[data-metric="incumbent"]').textContent = frame.incumbent === null ? "—" : frame.incumbent;
      metrics.querySelector('[data-metric="bound"]').textContent = frame.lowerBound === null ? "—" : frame.lowerBound;
      statePanel.querySelector("[data-message]").textContent = frame.message;
      statePanel.querySelector("[data-path]").textContent = frame.path && frame.path.length ? frame.path.join(" → ") : "—";
      statePanel.querySelector("[data-subset]").textContent = frame.subset && frame.subset.length ? "{" + frame.subset.join(", ") + "}" : frame.unvisited && frame.unvisited.length ? "осталось {" + frame.unvisited.join(", ") + "}" : "—";
      statePanel.querySelector("[data-endpoint]").textContent = frame.endpoint || (frame.path && frame.path.length ? frame.path[frame.path.length - 1] : "—");
      statePanel.querySelector("[data-reason]").textContent = frame.reason;
    }

    function setInstance(name, message) {
      instance = core.preset(name);
      fields.note.textContent = instance.cities.length + " городов · " + (instance.symmetric ? "симметричная" : "асимметричная") + " матрица · точные целые веса";
      if (graphController) graphController.resetView();
      compareAll();
      mounted.reset();
      if (message) mounted.announce(message);
    }

    function bind(api) {
      fields.mode.addEventListener("change", function () { api.reset(); api.announce("Точный метод изменён"); });
      fields.preset.addEventListener("change", function () {
        try { setInstance(fields.preset.value, "Загружен новый детерминированный экземпляр"); api.clearError(); }
        catch (error) { api.showError(error.message); }
      });
      shell.controls.querySelector('[data-action="compare"]').addEventListener("click", function () { compareAll(); api.announce("Три метода пересчитаны на одном экземпляре"); });
      shell.controls.addEventListener("submit", function (event) { event.preventDefault(); });
    }

    fields.note.textContent = instance.cities.length + " городов · симметричная матрица · точные целые веса";
    compareAll();
    mounted = runtime.mount(root, {
      createState: createState,
      step: core.step,
      isFinished: function (state) { return state.playback.finished; },
      render: render,
      maxAutomaticSteps: 4096,
      bind: bind,
    });
  });
})();
