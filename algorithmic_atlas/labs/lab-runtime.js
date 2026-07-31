(function (root) {
  "use strict";

  function button(action, label) {
    const element = document.createElement("button");
    element.type = "button";
    element.dataset.labAction = action;
    element.textContent = label;
    return element;
  }

  function populateTransport(container) {
    container.classList.add("atlas-lab__transport");
    const actions = document.createElement("div");
    actions.className = "atlas-lab__actions";
    actions.append(
      button("step", "Один шаг"),
      button("run", "Запустить"),
      button("pause", "Пауза"),
      button("reset", "К началу")
    );
    const speed = document.createElement("div");
    speed.className = "atlas-lab__speed";
    const label = document.createElement("label");
    const speedId = (container.closest("[data-atlas-lab]").dataset.atlasLab ||
      "atlas-lab") + "-speed";
    label.htmlFor = speedId;
    label.textContent = "Скорость";
    const input = document.createElement("input");
    input.id = speedId;
    input.type = "range";
    input.min = "1";
    input.max = "5";
    input.step = "1";
    input.value = "3";
    input.dataset.labSpeed = "";
    const output = document.createElement("output");
    output.htmlFor = speedId;
    output.dataset.labSpeedOutput = "";
    speed.append(label, input, output);
    container.append(actions, speed);
  }

  function createShell(rootElement, options) {
    const settings = options || {};
    const slug = rootElement.dataset.atlasLab || "atlas-lab";
    const titleId = slug + "-lab-title";
    rootElement.classList.add("atlas-lab");
    rootElement.setAttribute("role", "region");
    rootElement.setAttribute("aria-labelledby", titleId);
    rootElement.replaceChildren();

    const intro = document.createElement("div");
    intro.className = "atlas-lab__intro";
    const title = document.createElement("h3");
    title.id = titleId;
    title.textContent = settings.title || "Интерактивная лаборатория";
    const description = document.createElement("p");
    description.textContent = settings.description || "";
    intro.append(title, description);

    const controls = document.createElement("form");
    controls.className = "atlas-lab__controls";
    controls.dataset.labForm = "";
    controls.noValidate = true;
    const transport = document.createElement("div");
    transport.dataset.labTransport = "";
    const error = document.createElement("p");
    error.className = "atlas-lab__error";
    error.dataset.labError = "";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const status = document.createElement("p");
    status.className = "atlas-lab__status";
    status.dataset.labStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const workspace = document.createElement("div");
    workspace.className = "atlas-lab__workspace";
    workspace.dataset.labWorkspace = "";
    rootElement.append(intro, controls, transport, error, status, workspace);
    return Object.freeze({
      intro: intro,
      controls: controls,
      transport: transport,
      error: error,
      status: status,
      workspace: workspace,
    });
  }

  function createFigure(parent, options) {
    const settings = options || {};
    const figure = document.createElement("figure");
    figure.className = "atlas-lab__figure" +
      (settings.className ? " " + settings.className : "");
    const heading = document.createElement("h4");
    heading.textContent = settings.title || "Визуализация";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = settings.id || "atlas-lab-visual";
    svg.classList.add("atlas-lab__visual");
    svg.setAttribute("viewBox", settings.viewBox || "0 0 760 420");
    svg.setAttribute("tabindex", "0");
    const caption = document.createElement("figcaption");
    figure.append(heading, svg, caption);
    parent.appendChild(figure);
    return Object.freeze({ figure: figure, svg: svg, caption: caption });
  }

  function boot(slug, initializer) {
    function start() {
      const rootElement = document.querySelector(
        '[data-atlas-lab="' + slug + '"]'
      );
      if (rootElement) initializer(rootElement);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  function mount(rootElement, specification) {
    if (!rootElement || !rootElement.matches("[data-atlas-lab]")) {
      throw new Error("AtlasLabRuntime.mount requires a data-atlas-lab root");
    }
    const controls = root.AtlasLabControlsCore;
    if (!controls) {
      throw new Error("AtlasLabControlsCore is unavailable");
    }
    const transport = rootElement.querySelector("[data-lab-transport]");
    if (!transport) {
      throw new Error("lab transport container is missing");
    }
    if (!transport.children.length) {
      populateTransport(transport);
    }

    const elements = {
      step: transport.querySelector('[data-lab-action="step"]'),
      run: transport.querySelector('[data-lab-action="run"]'),
      pause: transport.querySelector('[data-lab-action="pause"]'),
      reset: transport.querySelector('[data-lab-action="reset"]'),
      speed: transport.querySelector("[data-lab-speed]"),
      speedOutput: transport.querySelector("[data-lab-speed-output]"),
      error: rootElement.querySelector("[data-lab-error]"),
      status: rootElement.querySelector("[data-lab-status]"),
    };
    const reducedMotion = root.matchMedia
      ? root.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    let state = null;
    let running = false;
    let timer = null;
    let automaticSteps = 0;
    let destroyed = false;
    const maxAutomaticSteps = Number.isInteger(specification.maxAutomaticSteps)
      ? specification.maxAutomaticSteps
      : 500;

    function speedModel() {
      return controls.speedModel(elements.speed.value);
    }

    function setStatus(message) {
      if (elements.status) {
        elements.status.textContent = message || "";
      }
    }

    function showError(message) {
      if (elements.error) {
        elements.error.textContent = message;
        elements.error.hidden = false;
      }
    }

    function clearError() {
      if (elements.error) {
        elements.error.textContent = "";
        elements.error.hidden = true;
      }
    }

    function context() {
      return Object.freeze({
        root: rootElement,
        running: running,
        reducedMotion: reducedMotion.matches,
        speed: speedModel(),
        motionDurationMs: controls.motionDurationMs(
          elements.speed.value,
          reducedMotion.matches
        ),
        announce: setStatus,
      });
    }

    function isFinished() {
      return state === null || (specification.isFinished
        ? Boolean(specification.isFinished(state))
        : false);
    }

    function updateControls() {
      elements.step.disabled = running || isFinished();
      elements.run.disabled = running || isFinished();
      elements.pause.disabled = !running;
      elements.reset.disabled = false;
      elements.speedOutput.textContent = speedModel().label;
      rootElement.dataset.labRunning = running ? "true" : "false";
    }

    function render() {
      if (state !== null) {
        specification.render(state, context());
      }
      updateControls();
    }

    function pause(message) {
      running = false;
      if (timer !== null) {
        root.clearTimeout(timer);
        timer = null;
      }
      updateControls();
      if (message) {
        setStatus(message);
      }
    }

    function applyStep(fromAutomatic) {
      if (state === null || isFinished()) {
        pause();
        return false;
      }
      try {
        clearError();
        const next = specification.step(state);
        if (next === undefined || next === null) {
          throw new Error("Лаборатория не вернула состояние следующего шага.");
        }
        state = next;
        render();
        if (isFinished()) {
          pause("Последний шаг выполнен. Можно вернуться к началу.");
        } else if (!fromAutomatic) {
          setStatus("Выполнен один шаг.");
        }
        return true;
      } catch (error) {
        pause();
        showError(error.message);
        return false;
      }
    }

    function schedule() {
      if (!running || destroyed) {
        return;
      }
      timer = root.setTimeout(function () {
        timer = null;
        if (!running) {
          return;
        }
        automaticSteps += 1;
        if (automaticSteps > maxAutomaticSteps) {
          pause("Автоматическое выполнение остановлено безопасным пределом шагов.");
          return;
        }
        if (applyStep(true) && running) {
          schedule();
        }
      }, speedModel().delayMs);
    }

    function run() {
      if (running || isFinished()) {
        return;
      }
      running = true;
      automaticSteps = 0;
      setStatus("Автоматическое выполнение запущено.");
      updateControls();
      schedule();
    }

    function reset() {
      pause();
      try {
        clearError();
        state = specification.createState();
        if (state === undefined || state === null) {
          throw new Error("Лаборатория не создала начальное состояние.");
        }
        render();
        setStatus("Начальное состояние восстановлено.");
      } catch (error) {
        state = null;
        showError(error.message);
        updateControls();
      }
    }

    function setState(nextState, message) {
      pause();
      state = nextState;
      clearError();
      render();
      if (message) {
        setStatus(message);
      }
    }

    function onVisibilityChange() {
      if (document.hidden && running) {
        pause("Выполнение приостановлено: вкладка стала неактивной.");
      }
    }

    elements.step.addEventListener("click", function () {
      pause();
      applyStep(false);
    });
    elements.run.addEventListener("click", run);
    elements.pause.addEventListener("click", function () {
      pause("Выполнение приостановлено. Текущее состояние сохранено.");
    });
    elements.reset.addEventListener("click", reset);
    elements.speed.addEventListener("input", function () {
      updateControls();
      if (running) {
        if (timer !== null) {
          root.clearTimeout(timer);
          timer = null;
        }
        schedule();
      }
    });
    document.addEventListener("visibilitychange", onVisibilityChange);

    const api = Object.freeze({
      reset: reset,
      run: run,
      pause: pause,
      step: function () { applyStep(false); },
      render: render,
      getState: function () { return state; },
      setState: setState,
      announce: setStatus,
      showError: showError,
      clearError: clearError,
      speedModel: speedModel,
      destroy: function () {
        destroyed = true;
        pause();
        document.removeEventListener("visibilitychange", onVisibilityChange);
      },
    });
    if (typeof specification.bind === "function") {
      specification.bind(api);
    }
    reset();
    return api;
  }

  root.AtlasLabRuntime = Object.freeze({
    mount: mount,
    populateTransport: populateTransport,
    createShell: createShell,
    createFigure: createFigure,
    boot: boot,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
