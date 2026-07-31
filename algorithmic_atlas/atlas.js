(function () {
  "use strict";

  const DATA_URL = "./data/atlas-graph.json";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const WORLD_VIEW_BOX = "0 0 1040 620";
  const TYPE_LABELS = {
    theory: "теория",
    algorithm: "алгоритм",
    math: "математический аппарат",
    interactive: "интерактив",
    historical: "исторический материал",
    exercise: "упражнение",
  };
  const ACCESS_LABELS = {
    "published-unlocked": "доступно",
    "published-gated": "закрыто последовательным маршрутом",
    planned: "запланировано",
  };
  const FREE_EXPLORE_HELP =
    "Открывает опубликованные главы без изменения прогресса. " +
    "Запланированные материалы остаются недоступны.";
  const FREE_EXPLORE_NO_TARGETS_HELP =
    "Все опубликованные главы уже доступны. Запланированные материки останутся в тумане";
  const UNSUPPORTED_PROGRESS_HELP =
    "Сохранённый прогресс создан более новой версией атласа и оставлен без изменений.";

  const elements = {};
  let core;
  let graph;
  let progress;
  let view = { kind: "world", continentId: null };
  let selectedId = null;
  let selectedKind = null;
  let detailAction = null;

  function init() {
    cacheElements();
    elements.retry.addEventListener("click", loadGraph);
    elements.worldBack.addEventListener("click", function () {
      renderWorld(true);
    });
    elements.freeExplore.addEventListener("click", toggleFreeExplore);
    elements.link.addEventListener("click", function (event) {
      if (!detailAction) {
        return;
      }
      event.preventDefault();
      detailAction();
    });

    core = window.AlgorithmicAtlasCore;
    if (!core) {
      showError(new Error("Atlas core is unavailable"));
      return;
    }
    loadGraph();
  }

  function cacheElements() {
    elements.svg = document.getElementById("atlas-map");
    elements.svgTitle = document.getElementById("atlas-map-svg-title");
    elements.svgDescription = document.getElementById("atlas-map-svg-description");
    elements.frame = document.getElementById("atlas-map-frame");
    elements.lands = document.getElementById("atlas-lands");
    elements.edges = document.getElementById("atlas-edges");
    elements.nodes = document.getElementById("atlas-nodes");
    elements.fog = document.getElementById("atlas-fog-layer");
    elements.error = document.getElementById("atlas-map-error");
    elements.retry = document.getElementById("atlas-retry");
    elements.progress = document.getElementById("atlas-progress");
    elements.progressText = document.getElementById("atlas-progress-text");
    elements.freeExplore = document.getElementById("atlas-free-explore");
    elements.freeExploreHelp = document.getElementById("atlas-free-explore-help");
    elements.mapKicker = document.getElementById("atlas-map-kicker");
    elements.mapTitle = document.getElementById("atlas-map-title");
    elements.mapHelp = document.getElementById("atlas-map-help");
    elements.continentProgress = document.getElementById("atlas-continent-progress");
    elements.worldBack = document.getElementById("atlas-world-back");
    elements.viewStatus = document.getElementById("atlas-view-status");
    elements.continentList = document.getElementById("atlas-continent-list");
    elements.detail = document.getElementById("atlas-node-detail");
    elements.region = document.getElementById("atlas-node-region");
    elements.title = document.getElementById("atlas-node-title");
    elements.description = document.getElementById("atlas-node-description");
    elements.typeRow = document.getElementById("atlas-node-type-row");
    elements.type = document.getElementById("atlas-node-type");
    elements.minutesRow = document.getElementById("atlas-node-minutes-row");
    elements.minutes = document.getElementById("atlas-node-minutes");
    elements.status = document.getElementById("atlas-node-status");
    elements.link = document.getElementById("atlas-node-link");
  }

  function loadGraph() {
    elements.error.hidden = true;
    elements.retry.disabled = true;
    fetch(DATA_URL, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (rawGraph) {
        graph = core.validateGraph(rawGraph);
        progress = core.loadProgress(getStorage(), graph);
        updateFreeExplore();
        updateProgress();
        renderWorld();
      })
      .catch(showError)
      .finally(function () {
        elements.retry.disabled = false;
      });
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function toggleFreeExplore() {
    if (!graph || !progress || progress.unsupported) {
      return;
    }
    progress.freeExplore = !progress.freeExplore;
    const saved = core.saveProgress(
      getStorage(),
      graph,
      progress.completedNodeIds,
      progress.freeExplore
    );
    if (!saved) {
      progress.persistent = false;
    }
    updateFreeExplore();
    if (view.kind === "continent") {
      const selectedNode = selectedKind === "node" ? selectedId : null;
      renderContinent(view.continentId);
      if (selectedNode) {
        selectNode(selectedNode, false);
      }
    } else {
      const selectedContinent = selectedKind === "continent" ? selectedId : null;
      renderWorld();
      if (selectedContinent) {
        selectContinent(selectedContinent, false);
      }
    }
  }

  function updateFreeExplore() {
    if (progress.unsupported) {
      elements.freeExplore.disabled = true;
      elements.freeExplore.setAttribute("aria-pressed", "false");
      elements.freeExplore.textContent = "Свободное исследование недоступно";
      elements.freeExplore.classList.remove("is-active");
      elements.freeExploreHelp.textContent = UNSUPPORTED_PROGRESS_HELP;
      return;
    }
    const hasTargets = hasFreeExploreTargets();
    elements.freeExplore.disabled = !hasTargets && !progress.freeExplore;
    elements.freeExplore.setAttribute("aria-pressed", String(progress.freeExplore));
    if (!hasTargets && !progress.freeExplore) {
      elements.freeExplore.textContent = "Свободное исследование не требуется";
    } else {
      elements.freeExplore.textContent = progress.freeExplore
        ? "Свободное исследование: включено"
        : "Свободное исследование: выключено";
    }
    elements.freeExplore.classList.toggle("is-active", progress.freeExplore);
    elements.freeExploreHelp.textContent = hasTargets
      ? FREE_EXPLORE_HELP
      : FREE_EXPLORE_NO_TARGETS_HELP;
  }

  function hasFreeExploreTargets() {
    const completed = progress.completedNodeIds;
    const continentCanChange = graph.continents.some(function (continent) {
      return core.continentAccessState(graph, continent, completed, false) ===
          "published-gated" &&
        core.continentAccessState(graph, continent, completed, true) ===
          "published-unlocked";
    });
    if (continentCanChange) {
      return true;
    }
    return graph.nodes.some(function (node) {
      return core.nodeAccessState(graph, node, completed, false) ===
          "published-gated" &&
        core.nodeAccessState(graph, node, completed, true) ===
          "published-unlocked";
    });
  }

  function clearMap() {
    elements.lands.replaceChildren();
    elements.edges.replaceChildren();
    elements.nodes.replaceChildren();
    elements.fog.replaceChildren();
    elements.error.hidden = true;
  }

  function renderWorld(focusView) {
    if (!graph) {
      return;
    }
    view = { kind: "world", continentId: null };
    selectedId = null;
    selectedKind = null;
    detailAction = null;
    clearMap();
    elements.lands.removeAttribute("aria-hidden");
    elements.svg.setAttribute("viewBox", WORLD_VIEW_BOX);
    elements.frame.dataset.mapView = "world";
    elements.mapKicker.textContent = "Карта мира";
    elements.mapTitle.textContent = "Все материки";
    elements.continentProgress.hidden = true;
    elements.worldBack.hidden = true;
    elements.continentList.hidden = false;
    elements.mapHelp.textContent =
      "Выберите материк мышью или клавишей Tab. Сплошная линия показывает основной " +
      "маршрут, пунктирная — дополнительную связь.";
    elements.svgTitle.textContent = "Карта мира алгоритмического атласа";
    elements.svgDescription.textContent =
      "Девять связанных материков. Опубликованный материал и запланированные области " +
      "различаются формой и текстовой меткой.";

    const byId = core.continentMap(graph);
    core.continentEdges(graph).forEach(function (edge) {
      const source = byId.get(edge.sourceId);
      const target = byId.get(edge.targetId);
      elements.edges.appendChild(renderEdge(
        source.worldPosition,
        target.worldPosition,
        edge.kind
      ));
    });

    graph.continents.forEach(function (continent) {
      renderContinentLand(continent);
      elements.nodes.appendChild(renderContinentMarker(continent));
    });
    renderMobileContinentList();

    const route = core.mainRoute(graph, "continents");
    const first = route
      ? core.routeOrder(graph, route.id)[0]
      : orderedWorldContinents()[0];
    selectContinent(first.id, false);
    announceView("Открыта карта всего Алгоритмического атласа");
    if (focusView) {
      focusMapView();
    }
  }

  function renderContinentLand(continent) {
    const state = core.continentAccessState(
      graph,
      continent,
      progress.completedNodeIds,
      progress.freeExplore
    );
    const pathData = worldLandPath(continent);
    elements.lands.appendChild(createSvg("path", {
      d: pathData,
      class: "atlas-world-land-shadow",
    }));
    const land = createSvg("path", {
      d: pathData,
      class: "atlas-world-land is-" + state,
      "data-continent-id": continent.id,
      tabindex: "0",
      role: "button",
      "aria-pressed": "false",
      "aria-label": continent.name + ". " +
        (core.continentCompleted(
          graph,
          continent.id,
          progress.completedNodeIds
        ) ? "пройдено" : ACCESS_LABELS[state]) + ".",
    });
    bindContinentControl(land, continent);
    elements.lands.appendChild(land);
    elements.lands.appendChild(createSvg("path", {
      d: pathData,
      class: "atlas-world-terrain",
      "aria-hidden": "true",
    }));
    if (state === "published-gated" || state === "planned") {
      elements.fog.appendChild(createSvg("path", {
        d: pathData,
        class: "atlas-fog atlas-world-fog " +
          (state === "planned" ? "is-development-fog" : "is-route-fog"),
        "aria-hidden": "true",
      }));
    }
  }

  function renderContinentMarker(continent) {
    const state = core.continentAccessState(
      graph,
      continent,
      progress.completedNodeIds,
      progress.freeExplore
    );
    const completed = core.continentCompleted(
      graph,
      continent.id,
      progress.completedNodeIds
    );
    const route = core.routeForContinent(graph, continent.id);
    const index = (route ? core.routeOrder(graph, route.id) : []).findIndex(function (item) {
      return item.id === continent.id;
    });
    const group = createSvg("g", {
      class: stateClasses("atlas-continent", state, completed),
      transform: "translate(" + continent.worldPosition.x + " " +
        continent.worldPosition.y + ")",
      "aria-hidden": "true",
      "data-atlas-continent-id": continent.id,
    });
    if (state === "planned") {
      group.appendChild(createSvg("rect", {
        class: "atlas-continent__marker",
        x: "-23",
        y: "-23",
        width: "46",
        height: "46",
        rx: "5",
      }));
    } else if (state === "published-gated") {
      group.appendChild(createSvg("path", {
        class: "atlas-continent__marker",
        d: "M0 -25 L25 0 L0 25 L-25 0 Z",
      }));
    } else {
      group.appendChild(createSvg("circle", {
        class: "atlas-continent__marker",
        r: "24",
      }));
    }
    const number = createSvg("text", {
      class: "atlas-continent__number",
      x: "0",
      y: "6",
    });
    number.textContent = completed
      ? "✓"
      : String(index + 1).padStart(2, "0");
    group.appendChild(number);

    const title = createSvg("text", {
      class: "atlas-continent__title",
      x: "0",
      y: String(continent.worldSize.height / 2 + 25),
    });
    const displayName = continent.shortName || continent.name;
    splitTitle(displayName, 22, 3).forEach(function (line, lineIndex) {
      const span = createSvg("tspan", {
        x: "0",
        dy: lineIndex === 0 ? "0" : "16",
      });
      span.textContent = line;
      title.appendChild(span);
    });
    group.appendChild(title);

    const status = createSvg("text", {
      class: "atlas-continent__status",
      x: "0",
      y: String(continent.worldSize.height / 2 + 35 +
        splitTitle(displayName, 22, 3).length * 16),
    });
    status.textContent = completed ? "пройдено" : shortAccessLabel(state);
    group.appendChild(status);

    group.addEventListener("click", function () {
      selectContinent(continent.id, true);
    });
    group.addEventListener("dblclick", function () {
      openContinentIfAvailable(continent);
    });
    return group;
  }

  function bindContinentControl(control, continent) {
    control.addEventListener("click", function () {
      selectContinent(continent.id, true);
    });
    control.addEventListener("dblclick", function () {
      openContinentIfAvailable(continent);
    });
    control.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (event.key === "Enter" &&
          selectedKind === "continent" &&
          selectedId === continent.id) {
        openContinentIfAvailable(continent);
        return;
      }
      selectContinent(continent.id, true);
    });
  }

  function orderedWorldContinents() {
    const ordered = [];
    const seen = new Set();
    graph.routes.filter(function (route) {
      return route.scope === "continents";
    }).sort(function (left, right) {
      if (left.kind !== right.kind) {
        return left.kind === "main" ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    }).forEach(function (route) {
      core.routeOrder(graph, route.id).forEach(function (continent) {
        if (!seen.has(continent.id)) {
          seen.add(continent.id);
          ordered.push(continent);
        }
      });
    });
    return ordered;
  }

  function renderMobileContinentList() {
    elements.continentList.replaceChildren();
    orderedWorldContinents().forEach(function (continent) {
      const state = core.continentAccessState(
        graph,
        continent,
        progress.completedNodeIds,
        progress.freeExplore
      );
      const completed = core.continentCompleted(
        graph,
        continent.id,
        progress.completedNodeIds
      );
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = stateClasses(
        "atlas-mobile-continent",
        state,
        completed
      );
      button.dataset.continentButtonId = continent.id;
      button.dataset.accessLabel = completed ? "пройдено" : ACCESS_LABELS[state];
      button.setAttribute("aria-pressed", "false");
      button.textContent = continent.name;
      button.addEventListener("click", function () {
        if (selectedKind === "continent" && selectedId === continent.id) {
          openContinentIfAvailable(continent);
        } else {
          selectContinent(continent.id, true);
        }
      });
      item.appendChild(button);
      elements.continentList.appendChild(item);
    });
  }

  function selectContinent(continentId, focusDetail) {
    const continent = core.continentMap(graph).get(continentId);
    if (!continent) {
      return;
    }
    selectedKind = "continent";
    selectedId = continentId;
    elements.nodes.querySelectorAll(".atlas-continent").forEach(function (element) {
      element.classList.toggle(
        "is-selected",
        element.dataset.atlasContinentId === continentId
      );
    });
    elements.lands.querySelectorAll(".atlas-world-land").forEach(function (element) {
      const selected = element.dataset.continentId === continentId;
      element.classList.toggle("is-selected", selected);
      element.setAttribute("aria-pressed", String(selected));
    });
    elements.continentList.querySelectorAll("[data-continent-button-id]")
      .forEach(function (element) {
        const selected = element.dataset.continentButtonId === continentId;
        element.classList.toggle("is-selected", selected);
        element.setAttribute("aria-pressed", String(selected));
      });

    const state = core.continentAccessState(
      graph,
      continent,
      progress.completedNodeIds,
      progress.freeExplore
    );
    const completed = core.continentCompleted(
      graph,
      continent.id,
      progress.completedNodeIds
    );
    const route = core.routeForContinent(graph, continent.id);
    const index = (route ? core.routeOrder(graph, route.id) : []).findIndex(function (item) {
      return item.id === continent.id;
    });
    elements.region.textContent = "Материк " + String(index + 1).padStart(2, "0");
    elements.title.textContent = continent.name;
    elements.description.textContent = continent.description;
    elements.typeRow.hidden = false;
    elements.type.textContent = "область знаний";
    elements.minutesRow.hidden = true;
    elements.status.textContent = completed ? "пройдено" : ACCESS_LABELS[state];

    const canOpen = state === "published-unlocked" &&
      graph.nodes.some(function (node) {
        return node.continentId === continent.id;
      });
    if (canOpen) {
      setDetailLink(
        "Открыть карту материка",
        "#continent-" + continent.id,
        function () {
          renderContinent(continent.id, true);
        }
      );
    } else if (state === "published-gated") {
      disableDetailLink("Сначала завершите предыдущий материк");
    } else {
      disableDetailLink("Материк запланирован");
    }
    showDetail(focusDetail);
  }

  function openContinentIfAvailable(continent) {
    const state = core.continentAccessState(
      graph,
      continent,
      progress.completedNodeIds,
      progress.freeExplore
    );
    if (state === "published-unlocked" && graph.nodes.some(function (node) {
      return node.continentId === continent.id;
    })) {
      renderContinent(continent.id, true);
    } else {
      selectContinent(continent.id, true);
    }
  }

  function renderContinent(continentId, focusView) {
    const continent = core.continentMap(graph).get(continentId);
    if (!continent || !continent.localMap) {
      return;
    }
    view = { kind: "continent", continentId: continentId };
    selectedId = null;
    selectedKind = null;
    detailAction = null;
    clearMap();
    elements.lands.setAttribute("aria-hidden", "true");
    elements.svg.setAttribute("viewBox", continent.localMap.viewBox);
    elements.frame.dataset.mapView = "continent";
    elements.mapKicker.textContent = "Локальная карта";
    elements.mapTitle.textContent = continent.name;
    const continentProgress = core.continentProgressSummary(
      graph,
      continentId,
      progress.completedNodeIds
    );
    elements.continentProgress.hidden = false;
    elements.continentProgress.textContent =
      "Ядро: " + continentProgress.coreCompleted + " / " +
      continentProgress.coreTotal + " · Ветвь: " +
      continentProgress.branchCompleted + " / " +
      continentProgress.branchTotal + " · Всего: " +
      continentProgress.completed + " / " + continentProgress.total +
      " · " + continentProgress.percent + "%";
    elements.worldBack.hidden = false;
    elements.continentList.hidden = true;
    elements.mapHelp.textContent =
      "Выберите точку мышью или клавишей Tab. Сплошная линия показывает обязательную " +
      "зависимость, пунктирная — дополнительную связь.";
    elements.svgTitle.textContent = "Карта материка «" + continent.name + "»";
    elements.svgDescription.textContent =
      "Опубликованные, закрытые последовательным маршрутом и запланированные главы " +
      "показаны разными формами и текстовыми метками.";

    elements.lands.appendChild(createSvg("path", {
      d: continent.localMap.landPath,
      class: "atlas-land-shadow",
    }));
    elements.lands.appendChild(createSvg("path", {
      d: continent.localMap.landPath,
      class: "atlas-land",
    }));
    elements.lands.appendChild(createSvg("path", {
      d: continent.localMap.landPath,
      class: "atlas-contours",
    }));

    const byId = core.nodeMap(graph);
    core.graphEdges(graph, continentId).forEach(function (edge) {
      const source = byId.get(edge.sourceId);
      const target = byId.get(edge.targetId);
      elements.edges.appendChild(renderEdge(source.position, target.position, edge.kind));
    });

    core.continentContinuations(graph, continentId).forEach(function (item) {
      elements.edges.appendChild(renderEdge(
        item.source.position,
        item.continuation.position,
        item.continuation.kind
      ));
      elements.nodes.appendChild(renderContinuation(item.continuation));
      elements.fog.appendChild(renderContinuationFog(item.continuation));
    });

    const nodes = core.visibleNodes(graph, continentId);
    nodes.forEach(function (node) {
      elements.nodes.appendChild(renderNode(node));
      const fog = renderNodeFog(node);
      if (fog) {
        elements.fog.appendChild(fog);
      }
    });
    const route = core.mainRoute(graph, "nodes", continentId);
    const first = route
      ? core.routeOrder(graph, route.id)[0]
      : core.topologicalOrder(graph).find(function (node) {
        return node.continentId === continentId;
      });
    if (first) {
      selectNode(first.id, false);
    }
    announceView("Открыта карта материка «" + continent.name + "»");
    if (focusView) {
      focusMapView();
    }
  }

  function renderNode(node) {
    const state = core.nodeAccessState(
      graph,
      node,
      progress.completedNodeIds,
      progress.freeExplore
    );
    const completed = progress.completedNodeIds.has(node.id);
    const group = createSvg("g", {
      class: stateClasses("atlas-node", state, completed),
      transform: "translate(" + node.position.x + " " + node.position.y + ")",
      tabindex: "0",
      role: state === "published-unlocked" ? "link" : "button",
      "aria-label": node.title + ". " +
        (completed ? "пройдено" : ACCESS_LABELS[state]) + ".",
      "data-atlas-node-id": node.id,
    });
    if (state === "planned") {
      group.appendChild(createSvg("rect", {
        class: "atlas-node__halo",
        x: "-35",
        y: "-35",
        width: "70",
        height: "70",
        rx: "8",
      }));
    } else if (state === "published-gated") {
      group.appendChild(createSvg("path", {
        class: "atlas-node__halo",
        d: "M0 -38 L38 0 L0 38 L-38 0 Z",
      }));
    } else {
      group.appendChild(createSvg("circle", {
        class: "atlas-node__halo",
        r: "37",
      }));
    }
    const number = createSvg("text", {
      class: "atlas-node__number",
      x: "0",
      y: "7",
    });
    number.textContent = completed ? "✓" : node.curriculumId;
    group.appendChild(number);

    const title = createSvg("text", {
      class: "atlas-node__title",
      x: "0",
      y: "61",
    });
    const lines = splitTitle(node.title, 23, 3);
    lines.forEach(function (line, lineIndex) {
      const span = createSvg("tspan", {
        x: "0",
        dy: lineIndex === 0 ? "0" : "17",
      });
      span.textContent = line;
      title.appendChild(span);
    });
    group.appendChild(title);

    const status = createSvg("text", {
      class: "atlas-node__status",
      x: "0",
      y: String(71 + lines.length * 17),
    });
    status.textContent = completed ? "пройдено" : shortAccessLabel(state);
    group.appendChild(status);

    group.addEventListener("click", function () {
      selectNode(node.id, true);
    });
    group.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (event.key === "Enter" &&
          state === "published-unlocked" &&
          selectedKind === "node" &&
          selectedId === node.id) {
        window.location.href = node.route;
        return;
      }
      selectNode(node.id, true);
    });
    return group;
  }

  function renderNodeFog(node) {
    const state = core.nodeAccessState(
      graph,
      node,
      progress.completedNodeIds,
      progress.freeExplore
    );
    if (state !== "published-gated" && state !== "planned") {
      return null;
    }
    return createSvg("circle", {
      class: "atlas-fog atlas-node-fog " +
        (state === "planned" ? "is-development-fog" : "is-route-fog"),
      cx: node.position.x,
      cy: node.position.y,
      r: state === "planned" ? "70" : "64",
      "aria-hidden": "true",
    });
  }

  function renderContinuation(continuation) {
    const group = createSvg("g", {
      class: "atlas-route-exit is-planned",
      transform: "translate(" + continuation.position.x + " " +
        continuation.position.y + ")",
      tabindex: "0",
      role: "img",
      "aria-label": continuation.title + ". Будущий переход " +
        (continuation.kind === "related" ? "по дополнительной ветви" :
          "основного маршрута") + ". Материал готовится.",
    });
    group.appendChild(createSvg("rect", {
      class: "atlas-route-exit__marker",
      x: "-36",
      y: "-36",
      width: "72",
      height: "72",
      rx: "8",
    }));
    const number = createSvg("text", {
      class: "atlas-route-exit__number",
      x: "0",
      y: "7",
    });
    number.textContent = continuation.curriculumId;
    group.appendChild(number);

    const title = createSvg("text", {
      class: "atlas-route-exit__title",
      x: "0",
      y: "61",
    });
    const lines = splitTitle(continuation.title, 23, 3);
    lines.forEach(function (line, lineIndex) {
      const span = createSvg("tspan", {
        x: "0",
        dy: lineIndex === 0 ? "0" : "17",
      });
      span.textContent = line;
      title.appendChild(span);
    });
    group.appendChild(title);

    const status = createSvg("text", {
      class: "atlas-route-exit__status",
      x: "0",
      y: String(71 + lines.length * 17),
    });
    status.textContent = "будущий переход";
    group.appendChild(status);
    return group;
  }

  function renderContinuationFog(continuation) {
    return createSvg("circle", {
      class: "atlas-fog atlas-node-fog is-development-fog",
      cx: continuation.position.x,
      cy: continuation.position.y,
      r: "72",
      "aria-hidden": "true",
    });
  }

  function selectNode(nodeId, focusDetail) {
    const node = core.nodeMap(graph).get(nodeId);
    if (!node) {
      return;
    }
    selectedKind = "node";
    selectedId = nodeId;
    elements.nodes.querySelectorAll(".atlas-node").forEach(function (element) {
      element.classList.toggle("is-selected", element.dataset.atlasNodeId === nodeId);
    });

    const continent = core.continentMap(graph).get(node.continentId);
    const region = continent.regions.find(function (item) {
      return item.id === node.regionId;
    });
    const state = core.nodeAccessState(
      graph,
      node,
      progress.completedNodeIds,
      progress.freeExplore
    );
    const completed = progress.completedNodeIds.has(node.id);
    elements.region.textContent = continent.name + " · " + region.name;
    elements.title.textContent = node.title;
    elements.description.textContent = node.description;
    elements.typeRow.hidden = false;
    elements.type.textContent = TYPE_LABELS[node.type];
    elements.minutesRow.hidden = false;
    elements.minutes.textContent = node.reading
      ? "Теория ≈ " + node.reading.theoryMinutes + " мин · Лаборатория ≈ " +
        node.reading.labMinutes + " мин"
      : node.minutes + " мин";
    elements.status.textContent = completed ? "пройдено" : ACCESS_LABELS[state];

    if (state === "published-unlocked") {
      setDetailLink("Открыть главу", node.route, null);
    } else if (state === "published-gated") {
      disableDetailLink("Сначала пройдите предыдущую главу");
    } else {
      disableDetailLink("Глава запланирована");
    }
    showDetail(focusDetail);
  }

  function setDetailLink(text, href, action) {
    detailAction = action;
    elements.link.classList.remove("is-disabled");
    elements.link.setAttribute("aria-disabled", "false");
    elements.link.textContent = text;
    elements.link.href = href;
    elements.link.removeAttribute("tabindex");
  }

  function disableDetailLink(text) {
    detailAction = null;
    elements.link.classList.add("is-disabled");
    elements.link.setAttribute("aria-disabled", "true");
    elements.link.textContent = text;
    elements.link.removeAttribute("href");
    elements.link.setAttribute("tabindex", "-1");
  }

  function showDetail(focusDetail) {
    elements.detail.hidden = false;
    if (focusDetail) {
      elements.detail.scrollIntoView({
        behavior: reducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }

  function updateProgress() {
    if (progress.unsupported) {
      elements.progress.max = 1;
      elements.progress.value = 0;
      elements.progress.textContent = "Версия прогресса не поддерживается";
      elements.progressText.textContent = UNSUPPORTED_PROGRESS_HELP;
      return;
    }
    const summary = core.progressSummary(graph, progress.completedNodeIds);
    elements.progress.max = Math.max(1, summary.total);
    elements.progress.value = summary.completed;
    elements.progress.textContent = summary.percent + "%";
    if (summary.total === 0) {
      elements.progressText.textContent = "Опубликованные главы пока не добавлены";
      return;
    }
    elements.progressText.textContent =
      summary.completed + " / " + summary.total + " · " + summary.percent +
      "% опубликованных глав";
  }

  function announceView(message) {
    elements.viewStatus.textContent = message;
  }

  function focusMapView() {
    elements.mapTitle.setAttribute("tabindex", "-1");
    elements.mapTitle.focus({ preventScroll: true });
    elements.mapTitle.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  function renderEdge(source, target, kind) {
    return createSvg("path", {
      d: edgePath(source, target, kind),
      class: "atlas-edge" +
        (kind === "related" ? " is-related" : "") +
        (kind === "branch" ? " is-branch" : ""),
    });
  }

  function showError(error) {
    console.error("Algorithmic atlas:", error);
    elements.error.hidden = false;
    elements.lands.replaceChildren();
    elements.nodes.replaceChildren();
    elements.edges.replaceChildren();
    elements.fog.replaceChildren();
    elements.detail.hidden = true;
    elements.progressText.textContent = "Карта временно недоступна";
  }

  function createSvg(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], entry[1]);
    });
    return element;
  }

  function edgePath(source, target, kind) {
    const dx = target.x - source.x;
    const direction = dx >= 0 ? -1 : 1;
    const curve = kind === "related" || kind === "branch"
      ? 52 * direction
      : 25 * direction;
    return [
      "M", source.x, source.y,
      "C", source.x + dx * 0.35, source.y + curve,
      target.x - dx * 0.35, target.y + curve,
      target.x, target.y,
    ].join(" ");
  }

  function worldLandPath(continent) {
    const x = continent.worldPosition.x;
    const y = continent.worldPosition.y;
    const halfWidth = continent.worldSize.width / 2;
    const halfHeight = continent.worldSize.height / 2;
    const variants = [
      [
        "M", x - halfWidth, y + halfHeight * 0.1,
        "C", x - halfWidth * 0.9, y - halfHeight * 0.7,
        x - halfWidth * 0.25, y - halfHeight,
        x + halfWidth * 0.2, y - halfHeight * 0.88,
        "C", x + halfWidth * 0.85, y - halfHeight * 0.75,
        x + halfWidth, y - halfHeight * 0.05,
        x + halfWidth * 0.78, y + halfHeight * 0.55,
        "C", x + halfWidth * 0.42, y + halfHeight,
        x - halfWidth * 0.55, y + halfHeight * 0.92,
        x - halfWidth, y + halfHeight * 0.1,
        "Z",
      ],
      [
        "M", x - halfWidth * 0.95, y - halfHeight * 0.35,
        "C", x - halfWidth * 0.4, y - halfHeight,
        x + halfWidth * 0.35, y - halfHeight * 0.92,
        x + halfWidth * 0.9, y - halfHeight * 0.25,
        "C", x + halfWidth, y + halfHeight * 0.45,
        x + halfWidth * 0.38, y + halfHeight,
        x - halfWidth * 0.28, y + halfHeight * 0.82,
        "C", x - halfWidth * 0.88, y + halfHeight * 0.62,
        x - halfWidth, y + halfHeight * 0.08,
        x - halfWidth * 0.95, y - halfHeight * 0.35,
        "Z",
      ],
      [
        "M", x - halfWidth, y,
        "C", x - halfWidth * 0.8, y - halfHeight * 0.72,
        x - halfWidth * 0.08, y - halfHeight,
        x + halfWidth * 0.58, y - halfHeight * 0.62,
        "C", x + halfWidth, y - halfHeight * 0.28,
        x + halfWidth * 0.92, y + halfHeight * 0.62,
        x + halfWidth * 0.28, y + halfHeight * 0.9,
        "C", x - halfWidth * 0.32, y + halfHeight,
        x - halfWidth * 0.9, y + halfHeight * 0.55,
        x - halfWidth, y,
        "Z",
      ],
      [
        "M", x - halfWidth * 0.82, y - halfHeight * 0.55,
        "C", x - halfWidth * 0.18, y - halfHeight,
        x + halfWidth * 0.62, y - halfHeight * 0.86,
        x + halfWidth, y - halfHeight * 0.08,
        "C", x + halfWidth * 0.76, y + halfHeight * 0.74,
        x + halfWidth * 0.05, y + halfHeight,
        x - halfWidth * 0.62, y + halfHeight * 0.7,
        "C", x - halfWidth, y + halfHeight * 0.28,
        x - halfWidth, y - halfHeight * 0.2,
        x - halfWidth * 0.82, y - halfHeight * 0.55,
        "Z",
      ],
    ];
    return variants[continent.shapeVariant].join(" ");
  }

  function stateClasses(base, state, completed) {
    return [
      base,
      "is-" + state,
      completed ? "is-completed" : "",
    ].filter(Boolean).join(" ");
  }

  function shortAccessLabel(state) {
    if (state === "published-unlocked") {
      return "доступно";
    }
    if (state === "published-gated") {
      return "по маршруту";
    }
    return "запланировано";
  }

  function splitTitle(title, maxLength, maxLines) {
    const words = title.split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach(function (word) {
      const candidate = current ? current + " " + word : word;
      if (candidate.length > maxLength && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) {
      lines.push(current);
    }
    if (lines.length <= maxLines) {
      return lines;
    }
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = visible[maxLines - 1].replace(/[.…]*$/, "") + "…";
    return visible;
  }

  function reducedMotion() {
    return window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  init();
})();
