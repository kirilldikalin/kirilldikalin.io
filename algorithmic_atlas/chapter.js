(function () {
  "use strict";

  const DATA_URL = "../data/atlas-graph.json";
  const NOTATION_DATA_URL = "../data/math-notations.json";
  const UNSUPPORTED_PROGRESS_MESSAGE =
    "Сохранённый прогресс создан более новой версией атласа и оставлен без изменений.";
  const TOC_CLOSE_DELAY_MS = 500;
  const TOC_PIN_MEDIA = "(min-width: 90rem)";
  const BLOCK_LABELS = {
    definition: "Определение",
    theorem: "Теорема",
    proof: "Доказательство",
    history: "Историческая справка",
    example: "Пример",
    lab: "Интерактивная лаборатория",
    warning: "Распространённая ошибка",
    exercises: "Упражнения",
    sources: "Источники",
  };

  const atlasCore = window.AlgorithmicAtlasCore;
  const chapterCore = window.AlgorithmicAtlasChapterCore;
  const body = document.body;
  const nodeId = body.dataset.atlasNodeId;
  let graph;
  let progress;

  function init() {
    labelBlocks();
    renderComputedStudyTime();
    initChapterInterface();

    if (!atlasCore || !nodeId) {
      return;
    }
    fetch(DATA_URL, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (rawGraph) {
        graph = atlasCore.validateGraph(rawGraph);
        progress = atlasCore.loadProgress(getStorage(), graph);
        renderRoute();
        renderCompletion();
        initNotationReferences();
      })
      .catch(function (error) {
        console.error("Atlas chapter:", error);
        const status = document.getElementById("atlas-chapter-progress-status");
        if (status) {
          status.textContent = "Не удалось загрузить маршрут. Текст главы доступен полностью.";
        }
      });
  }

  function renderComputedStudyTime() {
    const theoryOutput = document.querySelector("[data-atlas-reading-time]");
    if (!chapterCore || !theoryOutput) {
      return;
    }
    const content = document.querySelector(".atlas-chapter-content");
    if (!content) {
      return;
    }

    const excludedSelector = [
      '[data-atlas-block="lab"]',
      '[data-atlas-block="exercises"]',
      '[data-atlas-block="sources"]',
    ].join(",");
    const copy = content.cloneNode(true);
    copy.querySelectorAll(
      excludedSelector + ", .atlas-math, .atlas-block__label, script, style"
    ).forEach(function (element) {
      element.remove();
    });

    const includedFormulaBlocks = Array.from(
      content.querySelectorAll(".atlas-math")
    ).filter(function (element) {
      return !element.closest(excludedSelector);
    });
    const includedProofs = Array.from(
      content.querySelectorAll('[data-atlas-block="proof"], [data-reading-proof]')
    ).filter(function (element) {
      return !element.closest(excludedSelector);
    });
    const words = chapterCore.countWords(copy.textContent);
    const formulas = includedFormulaBlocks.length;
    const proofs = new Set(includedProofs).size;
    const minutes = chapterCore.theoryReadingMinutes(words, formulas, proofs);

    theoryOutput.textContent = "Теория ≈ " + minutes + " мин";
    theoryOutput.dataset.atlasTheoryWords = String(words);
    theoryOutput.dataset.atlasFormulaBlocks = String(formulas);
    theoryOutput.dataset.atlasProofBlocks = String(proofs);

    const labOutput = document.querySelector("[data-atlas-lab-time]");
    const labMinutes = Number(body.dataset.atlasLabMinutes);
    if (labOutput && Number.isInteger(labMinutes) && labMinutes > 0) {
      labOutput.textContent = "Лаборатория ≈ " + labMinutes + " мин";
    }
  }

  function labelBlocks() {
    document.querySelectorAll("[data-atlas-block]").forEach(function (block) {
      if (block.querySelector(":scope > .atlas-block__label")) {
        return;
      }
      const label = document.createElement("p");
      label.className = "atlas-block__label";
      label.textContent = BLOCK_LABELS[block.dataset.atlasBlock] || block.dataset.atlasBlock;
      block.prepend(label);
    });
  }

  function initChapterInterface() {
    const toc = document.querySelector(".atlas-chapter-toc");
    const content = document.querySelector(".atlas-chapter-content");
    if (!chapterCore || !toc || !content) {
      return;
    }

    const sectionRecords = Array.from(toc.querySelectorAll('a[href^="#"]'))
      .map(function (link) {
        const fragment = link.getAttribute("href").slice(1);
        const target = document.getElementById(decodeURIComponent(fragment));
        if (!fragment || !target) {
          return null;
        }
        return {
          id: target.id,
          label: link.textContent.trim(),
          link,
          target,
        };
      })
      .filter(Boolean);

    if (sectionRecords.length === 0) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tocController = enhanceTableOfContents(toc);
    const readingIndicator = createReadingIndicator();
    const sectionNavigation = createSectionNavigation();
    let sectionOffsets = [];
    let contentStart = 0;
    let contentEnd = 0;
    let activeIndex = -1;
    let scheduledFrame = 0;

    function motionBehavior() {
      return reducedMotion.matches ? "auto" : "smooth";
    }

    function updateHash(sectionId) {
      const hash = "#" + sectionId;
      if (window.location.hash === hash) {
        window.history.replaceState(null, "", hash);
      } else {
        window.history.pushState(null, "", hash);
      }
    }

    function focusAndScroll(record, updateLocation) {
      if (!record) {
        return;
      }
      if (updateLocation) {
        updateHash(record.id);
      }
      record.target.setAttribute("tabindex", "-1");
      record.target.focus({ preventScroll: true });
      record.target.scrollIntoView({
        behavior: motionBehavior(),
        block: "start",
      });
    }

    function scrollToPageStart() {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
      window.scrollTo({ top: 0, behavior: motionBehavior() });
    }

    function scrollToPageEnd() {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: motionBehavior(),
      });
    }

    function useNavigationTarget(target) {
      if (!target) {
        return;
      }
      if (target.kind === "page-start") {
        scrollToPageStart();
      } else if (target.kind === "page-end") {
        scrollToPageEnd();
      } else {
        focusAndScroll(sectionRecords[target.index], true);
      }
    }

    function setActiveSection(nextIndex) {
      if (nextIndex === activeIndex || nextIndex < 0) {
        return;
      }
      if (activeIndex >= 0) {
        sectionRecords[activeIndex].link.classList.remove("is-active");
        sectionRecords[activeIndex].link.removeAttribute("aria-current");
      }

      activeIndex = nextIndex;
      const activeRecord = sectionRecords[activeIndex];
      activeRecord.link.classList.add("is-active");
      activeRecord.link.setAttribute("aria-current", "location");

      const targets = chapterCore.sectionNavigation(activeIndex, sectionRecords.length);
      sectionNavigation.previous.dataset.targetKind = targets.previous.kind;
      sectionNavigation.next.dataset.targetKind = targets.next.kind;

      if (targets.previous.kind === "section") {
        sectionNavigation.previous.disabled = false;
        const previousLabel = sectionRecords[targets.previous.index].label;
        sectionNavigation.previous.title = "Предыдущий раздел: " + previousLabel;
        sectionNavigation.previous.setAttribute(
          "aria-label",
          "Предыдущий раздел: " + previousLabel
        );
      } else {
        sectionNavigation.previous.disabled = true;
        sectionNavigation.previous.title = "Предыдущего раздела нет";
        sectionNavigation.previous.setAttribute("aria-label", "Предыдущего раздела нет");
      }

      if (targets.next.kind === "section") {
        sectionNavigation.next.disabled = false;
        const nextLabel = sectionRecords[targets.next.index].label;
        sectionNavigation.next.title = "Следующий раздел: " + nextLabel;
        sectionNavigation.next.setAttribute("aria-label", "Следующий раздел: " + nextLabel);
      } else {
        sectionNavigation.next.disabled = true;
        sectionNavigation.next.title = "Следующего раздела нет";
        sectionNavigation.next.setAttribute("aria-label", "Следующего раздела нет");
      }
    }

    function refreshGeometry() {
      const scrollPosition = window.scrollY;
      sectionOffsets = sectionRecords.map(function (record) {
        return record.target.getBoundingClientRect().top + scrollPosition;
      });
      contentStart = sectionOffsets[0];
      contentEnd =
        sectionRecords[sectionRecords.length - 1].target.getBoundingClientRect().bottom +
        scrollPosition;
      scheduleUpdate();
    }

    function updateInterface() {
      scheduledFrame = 0;
      const scrollPosition = window.scrollY;
      const probePosition =
        scrollPosition + Math.min(180, Math.max(72, window.innerHeight * 0.24));
      setActiveSection(chapterCore.activeSectionIndex(sectionOffsets, probePosition));

      const readingProgress = chapterCore.readingProgress(
        scrollPosition,
        window.innerHeight,
        contentStart,
        contentEnd
      );
      const readingPercent = chapterCore.percentValue(readingProgress);
      readingIndicator.bar.style.transform = "scaleX(" + readingProgress + ")";
      readingIndicator.root.setAttribute("aria-valuenow", String(readingPercent));
      readingIndicator.root.setAttribute(
        "aria-valuetext",
        "Прочитано " + readingPercent + "%"
      );
    }

    function scheduleUpdate() {
      if (!scheduledFrame) {
        scheduledFrame = window.requestAnimationFrame(updateInterface);
      }
    }

    sectionRecords.forEach(function (record) {
      record.link.addEventListener("click", function (event) {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        tocController.closeAfterSelection();
        focusAndScroll(record, true);
      });
    });

    sectionNavigation.previous.addEventListener("click", function () {
      const targets = chapterCore.sectionNavigation(activeIndex, sectionRecords.length);
      if (targets.previous && targets.previous.kind === "section") {
        useNavigationTarget(targets.previous);
      }
    });
    sectionNavigation.next.addEventListener("click", function () {
      const targets = chapterCore.sectionNavigation(activeIndex, sectionRecords.length);
      if (targets.next && targets.next.kind === "section") {
        useNavigationTarget(targets.next);
      }
    });
    sectionNavigation.pageStart.addEventListener("click", scrollToPageStart);
    sectionNavigation.pageEnd.addEventListener("click", scrollToPageEnd);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", refreshGeometry, { passive: true });
    window.addEventListener("load", refreshGeometry, { once: true });

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(refreshGeometry);
      resizeObserver.observe(content);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refreshGeometry);
    }

    refreshGeometry();
  }

  function enhanceTableOfContents(toc) {
    const heading = toc.querySelector(":scope > h2");
    const list = toc.querySelector(":scope > ol");
    if (!heading || !list) {
      return {
        closeAfterSelection: function () {},
      };
    }

    const panelId = "atlas-chapter-toc-panel";
    toc.classList.add("is-enhanced");
    const toggle = document.createElement("button");
    toggle.className = "atlas-toc-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", panelId);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Открыть оглавление");
    toggle.innerHTML =
      '<span aria-hidden="true">В этой главе</span>' +
      '<span class="atlas-visually-hidden">Оглавление</span>';

    const panel = document.createElement("div");
    panel.className = "atlas-toc-panel";
    panel.id = panelId;
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;

    const panelHeader = document.createElement("div");
    panelHeader.className = "atlas-toc-panel__header";

    const pin = document.createElement("button");
    pin.className = "atlas-toc-pin";
    pin.type = "button";
    pin.setAttribute("aria-pressed", "false");
    pin.setAttribute("aria-label", "Закрепить оглавление раскрытым");
    pin.title = "Закрепить оглавление";
    pin.textContent = "Закрепить";

    const close = document.createElement("button");
    close.className = "atlas-toc-close";
    close.type = "button";
    close.setAttribute("aria-label", "Закрыть оглавление");
    close.title = "Закрыть оглавление";
    close.textContent = "×";

    panelHeader.append(heading, pin, close);
    panel.append(panelHeader, list);
    toc.replaceChildren(toggle, panel);

    const backdrop = document.createElement("div");
    backdrop.className = "atlas-toc-backdrop";
    backdrop.hidden = true;
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);

    let explicitlyOpen = false;
    let pinned = false;
    let pointerInside = false;
    let focusInside = false;
    let forceClosed = false;
    let closeTimer = 0;
    const pinMedia = window.matchMedia(TOC_PIN_MEDIA);

    function cancelCloseGuard() {
      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = 0;
      }
    }

    function scheduleCloseGuard() {
      cancelCloseGuard();
      closeTimer = window.setTimeout(function () {
        closeTimer = 0;
        pointerInside = false;
        render();
      }, TOC_CLOSE_DELAY_MS);
    }

    function isOpen() {
      return !forceClosed && (explicitlyOpen || pinned || pointerInside || focusInside);
    }

    function render() {
      if (!pinMedia.matches) {
        pinned = false;
      }
      const open = isOpen();
      toc.dataset.open = String(open);
      toc.dataset.pinned = String(pinned);
      pin.hidden = !pinMedia.matches;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Закрыть оглавление" : "Открыть оглавление");
      pin.setAttribute("aria-pressed", String(pinned));
      pin.textContent = pinned ? "Открепить" : "Закрепить";
      pin.setAttribute(
        "aria-label",
        pinned ? "Открепить оглавление" : "Закрепить оглавление раскрытым"
      );
      panel.setAttribute("aria-hidden", String(!open));
      panel.inert = !open;
      backdrop.hidden = !open;
      document.body.classList.toggle("atlas-toc-is-open", open);
    }

    function closeAndReturnFocus() {
      cancelCloseGuard();
      explicitlyOpen = false;
      pinned = false;
      pointerInside = false;
      focusInside = false;
      forceClosed = true;
      render();
      toggle.focus({ preventScroll: true });
    }

    toggle.addEventListener("click", function () {
      if (explicitlyOpen || pinned) {
        explicitlyOpen = false;
        pinned = false;
        focusInside = false;
        forceClosed = true;
      } else {
        forceClosed = false;
        explicitlyOpen = true;
      }
      render();
    });
    toggle.addEventListener("blur", function () {
      forceClosed = false;
    });

    pin.addEventListener("click", function () {
      if (!pinMedia.matches) {
        return;
      }
      if (pinned) {
        cancelCloseGuard();
        pinned = false;
        explicitlyOpen = false;
        pointerInside = false;
        focusInside = false;
        forceClosed = true;
        render();
        toggle.focus({ preventScroll: true });
        return;
      }
      forceClosed = false;
      pinned = true;
      explicitlyOpen = false;
      render();
    });
    close.addEventListener("click", closeAndReturnFocus);
    backdrop.addEventListener("click", closeAndReturnFocus);

    toc.addEventListener("mouseenter", function () {
      cancelCloseGuard();
      pointerInside = true;
      forceClosed = false;
      render();
    });
    toc.addEventListener("mouseleave", function () {
      scheduleCloseGuard();
    });
    toc.addEventListener("focusin", function () {
      cancelCloseGuard();
      if (!forceClosed) {
        focusInside = true;
        render();
      }
    });
    toc.addEventListener("focusout", function () {
      window.setTimeout(function () {
        focusInside = toc.contains(document.activeElement);
        render();
      }, 0);
    });

    function handlePinMediaChange() {
      if (!pinMedia.matches) {
        pinned = false;
      }
      render();
    }

    if (typeof pinMedia.addEventListener === "function") {
      pinMedia.addEventListener("change", handlePinMediaChange);
    } else if (typeof pinMedia.addListener === "function") {
      pinMedia.addListener(handlePinMediaChange);
    }

    document.addEventListener("pointerdown", function (event) {
      if (!pinned && explicitlyOpen && !toc.contains(event.target)) {
        explicitlyOpen = false;
        render();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen()) {
        event.preventDefault();
        closeAndReturnFocus();
      }
    });

    render();
    return {
      closeAfterSelection: function () {
        if (window.matchMedia("(max-width: 50rem)").matches && !pinned) {
          explicitlyOpen = false;
          focusInside = false;
          render();
        }
      },
    };
  }

  function createReadingIndicator() {
    const root = document.createElement("div");
    root.className = "atlas-reading-progress";
    root.setAttribute("role", "progressbar");
    root.setAttribute("aria-label", "Прогресс чтения этой главы");
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "100");
    root.setAttribute("aria-valuenow", "0");
    root.setAttribute("aria-valuetext", "Прочитано 0%");

    const bar = document.createElement("span");
    bar.className = "atlas-reading-progress__bar";
    bar.setAttribute("aria-hidden", "true");
    root.appendChild(bar);
    document.body.appendChild(root);
    return { root, bar };
  }

  function createSectionNavigation() {
    const root = document.createElement("nav");
    root.className = "atlas-section-nav";
    root.setAttribute("aria-label", "Навигация по разделам главы");

    const pageStart = document.createElement("button");
    pageStart.className =
      "atlas-section-nav__button atlas-section-nav__page atlas-section-nav__page-start";
    pageStart.type = "button";
    pageStart.textContent = "⇈";
    pageStart.title = "В начало страницы";
    pageStart.setAttribute("aria-label", "В начало страницы");

    const previous = document.createElement("button");
    previous.className = "atlas-section-nav__button";
    previous.type = "button";
    previous.textContent = "↑";
    previous.title = "Предыдущий раздел";
    previous.setAttribute("aria-label", "Предыдущий раздел");

    const next = document.createElement("button");
    next.className = "atlas-section-nav__button";
    next.type = "button";
    next.textContent = "↓";
    next.title = "Следующий раздел";
    next.setAttribute("aria-label", "Следующий раздел");

    const pageEnd = document.createElement("button");
    pageEnd.className =
      "atlas-section-nav__button atlas-section-nav__page atlas-section-nav__page-end";
    pageEnd.type = "button";
    pageEnd.textContent = "⇊";
    pageEnd.title = "В конец страницы";
    pageEnd.setAttribute("aria-label", "В конец страницы");

    root.append(pageStart, previous, next, pageEnd);
    document.body.appendChild(root);
    return { root, pageStart, previous, next, pageEnd };
  }

  function renderRoute() {
    const neighbors = atlasCore.routeNeighbors(graph, nodeId);
    const nextTargets = neighbors.nextAll.length
      ? neighbors.nextAll
      : [neighbors.next].filter(Boolean);
    renderRouteTargets(
      document.getElementById("atlas-route-previous"),
      neighbors.previousAll.length ? neighbors.previousAll : [neighbors.previous].filter(Boolean),
      "Назад"
    );
    if (nextTargets.length) {
      renderRouteTargets(
        document.getElementById("atlas-route-next"),
        nextTargets,
        "Дальше"
      );
      return;
    }
    const continuation = atlasCore.routeContinuation(graph, nodeId);
    if (continuation) {
      renderRouteContinuation(
        document.getElementById("atlas-route-next"),
        continuation
      );
      return;
    }
    if (!neighbors.continentExit) {
      renderRegionEnd(document.getElementById("atlas-route-next"));
      return;
    }
    renderAtlasTransition(
      document.getElementById("atlas-route-next"),
      nextContinent()
    );
  }

  function renderRegionEnd(container) {
    if (!container) {
      return;
    }
    container.replaceChildren();
    container.classList.remove("is-disabled");

    const eyebrow = document.createElement("span");
    eyebrow.className = "atlas-route-nav__direction";
    eyebrow.textContent = "Дальше";

    const mapLink = document.createElement("a");
    mapLink.href = "../index.html";
    mapLink.textContent = "Карта материка";

    const note = document.createElement("span");
    note.className = "atlas-route-nav__locked";
    note.textContent = "Конец области · выберите следующий маршрут на карте";
    container.append(eyebrow, mapLink, note);
  }

  function renderRouteContinuation(container, continuation) {
    if (!container) {
      return;
    }
    container.replaceChildren();
    container.classList.remove("is-disabled");

    const eyebrow = document.createElement("span");
    eyebrow.className = "atlas-route-nav__direction";
    eyebrow.textContent = continuation.kind === "related"
      ? "Будущая ветвь"
      : "Дальше";

    const mapLink = document.createElement("a");
    mapLink.href = "../index.html";
    mapLink.textContent = "Общая карта";

    const target = document.createElement("span");
    target.className = "atlas-route-nav__locked";
    target.textContent = continuation.curriculumId + " · " +
      continuation.title + " · готовится";

    container.append(eyebrow, mapLink, target);
  }

  function nextContinent() {
    const node = atlasCore.nodeMap(graph).get(nodeId);
    if (!node) {
      return null;
    }
    const route = atlasCore.routeForContinent(graph, node.continentId);
    if (!route) {
      return null;
    }
    const continents = atlasCore.routeOrder(graph, route.id);
    const index = continents.findIndex(function (continent) {
      return continent.id === node.continentId;
    });
    return index >= 0 && index < continents.length - 1
      ? continents[index + 1]
      : null;
  }

  function renderAtlasTransition(container, continent) {
    if (!container) {
      return;
    }
    container.replaceChildren();
    container.classList.remove("is-disabled");

    const eyebrow = document.createElement("span");
    eyebrow.className = "atlas-route-nav__direction";
    eyebrow.textContent = "Дальше";

    const mapLink = document.createElement("a");
    mapLink.href = "../index.html";
    mapLink.textContent = "Общая карта";

    container.append(eyebrow, mapLink);
    if (!continent) {
      return;
    }

    const continuation = document.createElement("span");
    continuation.className = "atlas-route-nav__locked";
    continuation.textContent = "Следующий материк: " + continent.name + (
      continent.publication === "planned" ? " · готовится" : ""
    );
    container.appendChild(continuation);
  }

  function renderRouteTargets(container, nodes, direction) {
    if (!container) {
      return;
    }
    container.replaceChildren();
    container.classList.remove("is-disabled");
    const eyebrow = document.createElement("span");
    eyebrow.className = "atlas-route-nav__direction";
    eyebrow.textContent = direction;
    container.appendChild(eyebrow);

    if (nodes.length === 0) {
      const text = document.createElement("span");
      text.textContent = direction === "Назад" ? "Начало маршрута" : "Конец маршрута";
      container.appendChild(text);
      container.classList.add("is-disabled");
      return;
    }

    appendRouteTarget(container, nodes[0]);
    if (nodes.length === 1) {
      return;
    }

    const alternativesLabel = document.createElement("span");
    alternativesLabel.className = "atlas-route-nav__alternatives-label";
    alternativesLabel.textContent = direction === "Назад"
      ? "Другие входящие ветви"
      : "Другие продолжения";
    container.appendChild(alternativesLabel);

    const alternatives = document.createElement("ul");
    alternatives.className = "atlas-route-nav__alternatives";
    nodes.slice(1).forEach(function (node) {
      const item = document.createElement("li");
      appendRouteTarget(item, node);
      alternatives.appendChild(item);
    });
    container.appendChild(alternatives);
  }

  function appendRouteTarget(container, node) {
    const accessState = atlasCore.nodeAccessState(
      graph,
      node,
      progress.completedNodeIds,
      progress.freeExplore
    );
    if (accessState === "published-unlocked") {
      const link = document.createElement("a");
      link.href = "../" + node.route.replace(/^\.\//, "");
      link.textContent = node.title;
      container.appendChild(link);
      return;
    }

    const text = document.createElement("span");
    text.className = "atlas-route-nav__locked";
    text.textContent = node.title + (
      accessState === "planned"
        ? " · готовится"
        : " · откроется после предыдущей главы"
    );
    container.appendChild(text);
  }

  function renderCompletion() {
    const button = document.getElementById("atlas-mark-complete");
    const status = document.getElementById("atlas-chapter-progress-status");
    if (!button || !status) {
      return;
    }
    if (progress.unsupported) {
      button.disabled = true;
      button.textContent = "Прогресс требует более новой версии атласа";
      button.setAttribute("aria-pressed", "false");
      status.textContent = UNSUPPORTED_PROGRESS_MESSAGE;
      return;
    }

    function update() {
      const completed = progress.completedNodeIds.has(nodeId);
      button.textContent = completed ? "Глава пройдена ✓" : "Отметить главу пройденной";
      button.setAttribute("aria-pressed", String(completed));
      status.textContent = completed
        ? "Отметка сохранена в этом браузере."
        : "Прогресс хранится только в этом браузере.";
    }

    button.addEventListener("click", function () {
      if (progress.completedNodeIds.has(nodeId)) {
        progress.completedNodeIds.delete(nodeId);
      } else {
        progress.completedNodeIds.add(nodeId);
      }
      const saved = atlasCore.saveProgress(
        getStorage(),
        graph,
        progress.completedNodeIds,
        progress.freeExplore
      );
      update();
      renderRoute();
      if (!saved) {
        status.textContent = "Отметка действует до закрытия страницы: хранилище браузера недоступно.";
      }
    });
    update();
  }

  function initNotationReferences() {
    const registryRequest = fetch(NOTATION_DATA_URL, {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      });
    const mathJaxReady =
      window.MathJax &&
      window.MathJax.startup &&
      window.MathJax.startup.promise
        ? window.MathJax.startup.promise
        : Promise.resolve();

    Promise.all([registryRequest, mathJaxReady])
      .then(function (results) {
        const registry = results[0];
        const entries = new Map(registry.entries.map(function (entry) {
          return [entry.id, entry];
        }));
        const triggers = Array.from(
          document.querySelectorAll("mjx-container .atlas-notation-token")
        ).filter(function (trigger) {
          if (trigger.closest("mjx-assistive-mml")) {
            return false;
          }
          const notationClass = Array.from(trigger.classList).find(function (name) {
            return name.indexOf("notation-id-") === 0;
          });
          if (!notationClass) {
            return false;
          }
          trigger.dataset.notationId = notationClass.slice("notation-id-".length);
          return true;
        });
        if (triggers.length === 0) {
          return;
        }
        enhanceNotationTriggers(triggers, entries);
      })
      .catch(function (error) {
        console.error("Atlas notation registry:", error);
      });
  }

  function enhanceNotationTriggers(triggers, entries) {
    const popover = createNotationPopover();
    let activeTrigger = null;
    let lockedOpen = false;
    let closeTimer = 0;
    let positionFrame = 0;
    let suppressFocusOpen = false;

    function cancelClose() {
      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = 0;
      }
    }

    function scheduleClose() {
      cancelClose();
      if (lockedOpen) {
        return;
      }
      closeTimer = window.setTimeout(function () {
        if (
          activeTrigger === document.activeElement ||
          popover.root.contains(document.activeElement)
        ) {
          return;
        }
        close(false);
      }, 140);
    }

    function position() {
      positionFrame = 0;
      if (!activeTrigger || popover.root.hidden) {
        return;
      }
      const margin = 8;
      const gap = 9;
      const triggerRect = activeTrigger.getBoundingClientRect();
      const popupRect = popover.root.getBoundingClientRect();
      const below = triggerRect.bottom + gap;
      const above = triggerRect.top - popupRect.height - gap;
      const top = below + popupRect.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, above);
      const idealLeft =
        triggerRect.left + triggerRect.width / 2 - popupRect.width / 2;
      const left = Math.min(
        window.innerWidth - popupRect.width - margin,
        Math.max(margin, idealLeft)
      );
      popover.root.style.left = Math.round(left) + "px";
      popover.root.style.top = Math.round(top) + "px";
    }

    function schedulePosition() {
      if (!positionFrame) {
        positionFrame = window.requestAnimationFrame(position);
      }
    }

    function definitionHref(entry) {
      const definitionNode = atlasCore.nodeMap(graph).get(
        entry.firstDefinition.chapterId
      );
      if (!definitionNode || !definitionNode.route) {
        return "#" + entry.firstDefinition.anchor;
      }
      return "./" +
        definitionNode.route.replace(/^\.\/chapters\//, "") +
        "#" + entry.firstDefinition.anchor;
    }

    function renderEntry(entry) {
      popover.title.textContent = entry.shortName;
      popover.explanation.textContent = entry.explanation;
      popover.details.textContent = entry.details || "";
      popover.details.hidden = !entry.details;
      popover.definition.href = definitionHref(entry);
      popover.definition.textContent = "Перейти к определению";
    }

    function open(trigger, entry, lock) {
      cancelClose();
      if (activeTrigger && activeTrigger !== trigger) {
        activeTrigger.setAttribute("aria-expanded", "false");
      }
      activeTrigger = trigger;
      lockedOpen = lock;
      renderEntry(entry);
      popover.root.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      schedulePosition();
    }

    function close(returnFocus) {
      cancelClose();
      lockedOpen = false;
      popover.root.hidden = true;
      const returnTarget = activeTrigger;
      if (returnTarget) {
        returnTarget.setAttribute("aria-expanded", "false");
      }
      activeTrigger = null;
      if (returnFocus && returnTarget) {
        suppressFocusOpen = true;
        returnTarget.focus({ preventScroll: true });
        window.setTimeout(function () {
          suppressFocusOpen = false;
        }, 0);
      }
    }

    triggers.forEach(function (trigger) {
      const entry = entries.get(trigger.dataset.notationId);
      if (!entry) {
        return;
      }
      trigger.setAttribute("role", "button");
      trigger.tabIndex = 0;
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.setAttribute("aria-controls", popover.root.id);
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute(
        "aria-label",
        "Показать объяснение: " + entry.shortName
      );

      trigger.addEventListener("pointerenter", function (event) {
        if (event.pointerType !== "touch") {
          open(trigger, entry, false);
        }
      });
      trigger.addEventListener("pointerleave", scheduleClose);
      trigger.addEventListener("focus", function () {
        if (!suppressFocusOpen) {
          open(trigger, entry, false);
        }
      });
      trigger.addEventListener("blur", scheduleClose);
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        if (activeTrigger === trigger && !popover.root.hidden && lockedOpen) {
          close(false);
          return;
        }
        open(trigger, entry, true);
      });
      trigger.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (activeTrigger === trigger && !popover.root.hidden && lockedOpen) {
            close(false);
          } else {
            open(trigger, entry, true);
          }
        }
      });
    });

    popover.root.addEventListener("pointerenter", cancelClose);
    popover.root.addEventListener("pointerleave", scheduleClose);
    popover.root.addEventListener("focusin", cancelClose);
    popover.root.addEventListener("focusout", scheduleClose);
    popover.close.addEventListener("click", function () {
      close(true);
    });
    document.addEventListener("pointerdown", function (event) {
      if (
        lockedOpen &&
        activeTrigger &&
        !activeTrigger.contains(event.target) &&
        !popover.root.contains(event.target)
      ) {
        close(false);
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !popover.root.hidden) {
        event.preventDefault();
        close(true);
      }
    });
    window.addEventListener("scroll", schedulePosition, { passive: true });
    window.addEventListener("resize", schedulePosition, { passive: true });
  }

  function createNotationPopover() {
    const root = document.createElement("aside");
    root.id = "atlas-notation-popover";
    root.className = "atlas-notation-popover";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Объяснение математического обозначения");
    root.hidden = true;

    const close = document.createElement("button");
    close.className = "atlas-notation-popover__close";
    close.type = "button";
    close.setAttribute("aria-label", "Закрыть объяснение");
    close.textContent = "×";

    const title = document.createElement("strong");
    title.className = "atlas-notation-popover__title";
    const explanation = document.createElement("p");
    explanation.className = "atlas-notation-popover__explanation";
    const details = document.createElement("p");
    details.className = "atlas-notation-popover__details";
    const definition = document.createElement("a");
    definition.className = "atlas-notation-popover__definition";

    root.append(close, title, explanation, details, definition);
    document.body.appendChild(root);
    return {
      root,
      close,
      title,
      explanation,
      details,
      definition,
    };
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  init();
})();
