(function (root) {
  "use strict";

  const slug = "dag-topological-scc";

  function dependency(name) {
    const value = root[name];
    if (!value) throw new Error(name + " is unavailable");
    return value;
  }

  function element(documentRef, name, attributes, text) {
    const node = documentRef.createElement(name);
    Object.entries(attributes || {}).forEach(function (entry) {
      if (entry[0] === "class") node.className = entry[1];
      else if (entry[0] === "htmlFor") node.htmlFor = entry[1];
      else if (entry[1] !== null && entry[1] !== undefined) {
        node.setAttribute(entry[0], String(entry[1]));
      }
    });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function field(documentRef, labelText, control, wide) {
    const wrapper = element(documentRef, "label", {
      class: "atlas-lab__field" + (wide ? " is-wide" : ""),
    });
    wrapper.append(element(documentRef, "span", {}, labelText), control);
    return wrapper;
  }

  function option(documentRef, value, text) {
    return element(documentRef, "option", { value: value }, text);
  }

  function replaceOptions(select, choices, selected) {
    const documentRef = select.ownerDocument;
    select.replaceChildren();
    choices.forEach(function (choice) {
      select.appendChild(option(documentRef, choice.value, choice.label));
    });
    select.value = selected;
  }

  function makeCell(documentRef, name, text) {
    return element(documentRef, name, {}, text);
  }

  function componentIndex(frame, nodeId) {
    for (let index = 0; index < (frame.components || []).length; index += 1) {
      if (frame.components[index].includes(nodeId)) return index;
    }
    return -1;
  }

  function initialize(rootElement) {
    const core = dependency("AtlasDagTopologicalSccCore");
    const shared = dependency("AtlasGraphLabCore");
    const runtime = dependency("AtlasLabRuntime");
    const graphRuntime = dependency("AtlasGraphLabRuntime");
    const documentRef = rootElement.ownerDocument;
    const shell = runtime.createShell(rootElement, {
      title: "Один ориентированный граф — четыре взгляда",
      description: "Редактируйте дуги, затем проследите очередь нулевых степеней, стек DFS, low-link и конденсацию по одному синхронному состоянию",
    });
    rootElement.classList.add("atlas-graph-lab");

    const mode = element(documentRef, "select", { id: slug + "-mode" });
    mode.append(
      option(documentRef, "topological", "Топологический порядок"),
      option(documentRef, "scc", "Сильные компоненты")
    );
    const algorithm = element(documentRef, "select", { id: slug + "-algorithm" });
    const preset = element(documentRef, "select", { id: slug + "-preset" });
    Object.entries(core.PRESETS).forEach(function (entry) {
      preset.append(option(documentRef, entry[0], entry[1].title));
    });
    const edgeInput = element(documentRef, "input", {
      id: slug + "-edges",
      type: "text",
      inputmode: "text",
      autocomplete: "off",
      spellcheck: "false",
      value: core.PRESETS.uniqueDag.edgeList,
      "aria-describedby": slug + "-edge-help",
    });
    const edgeHelp = element(documentRef, "small", { id: slug + "-edge-help" },
      "Формат: A>B, B>C; отдельная вершина — A. Не больше 24 вершин и 96 дуг"
    );
    const edgeField = field(documentRef, "Вершины и дуги", edgeInput, true);
    edgeField.appendChild(edgeHelp);
    const apply = element(documentRef, "button", { type: "submit", class: "is-primary" }, "Применить граф");
    shell.controls.append(
      field(documentRef, "Задача", mode),
      field(documentRef, "Алгоритм", algorithm),
      field(documentRef, "Пример", preset),
      edgeField,
      apply
    );

    const mainFigure = runtime.createFigure(shell.workspace, {
      id: slug + "-graph",
      title: "Текущее состояние ориентированного графа",
      viewBox: "0 0 920 540",
      className: "atlas-graph-lab__main",
    });
    const condensationFigure = runtime.createFigure(shell.workspace, {
      id: slug + "-condensation",
      title: "Конденсация сильных компонент",
      viewBox: "0 0 920 360",
      className: "atlas-graph-lab__condensation",
    });
    condensationFigure.figure.hidden = true;

    const metrics = element(documentRef, "dl", { class: "atlas-lab__metrics" });
    const metricNodes = {};
    [
      ["phase", "Стадия"],
      ["frontier", "Очередь или стек"],
      ["result", "Промежуточный результат"],
      ["claim", "Что уже установлено"],
    ].forEach(function (entry) {
      const wrapper = element(documentRef, "div");
      wrapper.append(
        element(documentRef, "dt", {}, entry[1]),
        element(documentRef, "dd", { "data-metric": entry[0] }, "—")
      );
      metricNodes[entry[0]] = wrapper.querySelector("dd");
      metrics.appendChild(wrapper);
    });
    shell.workspace.appendChild(metrics);

    const detailPanel = element(documentRef, "section", { class: "atlas-lab__panel" });
    detailPanel.appendChild(element(documentRef, "h4", {}, "Состояние по вершинам"));
    const tableWrap = element(documentRef, "div", {
      class: "atlas-lab__table-wrap",
      tabindex: "0",
      "aria-label": "Таблица состояния вершин",
    });
    const table = element(documentRef, "table");
    tableWrap.appendChild(table);
    detailPanel.appendChild(tableWrap);
    shell.workspace.appendChild(detailPanel);

    let mainController = null;
    let condensationController = null;
    let transportController = null;
    let currentRun = null;
    let focusedNode = null;

    function algorithmsForMode() {
      if (mode.value === "topological") {
        replaceOptions(algorithm, [
          { value: "kahn", label: "Кан: очередь нулевых степеней" },
          { value: "dfs", label: "DFS: обратный выход" },
        ], algorithm.value === "dfs" ? "dfs" : "kahn");
      } else {
        replaceOptions(algorithm, [
          { value: "tarjan", label: "Тарьян: index и low-link" },
          { value: "kosaraju", label: "Косарайю—Шарир: два прохода" },
        ], algorithm.value === "kosaraju" ? "kosaraju" : "tarjan");
      }
    }

    function createRun() {
      const parsed = core.parseEdgeList(edgeInput.value);
      currentRun = core.buildRun(parsed, mode.value, algorithm.value);
      return currentRun;
    }

    function stateWithPlayback(state, playback) {
      return Object.freeze({
        mode: state.mode,
        algorithm: state.algorithm,
        graph: state.graph,
        result: state.result,
        playback: playback,
      });
    }

    function classesForNode(frame, node) {
      const classes = [];
      if (frame.activeNode === node.id) classes.push("is-active");
      if ((frame.order || []).includes(node.id) ||
          (frame.colors && frame.colors[node.id] === "black") ||
          componentIndex(frame, node.id) >= 0) {
        classes.push("is-visited");
      }
      if ((frame.queue || []).includes(node.id) ||
          (frame.stack || []).includes(node.id) ||
          (frame.onStack || []).includes(node.id) ||
          (frame.colors && frame.colors[node.id] === "gray")) {
        classes.push("is-candidate");
      }
      if (frame.phase === "cycle" && frame.indegree && frame.indegree[node.id] > 0) {
        classes.push("is-rejected");
      }
      if (focusedNode && focusedNode !== node.id) classes.push("is-dimmed");
      return classes.join(" ");
    }

    function classesForEdge(frame, edge) {
      const classes = [];
      if (frame.activeEdge === edge.id) classes.push("is-active");
      if ((frame.removedEdges || []).includes(edge.id)) classes.push("is-visited");
      if (frame.phase === "cycle" && frame.indegree &&
          frame.indegree[edge.source] > 0 && frame.indegree[edge.target] > 0) {
        classes.push("is-rejected");
      }
      return classes.join(" ");
    }

    function renderTable(state, frame, shownGraph) {
      table.replaceChildren();
      const head = element(documentRef, "thead");
      const headerRow = element(documentRef, "tr");
      const headers = state.mode === "topological"
        ? ["Вершина", "Входящая степень", "Состояние"]
        : ["Вершина", "index", "low-link", "В стеке", "Компонента"];
      headers.forEach(function (header) { headerRow.appendChild(makeCell(documentRef, "th", header)); });
      head.appendChild(headerRow);
      const body = element(documentRef, "tbody");
      shownGraph.nodes.forEach(function (node) {
        const row = element(documentRef, "tr", frame.activeNode === node.id ? { class: "is-current" } : {});
        row.appendChild(makeCell(documentRef, "th", node.label));
        if (state.mode === "topological") {
          const degree = frame.indegree && frame.indegree[node.id] !== undefined
            ? frame.indegree[node.id]
            : "—";
          let status = "ожидает";
          if ((frame.order || []).includes(node.id)) status = "выведена";
          else if ((frame.queue || []).includes(node.id)) status = "в очереди";
          else if (frame.colors && frame.colors[node.id] === "gray") status = "в стеке DFS";
          else if (frame.colors && frame.colors[node.id] === "black") status = "завершена";
          row.append(makeCell(documentRef, "td", degree), makeCell(documentRef, "td", status));
        } else {
          const index = frame.indices && frame.indices[node.id] !== undefined ? frame.indices[node.id] : "—";
          const low = frame.lowlink && frame.lowlink[node.id] !== undefined ? frame.lowlink[node.id] : "—";
          const component = componentIndex(frame, node.id);
          row.append(
            makeCell(documentRef, "td", index),
            makeCell(documentRef, "td", low),
            makeCell(documentRef, "td", (frame.onStack || frame.stack || []).includes(node.id) ? "да" : "нет"),
            makeCell(documentRef, "td", component >= 0 ? "C" + String(component + 1) : "—")
          );
        }
        body.appendChild(row);
      });
      table.append(head, body);
    }

    function claimFor(state, frame) {
      if (frame.phase === "cycle" || frame.phase === "failed") return "DAG отсутствует";
      if (frame.phase !== "done") return "выполняется конечный шаг";
      if (state.mode === "topological") {
        if (state.result.hasCycle) return "топологического порядка нет";
        if (state.result.unique === true) return "порядок единственный";
        if (state.result.unique === false) return "существует несколько порядков";
        return "получен допустимый порядок";
      }
      return "конденсация ациклична";
    }

    function render(state, context) {
      const frame = state.playback.current;
      const shownGraph = state.algorithm === "kosaraju" && frame.transposed
        ? state.result.transpose
        : state.graph;
      const options = {
        title: state.mode === "topological"
          ? "Топологическая сортировка ориентированного графа"
          : "Поиск сильных компонент ориентированного графа",
        description: frame.message,
        layout: {
          type: state.mode === "topological" && !state.result.hasCycle ? "layers" : "circle",
          width: 920,
          height: 540,
          padding: 76,
        },
        nodeClass: function (node) { return classesForNode(frame, node); },
        edgeClass: function (edge) { return classesForEdge(frame, edge); },
        nodeAriaLabel: function (node) {
          return "Вершина " + node.label + ". " +
            (classesForNode(frame, node).replace(/is-/g, "").replace(/-/g, " ") || "ожидает обработки");
        },
        onNodeFocus: function (node) {
          focusedNode = node.id;
          mainFigure.caption.textContent = "Выбрана вершина " + node.label + ". " + frame.message;
        },
        onNodeActivate: function (node) {
          focusedNode = focusedNode === node.id ? null : node.id;
          if (mainController) mainController.update(shownGraph, options);
        },
        preserveView: true,
      };
      if (!mainController) mainController = graphRuntime.mount(mainFigure.svg, shownGraph, options);
      else mainController.update(shownGraph, options);
      mainFigure.caption.textContent = frame.message;

      metricNodes.phase.textContent = frame.phase;
      metricNodes.frontier.textContent = (frame.queue || []).length
        ? "очередь: " + frame.queue.join(", ")
        : (frame.stack || []).length
          ? "стек: " + frame.stack.join(" → ")
          : "пусто";
      metricNodes.result.textContent = state.mode === "topological"
        ? ((frame.order || []).join(" → ") || "порядок ещё пуст")
        : ((frame.components || []).map(function (component) {
          return "{" + component.join(",") + "}";
        }).join(" ") || "компоненты ещё не закрыты");
      metricNodes.claim.textContent = claimFor(state, frame);
      renderTable(state, frame, shownGraph);

      const showCondensation = state.mode === "scc" && frame.phase === "done";
      condensationFigure.figure.hidden = !showCondensation;
      if (showCondensation) {
        const condensationOptions = {
          title: "Конденсация сильных компонент",
          description: "Каждая вершина представляет одну сильную компоненту; ориентированных циклов нет.",
          layout: { type: "layers", width: 920, height: 360, padding: 76 },
          preserveView: true,
        };
        if (!condensationController) {
          condensationController = graphRuntime.mount(
            condensationFigure.svg,
            state.result.condensation,
            condensationOptions
          );
        } else {
          condensationController.update(state.result.condensation, condensationOptions);
        }
        condensationFigure.caption.textContent =
          "Компоненты сжаты в вершины; повторные межкомпонентные дуги объединены.";
      }
      if (!context.running) context.announce(frame.message);
    }

    algorithmsForMode();
    transportController = runtime.mount(rootElement, {
      maxAutomaticSteps: 700,
      createState: createRun,
      step: function (state) {
        return stateWithPlayback(state, shared.playbackStep(state.playback));
      },
      isFinished: function (state) { return shared.playbackIsFinished(state.playback); },
      render: render,
    });

    shell.controls.addEventListener("submit", function (event) {
      event.preventDefault();
      try {
        focusedNode = null;
        transportController.clearError();
        transportController.setState(createRun(), "Новый граф разобран; алгоритм возвращён к первому кадру.");
      } catch (error) {
        transportController.showError(error.message);
      }
    });
    mode.addEventListener("change", function () {
      algorithmsForMode();
      if (mode.value === "scc" && preset.value !== "scc") {
        preset.value = "scc";
        edgeInput.value = core.PRESETS.scc.edgeList;
      } else if (mode.value === "topological" && preset.value === "scc") {
        preset.value = "uniqueDag";
        edgeInput.value = core.PRESETS.uniqueDag.edgeList;
      }
      shell.controls.requestSubmit();
    });
    algorithm.addEventListener("change", function () { shell.controls.requestSubmit(); });
    preset.addEventListener("change", function () {
      edgeInput.value = core.PRESETS[preset.value].edgeList;
      shell.controls.requestSubmit();
    });
  }

  dependency("AtlasLabRuntime").boot(slug, initialize);
})(typeof globalThis !== "undefined" ? globalThis : this);
